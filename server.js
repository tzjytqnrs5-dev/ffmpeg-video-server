// server.js (Simplest version - just returns the video URL)

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

AWS.config.update({ region: process.env.AWS_REGION || 'us-west-2' });
const s3 = new AWS.S3();

const TMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

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
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const outputFileName = `${videoId}-final-video.mp4`;
    const outputPath = path.join(TMP_DIR, outputFileName);
    const bgVideoPath = path.join(TMP_DIR, `${videoId}-bg.mp4`);

    try {
        if (!fs.existsSync(TMP_DIR)) {
            fs.mkdirSync(TMP_DIR, { recursive: true });
        }

        console.log(`Rendering ${videoId}...`);
        
        await downloadFile(backgroundVideoUrl, bgVideoPath);
        
        const escapedTitle = title.replace(/'/g, "\\'");
        
        await new Promise((resolve, reject) => {
            ffmpeg(bgVideoPath) 
                .videoCodec('libx264')
                .audioCodec('aac')
                .videoFilters(`drawtext=text='${escapedTitle}':fontsize=50:fontcolor=white:x=(w-text_w)/2:y=h-th-50:box=1:boxcolor=black@0.5:boxborderw=10`)
                .outputOptions('-pix_fmt yuv420p')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });

        const fileStream = fs.createReadStream(outputPath);
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME, 
            Key: outputFileName,
            Body: fileStream,
            ContentType: 'video/mp4',
            ACL: 'public-read'
        };
        
        const s3Result = await s3.upload(uploadParams).promise(); 
        console.log('✅ Done:', s3Result.Location);

        fs.unlinkSync(outputPath);
        fs.unlinkSync(bgVideoPath);

        // Just return the URL - let frontend update Base44
        res.json({ 
            success: true, 
            videoUrl: s3Result.Location 
        });

    } catch (e) {
        console.error('Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
});
