const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('ffmpeg-static');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);

const app = express();
app.use(express.json());

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller);

app.get('/', (req, res) => res.send('FFmpeg Render Server Running'));

app.post('/render', async (req, res) => {
    const workDir = path.join(__dirname, 'temp-' + Date.now());
    
    try {
        console.log('Received render request', req.body);
        const { images, captions } = req.body;
        
        if (!images || !images.length) {
            return res.status(400).json({ error: 'No images provided' });
        }

        // Create temp dir
        if (!fs.existsSync(workDir)) fs.mkdirSync(workDir);

        // 1. Download Images
        const imagePaths = [];
        for (let i = 0; i < images.length; i++) {
            const imgPath = path.join(workDir, `image-${i}.jpg`);
            const response = await fetch(images[i]);
            if (!response.ok) throw new Error(`Failed to fetch image ${i}`);
            await pipeline(response.body, fs.createWriteStream(imgPath));
            imagePaths.push(imgPath);
        }

        const outputPath = path.join(workDir, 'output.mp4');

        // 2. Run FFmpeg
        await new Promise((resolve, reject) => {
            const command = ffmpeg();
            
            // Add inputs
            imagePaths.forEach(p => command.addInput(p).loop(3));

            command
                .complexFilter([
                    // Scale and pad all inputs to 1080x1920
                    ...imagePaths.map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[v${i}];`).join(''),
                    // Concat
                    `${imagePaths.map((_, i) => `[v${i}]`).join('')}concat=n=${imagePaths.length}:v=1:a=0[v]`
                ])
                .map('[v]')
                .videoCodec('libx264')
                .outputOptions([
                    '-pix_fmt yuv420p',
                    '-t ' + (imagePaths.length * 3),
                    '-preset ultrafast'
                ])
                .save(outputPath)
                .on('end', resolve)
                .on('error', reject);
        });

        // 3. Stream back the file
        res.setHeader('Content-Type', 'video/mp4');
        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);

        // Cleanup after stream finishes
        stream.on('close', () => {
            fs.rmSync(workDir, { recursive: true, force: true });
        });

    } catch (error) {
        console.error('Render error:', error);
        res.status(500).json({ error: error.message });
        if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
