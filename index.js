import express from 'express';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import { writeFile, unlink } from 'fs/promises';
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
            console.log(`Downloading resource from ${resource.url} to ${localPath}`);
            
            const response = await fetch(resource.url);
            if (!response.ok) {
                throw new Error(`Failed to download ${resource.name}: ${response.statusText}`);
            }
            
            const buffer = await response.arrayBuffer();
            await writeFile(localPath, Buffer.from(buffer));
            downloadedFiles.push(localPath);
            console.log(`Downloaded resource: ${localPath}`);
        }

        // Build FFmpeg command
        const args = [];

        // Add inputs
        for (const input of inputs) {
            if (input.options) {
                args.push(...input.options);
            }
            args.push('-i', input.url);
        }

        // Add filter_complex
        args.push('-filter_complex', filterComplex);

        // Add output options
        args.push(...outputOptions);

        // Output file
        args.push(outputFile);

        console.log('FFmpeg command:', 'ffmpeg', args.join(' '));

        // Execute FFmpeg
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', args);
            let stderr = '';

            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
                }
            });
        });

        // Read and send the output file
        const { readFile } = await import('fs/promises');
        const videoBuffer = await readFile(outputFile);

        res.setHeader('Content-Type', 'video/mp4');
        res.send(videoBuffer);

        // Cleanup
        await unlink(outputFile);
        for (const file of downloadedFiles) {
            await unlink(file).catch(() => {});
        }

    } catch (error) {
        console.error('Render error:', error.message);
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
    console.log(`FFmpeg server listening on port ${PORT}`);
});
