import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import AWS from 'aws-sdk'; // <-- Required for S3 upload

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- S3 Configuration (Reads from Railway Secrets) ---
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

// --- UPLOAD FUNCTION: Replaces the temporary placeholder ---
/**
 * Uploads the video file to Amazon S3 and returns the public URL.
 */
async function uploadToStorage(buffer, fileName) {
    if (!S3_BUCKET_NAME) {
        throw new Error("S3_BUCKET_NAME environment variable is not set.");
    }
    
    // Create a unique S3 path for the video file
    const s3Path = `output/${crypto.randomBytes(4).toString('hex')}/${fileName}`;
    
    const params = {
        Bucket: S3_BUCKET_NAME,
        Key: s3Path,
        Body: buffer,
        ContentType: 'video/mp4',
        ACL: 'public-read' // Makes the file publicly accessible
    };

    console.log(`[Storage] Uploading to S3 key: ${s3Path}`);
    
    try {
        const data = await s3.upload(params).promise();
        console.log(`[Storage] S3 Upload COMPLETE. Location: ${data.Location}`);
        return data.Location; // The public URL
    } catch (error) {
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('[S3 CRITICAL FAILURE] AWS Error:', error.message);
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        throw new Error(`S3 upload failed: ${error.message}`);
    }
}
// --------------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Render endpoint
app.post('/render', async (req, res) => {
    const requestId = crypto.randomBytes(8).toString('hex');
    const tempDir = `/tmp/video-${requestId}`; 
    
    console.log(`[${requestId}] Render request received`);
    
    try {
        const { topic, headline, script } = req.body;
        
        if (!topic && !headline) {
            return res.status(400).json({ success: false, error: 'Topic or headline required' });
        }

        await fs.mkdir(tempDir, { recursive: true });
        
        const renderText = (script || headline || topic).substring(0, 100); 
        const outputPath = path.join(tempDir, 'output.mp4');
        
        // Simple FFmpeg command: solid color background with text
        const ffmpegCmd = `ffmpeg -f lavfi -i color=c=black:s=1080x1920:d=5 -t 5 \
            -vf "drawtext=text='${renderText.replace(/'/g, "\\'")}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
            -c:v libx264 -pix_fmt yuv420p -y "${outputPath}"`; 
        
        console.log(`[${requestId}] Executing FFmpeg...`);
        
        try {
            await execAsync(ffmpegCmd, { timeout: 30000 });
        } catch (execError) {
            if (execError.message && execError.message.includes('not found')) {
                throw new Error("FFmpeg not found. Check Nixpacks configuration.");
            }
            throw execError;
        }

        // --- UPLOAD THE FILE ---
        const videoBuffer = await fs.readFile(outputPath);
        
        // This is the line that performs the S3 upload
        const videoUrl = await uploadToStorage(videoBuffer, `output_${requestId}.mp4`); 
        
        // --- Cleanup ---
        await fs.rm(tempDir, { recursive: true, force: true });
        
        res.json({
            success: true,
            videoUrl: videoUrl, 
            duration: 5
        });
        
    } catch (error) {
        console.error(`[${requestId}] Error:`, error.message);
        
        // Attempt reliable cleanup
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {}
        
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error during rendering'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
