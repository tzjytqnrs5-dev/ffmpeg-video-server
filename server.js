// server.js (The single file for your Railway Node.js renderer)

// Use modern 'import' syntax to fix the "require is not defined" error
import express from 'express';
import cors from 'cors';
import ffmpeg from 'fluent-ffmpeg';
import AWS from 'aws-sdk'; 
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================================
// 1. ⚙️ PORT CONFIG (Fixes "Service Unavailable" Health Check)
// ==========================================================
// MUST use the PORT environment variable provided by Railway.
const PORT = process.env.PORT || 8080; 
const HOST = '0.0.0.0'; 

const app = express();

// Middleware

// ==========================================================
// 🚨 CORS FIX: Explicitly configured to allow your Netlify domain
// ==========================================================
const allowedOrigin = 'https://meek-alfajores-62357c.netlify.app'; // <--- 🔑 YOUR DOMAIN IS HERE
const corsOptions = {
    origin: allowedOrigin,
    optionsSuccessStatus: 200 
};
app.use(cors(corsOptions)); // <--- Pass the explicit options

app.use(express.json());

// ==========================================================
// 2. 🔑 AWS CONFIG 
// ==========================================================
// AWS SDK automatically uses ENV variables for keys/secrets
AWS.config.update({ region: process.env.AWS_REGION || 'us-west-2' });
const s3 = new AWS.S3();

// Define a temporary directory for FFmpeg operations
const TMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR);
}


// --- HEALTH CHECK ENDPOINT (CRITICAL for Railway) ---
app.get('/health', (req, res) => {
    // This tells Railway the service is up and running.
    res.status(200).send('Renderer is Healthy');
});


// --- MAIN RENDERING ENDPOINT ---
app.post('/render', async (req, res) => {
    // This payload comes from your Base44/Deno function (the old index.js)
    const { title, backgroundVideoUrl, videoId } = req.body;

    if (!backgroundVideoUrl || !videoId) {
        return res.status(400).json({ success: false, error: 'Missing background video URL or videoId.' });
    }

    const outputFileName = `${videoId}-final-video.mp4`;
    const outputPath = path.join(TMP_DIR, outputFileName);
    const bgVideoPath = path.join(TMP_DIR, 'bg.mp4'); 

    try {
        console.log(`Starting FFmpeg render for ${videoId}...`);
        
        // --- STEP A: Download Background Video (YOU MUST IMPLEMENT THIS) ---
        // For production, you need robust streaming/download logic here.
        // For testing, ensure a placeholder file exists or use a local path.
        console.log(`Downloading background video from: ${backgroundVideoUrl}`);
        // Example: await downloadFile(backgroundVideoUrl, bgVideoPath); 
        // NOTE: If you are using a local testing setup, comment out the download and ensure bgVideoPath exists.

        
        // --- STEP B: FFmpeg Rendering Promise ---
        const renderPromise = new Promise((resolve, reject) => {
            // Placeholder: Assuming bgVideoPath now contains the downloaded video
            ffmpeg(bgVideoPath) 
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions([
                    `-vf drawtext=text='${title}':fontsize=50:fontcolor=white:x=(w-text_w)/2:y=h-th-50:box=1:boxcolor=black@0.5:boxborderw=10`,
                    '-pix_fmt yuv420p'
                ])
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


        // --- STEP C: S3 UPLOAD (The original failure point) ---
        console.log('Uploading video to S3...');
        const fileStream = fs.createReadStream(finalVideoPath);
        
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME, 
            Key: outputFileName,
            Body: fileStream,
            ContentType: 'video/mp4',
            ACL: 'public-read' // Only if you want public access
        };
        
        // The .promise() pattern ensures we await the upload
        const s3UploadResult = await s3.upload(uploadParams).promise(); 
        console.log('S3 Upload Successful:', s3UploadResult.Location);

        // Cleanup temporary files
        fs.unlinkSync(finalVideoPath);
        // fs.unlinkSync(bgVideoPath);

        // Respond with the S3 URL
        res.json({ success: true, videoUrl: s3UploadResult.Location });

    } catch (e) {
        console.error('💥 Rendering Pipeline Fatal Error:', e.message);
        // This will now catch the S3 Access Denied error (if it persists)
        res.status(500).json({ success: false, error: `Video rendering failed: ${e.message}` });
    }
});


// ==========================================================
// 5. 🚀 START SERVER
// ==========================================================
app.listen(PORT, HOST, () => {
    console.log(`Renderer server listening on ${HOST}:${PORT}`);
});
