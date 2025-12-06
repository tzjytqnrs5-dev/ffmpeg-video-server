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
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for complex payloads

ffmpeg.setFfmpegPath(ffmpegInstaller);

async function downloadFile(url, dest) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    await pipeline(response.body, fs.createWriteStream(dest));
    return dest;
}

app.get('/', (req, res) => res.send('Generic FFmpeg Runner Active'));

app.post('/render', async (req, res) => {
    const workDir = path.join(__dirname, 'temp-' + Date.now());
    
    try {
        console.log('Received generic render request');
        const { inputs, resources, filterComplex, outputOptions } = req.body;

        if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

        // 1. Download Resources (Fonts, Watermarks, etc.)
        // We map names like 'font.ttf' to actual paths
        const resourceMap = {};
        if (resources && Array.isArray(resources)) {
            console.log(`Downloading ${resources.length} resources...`);
            for (const r of resources) {
                const fileName = r.name || path.basename(r.url);
                const dest = path.join(workDir, fileName);
                await downloadFile(r.url, dest);
                resourceMap[fileName] = dest;
            }
        }

        // 2. Download Inputs (Images, Video, Audio)
        const inputPaths = [];
        if (inputs && Array.isArray(inputs)) {
            console.log(`Downloading ${inputs.length} inputs...`);
            for (let i = 0; i < inputs.length; i++) {
                const inp = inputs[i];
                const dest = path.join(workDir, `input-${i}${path.extname(inp.url) || '.tmp'}`);
                await downloadFile(inp.url, dest);
                inputPaths.push({ path: dest, options: inp.options || [] });
            }
        }

        // 3. Prepare Filter String
        // Replace placeholders like {{font.ttf}} with actual absolute paths
        let finalFilter = filterComplex;
        Object.entries(resourceMap).forEach(([name, localPath]) => {
            // Escape backslashes for FFmpeg filter syntax if on Windows, but Railway is Linux
            // FFmpeg requires escaping ':' in paths in filter strings sometimes
            // Standard Linux path should be fine, but let's ensure.
            const escapedPath = localPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            finalFilter = finalFilter.replace(new RegExp(`{{${name}}}`, 'g'), escapedPath);
        });

        console.log('Starting FFmpeg...');
        const outputPath = path.join(workDir, 'output.mp4');

        await new Promise((resolve, reject) => {
            const command = ffmpeg();

            // Add Inputs
            inputPaths.forEach(inp => {
                command.addInput(inp.path);
                if (inp.options.length > 0) command.inputOptions(inp.options);
            });

            // Apply Complex Filter
            if (finalFilter) {
                command.complexFilter(finalFilter);
            }

            // Apply Output Options
            if (outputOptions) {
                command.outputOptions(outputOptions);
            }

            command
                .save(outputPath)
                .on('end', () => {
                    console.log('Render finished');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                });
        });

        console.log('Sending response...');
        res.setHeader('Content-Type', 'video/mp4');
        const readStream = fs.createReadStream(outputPath);
        readStream.pipe(res);
        readStream.on('close', () => cleanup(workDir));

    } catch (error) {
        console.error('Generic Render Error:', error);
        if (!res.headersSent) res.status(500).send(error.message);
        cleanup(workDir);
    }
});

function cleanup(dir) {
    try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) { console.error('Cleanup error:', e); }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Generic Server running on port ${PORT}`));
