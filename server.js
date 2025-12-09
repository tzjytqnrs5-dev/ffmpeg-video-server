// server.js (The file on your Railway Node.js service)

const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// ==========================================================
// 1. ⚙️ PORT CONFIG FIX (Addresses "Service Unavailable" Error)
// ==========================================================
// Railway provides the port via the PORT environment variable.
// Using this ensures your server listens on the correct, exposed port.
const PORT = process.env.PORT || 8080; 
// Listening on '0.0.0.0' ensures it is accessible by the container host/proxy.
const HOST = '0.0.0.0'; 

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // For parsing application/json from the Deno function

// ==========================================================
// 2. 🔑 AWS CONFIG (Addresses "S3 Access Denied" Error)
// ==========================================================
// The AWS SDK automatically looks for AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
// and AWS_REGION in your Railway environment variables.
AWS.config.update({ region: process.env.AWS_REGION || 'us-west-2' });
const s3 = new AWS.S3();

// Define a temporary directory for local file operations (FFmpeg needs files)
const TMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR);
}

// -----------------------------------------------------------------------
// HEALTH CHECK ENDPOINT
// This is critical for Railway's deployment success.
// -----------------------------------------------------------------------
app.get('/health', (req, res) => {
    // Simply return 200 OK to tell Railway the service is ready
    res.status(200).send('Renderer is Healthy');
});

// -----------------------------------------------------------------------
// MAIN RENDERING ENDPOINT
// This receives the payload from your Deno function (index.js)
// -----------------------------------------------------------------------
app.post('/render', async (req, res) => {
    const { topic, title, script, backgroundVideoUrl, videoId } = req.body;

    if (!backgroundVideoUrl || !script || !videoId) {
        return res.status(400).json({ success: false, error: 'Missing required video parameters.' });
    }

    const outputFileName = `${videoId}-final-video.mp4`;
    const outputPath = path.join(TMP_DIR, outputFileName);
    
    // NOTE: In a real app, you must first download the backgroundVideoUrl 
    // to a temporary file path before passing it to fluent-ffmpeg.

    try {
        console.log(`Starting FFmpeg render for ${videoId}...`);
        
        // ======================================================
        // 3. 🎥 FFmpeg Video Rendering Logic
        // This is a simplified placeholder
        // ======================================================
        
        // This example assumes you've downloaded the background video to './temp/bg.mp4'
        const bgVideoPath = path.join(TMP_DIR, 'bg.mp4'); 
        
        // Placeholder function to simulate download (MUST BE IMPLEMENTED)
        // await downloadFile(backgroundVideoUrl, bgVideoPath); 
        
        const renderPromise = new Promise((resolve, reject) => {
            ffmpeg(bgVideoPath) // Use the downloaded video path
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions([
                    // Add text overlay (Drawtext filter)
                    `-vf drawtext=fontfile=Arial.ttf:text='${title}':fontsize=50:fontcolor=white:x=(w-text_w)/2:y=h-th-50:box=1:boxcolor=black@0.5:boxborderw=10`,
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


        // ======================================================
        // 4. 📤 S3 UPLOAD LOGIC
        // This uploads the rendered video to S3.
        // ======================================================
        console.log('Uploading video to S3...');
        const fileStream = fs.createReadStream(finalVideoPath);
        
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME, // MUST be set in Railway variables
            Key: outputFileName,
            Body: fileStream,
            ContentType: 'video/mp4',
            ACL: 'public-read' // Only if you want public access
        };
        
        const s3UploadResult = await s3.upload(uploadParams).promise();
        console.log('S3 Upload Successful:', s3UploadResult.Location);

        // 5. Cleanup
        fs.unlinkSync(bgVideoPath);
        fs.unlinkSync(finalVideoPath);

        // 6. Respond with the S3 URL
        res.json({ success: true, videoUrl: s3UploadResult.Location });

    } catch (e) {
        console.error('Rendering Pipeline Error:', e.message);
        // This is where your "S3 upload failed: Access Denied" error comes from
        res.status(500).json({ success: false, error: `S3 upload failed: ${e.message}` });
    }
});

// ==========================================================
// 5. 🚀 START SERVER (Final Step to fix Health Check)
// ==========================================================
app.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
});
