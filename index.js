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
        // Download resources (fonts) to /tmp/
        for (const resource of resources) {
            const localPath = `/tmp/${resource.name}`;
            console.log(`Downloading ${resource.name}...`);
            
            const response = await fetch(resource.url);
            if (!response.ok) {
                throw new Error(`Failed to download ${resource.name}: ${response.statusText}`);
            }
            
            const buffer = await response.arrayBuffer();
            await writeFile(localPath, Buffer.from(buffer));
            downloadedFiles.push(localPath);
            console.log(`Saved to ${localPath}`);
        }

        // Build FFmpeg arguments array
        const ffmpegArgs = [];

        // Add inputs with their options
        for (const input of inputs) {
            if (input.options && Array.isArray(input.options)) {
                ffmpegArgs.push(...input.options);
            }
            ffmpegArgs.push('-i', input.url);
        }

        // Add filter_complex
        ffmpegArgs.push('-filter_complex', filterComplex);

        // Add output options
        if (Array.isArray(outputOptions)) {
            ffmpegArgs.push(...outputOptions);
        }

        // Output file
        ffmpegArgs.push(outputFile);

        console.log('Running: ffmpeg', ffmpegArgs.join(' '));

        // Execute FFmpeg
        await new Promise((resolve, reject) => {
            const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
            let stderr = '';

            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpegProcess.on('error', (err) => {
                reject(new Error(`Failed to start ffmpeg: ${err.message}`));
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}\n${stderr}`));
                }
            });
        });

        // Read output file
        const videoBuffer = await readFile(outputFile);

        res.setHeader('Content-Type', 'video/mp4');
        res.send(videoBuffer);

        // Cleanup
        await unlink(outputFile);
        for (const file of downloadedFiles) {
            await unlink(file).catch(() => {});
        }

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).send(error.message);

        // Cleanup on error
        for (const file of downloadedFiles) {
            await unlink(file).catch(() => {});
        }
    }
});

app.get('/health', (req, res) => {
    res.send('OK');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
