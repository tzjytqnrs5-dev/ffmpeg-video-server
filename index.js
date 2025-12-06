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
app.use(express.json({ limit: '10mb' })); // Increased limit for complex filters

ffmpeg.setFfmpegPath(ffmpegInstaller);

async function downloadFile(url, dest) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);
    await pipeline(response.body, fs.createWriteStream(dest));
    return dest;
}

app.get('/', (req, res) => res.send('Generic FFmpeg Runner v2'));

app.post('/render', async (req, res) => {
    const workDir = path.join(__dirname, 'temp-' + Date.now());
    
    try {
        if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
        
        const { inputs, resources, filterComplex, outputOptions } = req.body;
        
        // 1. Download Inputs (Images, Video, Audio)
        // inputs: [{ url: string, options: string[] }]
        const inputPaths = [];
        for (let i = 0; i < inputs.length; i++) {
            const ext = path.extname(new URL(inputs[i].url).pathname) || '.tmp';
            const dest = path.join(workDir, `input-${i}${ext}`);
            await downloadFile(inputs[i].url, dest);
            inputPaths.push({ path: dest, options: inputs[i].options || [] });
        }

        // 2. Download Resources (Fonts, Watermarks - things not in the input stream)
        // resources: [{ url: string, name: string }]
        const resourceMap = {};
        if (resources) {
            for (const res of resources) {
                const dest = path.join(workDir, res.name);
                await downloadFile(res.url, dest);
                // Windows/Linux path safety: escape backslashes for FFmpeg filters
                resourceMap[res.name] = dest.replace(/\\/g, '/').replace(/:/g, '\\:'); 
            }
        }

        // 3. Inject Resource Paths into Filter String
        // Replaces {{font.ttf}} with actual local path
        let finalFilter = filterComplex;
        Object.keys(resourceMap).forEach(name => {
            finalFilter = finalFilter.split(`{{${name}}}`).join(resourceMap[name]);
        });

        console.log('Running FFmpeg with filter length:', finalFilter.length);

        const outputPath = path.join(workDir, 'output.mp4');
        
        await new Promise((resolve, reject) => {
            const command = ffmpeg();

            // Add Inputs
            inputPaths.forEach(inp => {
                command.addInput(inp.path);
                if (inp.options.length) command.inputOptions(inp.options);
            });

            command
                .complexFilter(finalFilter)
                .outputOptions(outputOptions || [])
                .save(outputPath)
                .on('end', resolve)
                .on('error', reject);
        });

        res.setHeader('Content-Type', 'video/mp4');
        const readStream = fs.createReadStream(outputPath);
        readStream.pipe(res);
        readStream.on('close', () => {
            try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) {}
        });

    } catch (error) {
        console.error('Render Error:', error);
        if (!res.headersSent) res.status(500).json({ error: error.message });
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) {}
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Runner on ${PORT}`));
