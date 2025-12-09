// server.js (The file on your Railway Node.js service - NOW USING IMPORT SYNTAX)

import express from 'express';
import cors from 'cors';
import ffmpeg from 'fluent-ffmpeg';
import AWS from 'aws-sdk'; // Note: AWS SDK is often easier to import as a whole module
import fs from 'fs';
import path from 'path';

// ==========================================================
// 1. ⚙️ PORT CONFIG FIX (Addressed previously, still needed)
// ==========================================================
const PORT = process.env.PORT || 8080; 
const HOST = '0.0.0.0'; 

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); 

// ==========================================================
// 2. 🔑 AWS CONFIG 
// ==========================================================
AWS.config.update({ region: process.env.AWS_REGION || 'us-west-2' });
const s3 = new AWS.S3();

// Define a temporary directory for local file operations 
const TMP_DIR = path.join(path.resolve(), 'temp'); // Use path.resolve() for better compatibility
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR);
}

// -----------------------------------------------------------------------
// HEALTH CHECK ENDPOINT (Critical for Railway success)
// -----------------------------------------------------------------------
app.get('/health', (req, res) => {
    res.status(200).send('Renderer is Healthy');
});

// -----------------------------------------------------------------------
// MAIN RENDERING ENDPOINT
// -----------------------------------------------------------------------
app.post('/render', async (req, res) => {
    const { topic, title, script, backgroundVideoUrl, videoId } = req.body;

    if (!backgroundVideoUrl || !script || !videoId) {
        return res.status(400).json({ success: false, error: 'Missing required video parameters.' });
    }

    const outputFileName = `${videoId}-final-video.mp4`;
    const outputPath = path.join(TMP_DIR, outputFileName);
    
    // --- The rest of your rendering and S3 logic goes here ---

    try {
        console.log(`Starting FFmpeg render for ${videoId}...`);

        // Placeholder for downloading the video
        const bgVideoPath = path.join(TMP_DIR, 'bg.mp4'); 
        
        // You MUST implement the file download logic here
        // e.g. await fetch(backgroundVideoUrl).then(res => res.pipe(fs.createWriteStream(bgVideoPath)));

        const renderPromise = new Promise((resolve, reject) => {
             // ... FFmpeg definition remains similar but logic must be sound
            ffmpeg(bgVideoPath) 
                .videoCodec('libx264')
                .audioCodec('aac')
                // ... other options
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(new Error(`FFmpeg failed: ${err.message}`)))
                .save(outputPath);
        });

        const finalVideoPath = await renderPromise;
        
        // --- S3 UPLOAD LOGIC ---
        const fileStream = fs.createReadStream(finalVideoPath);
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME, 
            Key: outputFileName,
            Body: fileStream,
            ContentType: 'video/mp4',
            ACL: 'public-read' 
        };
        
        const s3UploadResult = await s3.upload(uploadParams).promise();
        
        // Cleanup and response
        fs.unlinkSync(finalVideoPath); 
        // fs.unlinkSync(bgVideoPath); // Clean up background file too
        
        res.json({ success: true, videoUrl: s3UploadResult.Location });

    } catch (e) {
        console.error('Rendering Pipeline Error:', e.message);
        res.status(500).json({ success: false, error: `Rendering failed: ${e.message}` });
    }
});

// ==========================================================
// 5. 🚀 START SERVER 
// ==========================================================
app.listen(PORT, HOST, () => {
    console.log(`Renderer server listening on ${HOST}:${PORT}`);
});
