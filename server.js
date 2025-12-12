// server.js - Complete and ready to deploy
import express from 'express';
import cors from 'cors';
import ffmpeg from 'fluent-ffmpeg';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const app = express();
app.use(cors()); // Allow all origins
app.use(express.json({ limit: '50mb' })); // Increase limit for base64
// AWS Configuration - REQUIRED ENV VARS:
// - S3_BUCKET_NAME (e.g., "videobuckettippy")
// - AWS_REGION (e.g., "us-east-2")
// - AWS_ACCESS_KEY_ID
// - AWS_SECRET_ACCESS_KEY
// - BASE44_URL (e.g., "https://your-base44-app.base44.app/functions/videoComplete")
// - BASE44_SERVICE_KEY
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-2' });
const s3 = new AWS.S3();
// Use /tmp directory which is writable on Railway
const TMP_DIR = '/tmp';
console.log(`✅ Using temp directory: ${TMP_DIR}`);
// Download file from URL
const downloadFile = (url, destPath) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
};
app.get('/health', (req, res) => {
    res.status(200).send('Renderer is Healthy');
});
app.post('/render', async (req, res) => {
    const { title, backgroundVideoUrl, videoId } = req.body;
    if (!backgroundVideoUrl || !videoId) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: backgroundVideoUrl and videoId'
        });
    }
    if (!process.env.S3_BUCKET_NAME || !process.env.BASE44_URL || !process.env.BASE44_SERVICE_KEY) {
        return res.status(500).json({
            success: false,
            error: 'Missing environment variables: S3_BUCKET_NAME, BASE44_URL, or BASE44_SERVICE_KEY'
        });
    }
    const outputFileName = `${videoId}-final-video.mp4`;
    const outputPath = path.join(TMP_DIR, outputFileName);
    const bgVideoPath = path.join(TMP_DIR, `${videoId}-bg.mp4`);
    try {
        console.log(`📹 Starting render for videoId: ${videoId}`);
        console.log(`📥 Downloading background video...`);
       
        // Download background video
        await downloadFile(backgroundVideoUrl, bgVideoPath);
        console.log(`✅ Background video downloaded`);
        // Escape single quotes for FFmpeg
        // Escape single quotes and wrap long text
        let escapedTitle = title ? title.replace(/'/g, "\\'") : '';
       
        // Wrap text at ~40 characters per line
        if (escapedTitle.length > 40) {
            const words = escapedTitle.split(' ');
            let lines = [];
            let currentLine = '';
           
            words.forEach(word => {
                if ((currentLine + ' ' + word).length > 40) {
                    lines.push(currentLine.trim());
                    currentLine = word;
                } else {
                    currentLine += (currentLine ? ' ' : '') + word;
                }
            });
            if (currentLine) lines.push(currentLine.trim());
           
            escapedTitle = lines.join('\\n');
        }
       
        console.log(`🎬 Running FFmpeg...`);
       
        // Render video with text overlay
        await new Promise((resolve, reject) => {
            const command = ffmpeg(bgVideoPath)
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions('-pix_fmt yuv420p')
                .on('end', () => {
                    console.log(`✅ FFmpeg finished`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error(`❌ FFmpeg error: ${err.message}`);
                    reject(err);
                });
            // Add text overlay if title provided
            if (escapedTitle) {
            // Calculate dynamic font size based on text length
                const textLength = escapedTitle.length;
                const fontSize = textLength > 50 ? 30 : textLength > 30 ? 40 : 50;
               
                command.videoFilters(
                    `drawtext=text='${escapedTitle}':fontsize=${fontSize}:fontcolor=white:x=if(gt(text_w\,w*0.9)\,(w-w*0.9)/2\,(w-text_w)/2):y=h-th-50:box=1:boxcolor=black@0.5:boxborderw=10`
                );
            }
            command.save(outputPath);
        });
        console.log(`📦 Converting to base64...`);
       
        // Read the video file and convert to base64
        const videoBuffer = fs.readFileSync(outputPath);
        const base64Video = videoBuffer.toString('base64');
        console.log(`✅ Base64 conversion complete (${(base64Video.length / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`☁️ Uploading to S3...`);
       
        // Upload to S3 (still keep this for backup/storage)
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: outputFileName,
            Body: videoBuffer,
            ContentType: 'video/mp4',
            ACL: 'public-read'
        };
       
        const s3Result = await s3.upload(uploadParams).promise();
        console.log(`✅ Upload complete: ${s3Result.Location}`);
        
        // Notify Base44
        console.log(`📤 Notifying Base44...`);
        await fetch(process.env.BASE44_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.BASE44_SERVICE_KEY}`
            },
            body: JSON.stringify({
                video_url: s3Result.Location,
                job_id: videoId
            })
        });
        console.log(`✅ Base44 notified`);

        // Cleanup temp files
        fs.unlinkSync(outputPath);
        fs.unlinkSync(bgVideoPath);
        console.log(`🧹 Cleaned up temp files`);
        // Return success with BOTH base64 and S3 URL
        res.json({
            success: true,
            videoUrl: s3Result.Location,
            videoBase64: base64Video,
            videoId: videoId
        });
    } catch (error) {
        console.error(`💥 Render failed for ${videoId}:`, error.message);
       
        // Cleanup on error
        try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            if (fs.existsSync(bgVideoPath)) fs.unlinkSync(bgVideoPath);
        } catch (cleanupError) {
            console.error('Cleanup error:', cleanupError.message);
        }
        res.status(500).json({
            success: false,
            error: error.message,
            videoId: videoId
        });
    }
});
app.listen(PORT, HOST, () => {
    console.log(`🚀 Renderer server running on ${HOST}:${PORT}`);
    console.log(`📦 S3 Bucket: ${process.env.S3_BUCKET_NAME || 'NOT SET'}`);
    console.log(`🌍 AWS Region: ${process.env.AWS_REGION || 'us-east-2'}`);
});
