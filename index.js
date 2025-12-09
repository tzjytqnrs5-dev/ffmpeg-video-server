import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Keep the limit high, as the request body might be large for future features
app.use(express.json({ limit: '50mb' })); 

// --- Dummy Storage Function (IMPLEMENTATION REQUIRED) ---
/**
 * Placeholder for uploading the video file to a cloud storage service (e.g., S3).
 * This function must be replaced with actual S3/R2/Cloudflare storage logic.
 * @param {Buffer} buffer - The video file buffer.
 * @param {string} fileName - The name of the file.
 * @returns {Promise<string>} - The publicly accessible URL of the uploaded video.
 */
// TEMPORARY CODE FOR STABILITY TESTING ONLY
async function uploadToStorage(buffer, fileName) {
    console.log(`[Storage] Skipping upload for test. Buffer size: ${buffer.length} bytes`);
    
    // Return a dummy URL that your Deno script can process successfully
    return `https://TEST-SUCCESS-STABLE-URL.com/test_${fileName}`;
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Render endpoint
app.post('/render', async (req, res) => {
    const requestId = crypto.randomBytes(8).toString('hex');
    // Using /tmp is correct for serverless environments
    const tempDir = `/tmp/video-${requestId}`; 
    
    console.log(`[${requestId}] Render request received`);
    
    try {
        // We now expect 'script' and 'background_media_url' from the Deno orchestrator
        const { topic, headline, template, templateId, templateName, script, background_media_url } = req.body;
        
        if (!topic && !headline) {
            return res.status(400).json({ success: false, error: 'Topic or headline required' });
        }

        await fs.mkdir(tempDir, { recursive: true });
        
        // --- 1. Prepare Content and Command ---
        // Use a more realistic headline (using script if available)
        const renderText = (script || headline || topic).substring(0, 100); 
        const outputPath = path.join(tempDir, 'output.mp4');
        
        // Use a simple, stable command for testing stability:
        // You would use the background_media_url and script here in production.
        const ffmpegCmd = `ffmpeg -f lavfi -i color=c=black:s=1080x1920:d=5 -t 5 \
            -vf "drawtext=text='${renderText.replace(/'/g, "\\'")}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
            -c:v libx264 -pix_fmt yuv420p -y "${outputPath}"`; // -y overwrites without prompt
        
        console.log(`[${requestId}] Executing FFmpeg...`);
        
        // --- 2. Execute FFmpeg ---
        // Wrap with a check to help diagnose missing FFmpeg binary
        try {
            await execAsync(ffmpegCmd, { timeout: 30000 }); // Add timeout for safety
        } catch (execError) {
            // Check if the error is due to FFmpeg not being found
            if (execError.message && execError.message.includes('not found')) {
                throw new Error("FFmpeg not found. Check Nixpacks configuration.");
            }
            throw execError;
        }

        // --- 3. Upload File and Get URL (Stability Fix) ---
        const videoBuffer = await fs.readFile(outputPath);
        
        // IMPORTANT: The stability fix is here. Upload the file and get a small URL string.
        const videoUrl = await uploadToStorage(videoBuffer, `output_${requestId}.mp4`); 
        
        console.log(`[${requestId}] Video uploaded and URL generated.`);
        
        // --- 4. Cleanup ---
        await fs.rm(tempDir, { recursive: true, force: true });
        
        // --- 5. Return Small JSON Response ---
        res.json({
            success: true,
            videoUrl: videoUrl, // This is now a small URL string, not a giant Base64 payload
            duration: 5
        });
        
    } catch (error) {
        console.error(`[${requestId}] Error:`, error.message);
        
        // Attempt reliable cleanup
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {}
        
        // Return a 500 status with the error message
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error during rendering'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
