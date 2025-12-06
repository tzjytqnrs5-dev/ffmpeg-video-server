const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('ffmpeg-static');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller);

// Health check
app.get('/', (req, res) => res.send('FFmpeg Render Server Running'));

// Render endpoint
app.post('/render', async (req, res) => {
    const workDir = path.join(__dirname, 'temp-' + Date.now());
    
    try {
        console.log('Received render request:', JSON.stringify(req.body).substring(0, 200) + '...');
        const { images, captions } = req.body;
        
        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: 'No images provided' });
        }

        // Create temp directory
        if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

        console.log(`Downloading ${images.length} images to ${workDir}...`);

        // 1. Download Images
        const imagePaths = [];
        for (let i = 0; i < images.length; i++) {
            const imgPath = path.join(workDir, `image-${i}.jpg`);
            const response = await fetch(images[i]);
            if (!response.ok) throw new Error(`Failed to fetch image ${i}: ${response.statusText}`);
            await pipeline(response.body, fs.createWriteStream(imgPath));
            imagePaths.push(imgPath);
        }

        const outputPath = path.join(workDir, 'output.mp4');
        console.log('Starting FFmpeg render...');

        // 2. Run FFmpeg
        await new Promise((resolve, reject) => {
            const command = ffmpeg();
            
            // Add inputs (loop each image for 3 seconds)
            imagePaths.forEach(p => command.addInput(p).loop(3));

            command
                .complexFilter([
                    // Scale to 1080x1920 (Vertical Video) and handle aspect ratio
                    ...imagePaths.map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`),
                    // Concatenate all segments
                    `${imagePaths.map((_, i) => `[v${i}]`).join('')}concat=n=${imagePaths.length}:v=1:a=0[v]`
                ])
                .map('[v]')
                .videoCodec('libx264')
                .outputOptions([
                    '-pix_fmt yuv420p',       // Ensure compatibility with all players
                    '-t ' + (imagePaths.length * 3), // Set total duration
                    '-preset ultrafast',      // Fast rendering
                    '-movflags +faststart'    // Optimize for web streaming
                ])
                .save(outputPath)
                .on('end', () => {
                    console.log('FFmpeg render finished');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                });
        });

        // 3. Send file back
        console.log('Sending video response...');
        res.setHeader('Content-Type', 'video/mp4');
        
        // Create read stream and pipe to response
        const readStream = fs.createReadStream(outputPath);
        readStream.pipe(res);

        // Cleanup when response is done or closed
        readStream.on('close', () => {
            cleanup(workDir);
        });

    } catch (error) {
        console.error('Critical Render Error:', error);
        // Only send JSON error if headers haven't been sent yet
        if (!res.headersSent) {
            res.status(500).json({ error: error.message, details: error.stack });
        }
        cleanup(workDir);
    }
});

// Helper to remove temp files
function cleanup(dir) {
    try {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`Cleaned up ${dir}`);
        }
    } catch (e) {
        console.error('Cleanup error:', e);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
