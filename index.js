// index.js (Railway Backend Service)

const express = require('express');
const { exec } = require('child_process');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON body
app.use(express.json());

// --- AWS S3 Configuration ---
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME; // Your 'videobuckettippy'
const AWS_REGION = process.env.AWS_REGION || 'us-east-2'; // Verified as 'us-east-2'

// Initialize S3 client (using env vars AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY)
const s3 = new AWS.S3({
    region: AWS_REGION
});

// --- Utility Function to Upload to S3 ---
async function uploadToStorage(filePath, s3Key) {
    if (!S3_BUCKET_NAME) {
        throw new Error("S3_BUCKET_NAME is not set.");
    }

    const fileStream = fs.createReadStream(filePath);

    const params = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileStream,
        ContentType: 'video/mp4',
        // Now that Object Ownership is 'Object writer', ACL: 'public-read' should work
        ACL: 'public-read' 
    };

    try {
        console.log(`[Storage] Uploading to S3 key: ${s3Key}`);
        const s3Response = await s3.upload(params).promise();
        console.log(`[Storage] S3 Upload COMPLETE. Location: ${s3Response.Location}`);
        return s3Response.Location;
    } catch (error) {
        console.error(`[Storage] S3 upload failed:`, error.message);
        throw new Error(`S3 upload failed: ${error.message}`);
    }
}


// --- Main Render Endpoint ---
app.post('/render', async (req, res) => {
    const { topic, script, title, backgroundVideoUrl, videoId } = req.body;
    
    // Use a unique ID for the FFmpeg process and S3 path
    const renderId = uuidv4();
    
    // Temp path for rendered video
    const outputFilename = `output_${renderId}.mp4`;
    const outputPath = path.join('/tmp', outputFilename); 
    
    console.log(`[${renderId}] Render request received for topic: "${topic}"`);

    // --- 1. Define FFmpeg Command ---
    // NOTE: This is a placeholder command. You will need to customize the 
    // exact FFmpeg filters, text overlays, and audio settings for your template.
    // The key here is using the inputs and generating an output file.
    const ffmpegCommand = `
        ffmpeg -y -i "${backgroundVideoUrl}" -t 30 
        -vf "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${script}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=48:fontcolor=white:box=1:boxcolor=0x000000AA"
        -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p 
        ${outputPath}
    `.replace(/\s+/g, ' ').trim(); // Clean up command for execution

    try {
        // --- 2. Execute FFmpeg ---
        console.log(`[${renderId}] Executing FFmpeg...`);
        
        await new Promise((resolve, reject) => {
            exec(ffmpegCommand, { maxBuffer: 1024 * 50000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[${renderId}] FFmpeg Execution Error:`, error);
                    console.error(`[${renderId}] FFmpeg Stderr:`, stderr);
                    return reject(new Error(`FFmpeg failed: ${error.message}`));
                }
                console.log(`[${renderId}] FFmpeg command completed successfully.`);
                resolve();
            });
        });

        // --- 3. Upload to S3 ---
        const s3Key = `output/${videoId}/${outputFilename}`;
        const finalVideoUrl = await uploadToStorage(outputPath, s3Key);

        // --- 4. Clean up temporary file ---
        fs.unlinkSync(outputPath);
        console.log(`[${renderId}] Cleaned up temp file: ${outputPath}`);

        // --- 5. SUCCESS RESPONSE (The FIX!) ---
        // This sends the URL back to the waiting Base44 Deno function.
        return res.json({
            success: true,
            videoUrl: finalVideoUrl, 
            videoId: videoId,
            title: title
        });

    } catch (e) {
        console.error(`[${renderId}] Pipeline error:`, e.message);
        
        // Return error response
        return res.status(500).json({ 
            success: false, 
            error: e.message 
        });

    }
});


// --- Health Check / Root ---
app.get('/', (req, res) => {
    res.send('Video Rendering Service Running');
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
