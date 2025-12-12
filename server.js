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
app.use(express.json());

// AWS Configuration - REQUIRED ENV VARS:
// - S3_BUCKET_NAME (e.g., "videobuckettippy")
// - AWS_REGION (e.g., "us-east-2")
// - AWS_ACCESS_KEY_ID
// - AWS_SECRET_ACCESS_KEY
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

    if (!process.env.S3_BUCKET_NAME) {
        return res.status(500).json({ 
            success: false, 
            error: 'S3_BUCKET_NAME environment variable not set' 
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
        const escapedTitle = title ? title.replace(/'/g, "\\'") : '';
        
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
                command.videoFilters(
                    `drawtext=text='${escapedTitle}':fontsize=50:fontcolor=white:x=(w-text_w)/2:y=h-th-50:box=1:boxcolor=black@0.5:boxborderw=10`
                );
            }

            command.save(outputPath);
        });

        console.log(`☁️ Uploading to S3...`);
        
        // Upload to S3
        const fileStream = fs.createReadStream(outputPath);
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME, 
            Key: outputFileName,
            Body: fileStream,
            ContentType: 'video/mp4',
            ACL: 'public-read'
        };
        
        const s3Result = await s3.upload(uploadParams).promise(); 
        console.log(`✅ Upload complete: ${s3Result.Location}`);

        // Cleanup temp files
        fs.unlinkSync(outputPath);
        fs.unlinkSync(bgVideoPath);
        console.log(`🧹 Cleaned up temp files`);

        // Return success with video URL
        res.json({ 
            success: true, 
            videoUrl: s3Result.Location,
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
