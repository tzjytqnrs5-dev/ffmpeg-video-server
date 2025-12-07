import express from 'express';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import { writeFile, unlink, readFile } from 'fs/promises';
import { randomBytes } from 'crypto';

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 3000;

app.post('/render', async (req, res) => {
    const { inputs, resources = [], filterComplex, outputOptions = [] } = req.body;

    if (!inputs || !filterComplex) {
        return res.status(400).send('Missing inputs or filterComplex');
    }

    const outputFile = `/tmp/output_${randomBytes(8).toString('hex')}.mp4`;
    const downloadedFiles = [];

    try {
        for (const resource of resources) {
            const localPath = `/tmp/${resource.name}`;
            const response = await fetch(resource.url);
            if (!response.ok) throw new Error(`Download failed: ${resource.name}`);
            await writeFile(localPath, Buffer.from(await response.arrayBuffer()));
            downloadedFiles.push(localPath);
        }

        const ffmpegArgs = [];

        for (const input of inputs) {
            if (input.options) {
                const opts = Array.isArray(input.options) ? input.options : input.options.split(' ').filter(Boolean);
                ffmpegArgs.push(...opts);
            }
            ffmpegArgs.push('-i', input.url);
        }

        ffmpegArgs.push('-filter_complex', filterComplex);
        
        const outOpts = Array.isArray(outputOptions) ? outputOptions : outputOptions.split(' ').filter(Boolean);
        ffmpegArgs.push(...outOpts, outputFile);

        console.log('FFmpeg:', ffmpegArgs.join(' '));

        await new Promise((resolve, reject) => {
            const proc = spawn('ffmpeg', ffmpegArgs);
            let stderr = '';
            proc.stderr.on('data', (d) => stderr += d);
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Exit ${code}: ${stderr}`)));
        });

        const videoBuffer = await readFile(outputFile);
        res.setHeader('Content-Type', 'video/mp4');
        res.send(videoBuffer);

        await unlink(outputFile);
        for (const f of downloadedFiles) await unlink(f).catch(() => {});

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).send(error.message);
        for (const f of downloadedFiles) await unlink(f).catch(() => {});
    }
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
