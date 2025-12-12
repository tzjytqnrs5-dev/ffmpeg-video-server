// server.js (The single file for your Railway Node.js renderer)

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

const TMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR);
}

// Base44 Webhook URL
const BASE44_WEBHOOK_URL = 'https://693771fbef7c3625b50b34df.base44.app/api/functions/updateVideoStatus';

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
        console.log(`Starting FFmpeg render for ${videoId}...`);
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

        // S3 Upload
        console.log('Uploading video to S3...');
        const fileStream = fs.createReadStream(finalVideoPath);
        
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME, 
            Key: outputFileName,
            Body: fileStream,
            ContentType: 'video/mp4',
            ACL: 'public-read'
        };
        
        const s3UploadResult = await s3.upload(uploadParams).promise(); 
        console.log('S3 Upload Successful:', s3UploadResult.Location);

        // Call Base44 Webhook to Update Video Status
        console.log('Calling Base44 webhook to update video status...');
        try {
            const webhookResponse = await fetch(BASE44_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    videoId: videoId,
                    videoUrl: s3UploadResult.Location,
                    status: 'completed'
                }),
            });
            
            if (webhookResponse.ok) {
                console.log('✅ Base44 webhook called successfully');
            } else {
                console.error('⚠️ Base44 webhook failed with status:', webhookResponse.status);
            }
        } catch (webhookError) {
            console.error('⚠️ Failed to call Base44 webhook:', webhookError.message);
            // Continue anyway - video is already uploaded to S3
        }

        // Cleanup
        fs.unlinkSync(finalVideoPath);
        fs.unlinkSync(bgVideoPath);

        res.json({ success: true, videoUrl: s3UploadResult.Location });

    } catch (e) {
        console.error('💥 Rendering Pipeline Fatal Error:', e.message);
        
        // Try to update video status to failed
        try {
            await fetch(BASE44_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoId: videoId,
                    videoUrl: '',
                    status: 'failed'
                }),
            });
        } catch (webhookError) {
            console.error('Failed to call failure webhook:', webhookError.message);
        }
        
        res.status(500).json({ success: false, error: `Video rendering failed: ${e.message}` });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Renderer server listening on ${HOST}:${PORT}`);
});
