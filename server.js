// server.js (Cleaned up - no webhooks, S3 triggers handle status updates)

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

const allowedOrigin = 'https://meek-alfajores-62357c.netlify.app';
const corsOptions = {
    origin: allowedOrigin,
    optionsSuccessStatus: 200 
};
app.use(cors(corsOptions));
app.use(express.json());

AWS.config.update({ region: process.env.AWS_REGION || 'us-west-2' });
const s3 = new AWS.S3();

// Ensure temp directory exists with proper permissions
const TMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    console.log(`✅ Created temp directory at: ${TMP_DIR}`);
}

// Helper function to download video
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
        return res.status(400).json({ success: false, error: 'Missing background video URL or videoId.' });
    }

    const outputFileName = `${videoId}-final-video.mp4`;
    const outputPath = path.join(TMP_DIR, outputFileName);
    const bgVideoPath = path.join(TMP_DIR, `${videoId}-bg.mp4`);

    try {
        // Double-check temp directory exists before each render
        if (!fs.existsSync(TMP_DIR)) {
            fs.mkdirSync(TMP_DIR, { recursive: true });
        }

        console.log(`Starting FFmpeg render for ${videoId}...`);
        console.log(`Output path: ${outputPath}`);
        console.log(`Downloading background video from: ${backgroundVideoUrl}`);
        
        // Download the background video
        await downloadFile(backgroundVideoUrl, bgVideoPath);
        console.log('Background video downloaded successfully');

        // Escape single quotes in title for FFmpeg
        const escapedTitle = title.replace(/'/g, "\\'");
        
        // FFmpeg Rendering
        const renderPromise = new Promise((resolve, reject) => {
            ffmpeg(bgVideoPath) 
                .videoCodec('libx264')
                .audioCodec('aac')
                .videoFilters(`drawtext=text='${escapedTitle}':fontsize=50:fontcolor=white:x=(w-text_w)/2:y=h-th-50:box=1:boxcolor=black@0.5:boxborderw=10`)
                .outputOptions('-pix_fmt yuv420p')
                .on('end', () => {
                    console.log('FFmpeg processing finished.');
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('FFmpeg error:', err.message);
                    reject(new Error(`FFmpeg failed: ${err.message}`));
                })
                .save(outputPath);
        });

        const finalVideoPath = await renderPromise;

        // S3 Upload - this triggers Lambda which calls Base44
        console.log('Uploading video to S3...');
        const fileStream = fs.createReadStream(finalVideoPath);
        
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME, 
            Key: outputFileName, // Must be {videoId}-final-video.mp4 for Lambda to parse
            Body: fileStream,
            ContentType: 'video/mp4',
            ACL: 'public-read'
        };
        
        const s3UploadResult = await s3.upload(uploadParams).promise(); 
        console.log('✅ S3 Upload Successful:', s3UploadResult.Location);
        console.log('✅ Lambda will now trigger and update Base44 status');

        // Cleanup
        fs.unlinkSync(finalVideoPath);
        fs.unlinkSync(bgVideoPath);

        res.json({ success: true, videoUrl: s3UploadResult.Location });

    } catch (e) {
        console.error('💥 Rendering Pipeline Fatal Error:', e.message);
        res.status(500).json({ success: false, error: `Video rendering failed: ${e.message}` });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Renderer server listening on ${HOST}:${PORT}`);
});
