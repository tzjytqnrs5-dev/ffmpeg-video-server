import express from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// Health checks
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ffmpeg-video-renderer' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// FIXED worker-test route
app.get('/worker-test', (req, res) => {
  console.log("Worker test request received");
  const worker = spawn('node', ['worker.js']);
  worker.stdout.on('data', data => console.log(`worker stdout: ${data}`));
  worker.stderr.on('data', data => console.log(`worker stderr: ${data}`));
  worker.on('close', code => {
    console.log(`Worker exited with code ${code}`);
    res.send(`Worker finished with code ${code}`);
  });
});

// Main render endpoint (ALL template strings fixed)
app.post('/render', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Incoming render request from ${req.ip}`);
  const startTime = Date.now();
  let tempDir = null;

  try {
    const { inputs, resources = [], filterComplex, outputOptions = [], totalFrames } = req.body;
    if (!inputs || !Array.isArray(inputs)) {
      return res.status(400).json({ error: 'Invalid inputs array' });
    }
    if (!filterComplex) {
      return res.status(400).json({ error: 'Missing filterComplex' });
    }

    const uniqueId = randomBytes(8).toString('hex');
    tempDir = join(tmpdir(), `ffmpeg-${uniqueId}`);
    await fs.mkdir(tempDir, { recursive: true });

    console.log(`[${uniqueId}] Starting render with ${inputs.length} inputs, ${resources.length} resources`);

    // Load resources
    const resourcePaths = {};
    for (const resource of resources) {
      try {
        const localFontPath = join(__dirname, 'fonts', resource.name);
        try {
          await fs.access(localFontPath);
          resourcePaths[resource.name] = localFontPath;
          console.log(`[${uniqueId}] Using local font: ${resource.name}`);
        } catch {
          console.log(`[${uniqueId}] Downloading resource: ${resource.name}`);
          const response = await fetch(resource.url, { timeout: 30000 });
          if (!response.ok) throw new Error(`Failed to fetch ${resource.name}`);
          const buffer = await response.buffer();
          const resourcePath = join(tempDir, resource.name);
          await fs.writeFile(resourcePath, buffer);
          resourcePaths[resource.name] = resourcePath;
          console.log(`[${uniqueId}] Saved resource: ${resource.name}`);
        }
      } catch (err) {
        console.error(`[${uniqueId}] Resource loading failed:`, err);
        throw new Error(`Failed to load resource ${resource.name}`);
      }
    }

    // Build FFmpeg command
    const ffmpegArgs = [];
    for (const input of inputs) {
      if (input.options && Array.isArray(input.options)) ffmpegArgs.push(...input.options);
      ffmpegArgs.push('-i', input.url);
    }

    let processedFilter = filterComplex;
    for (const [name, path] of Object.entries(resourcePaths)) {
      processedFilter = processedFilter.replace(new RegExp(`fontfile=['"]?${name}['"]?`, 'g'), `fontfile=${path.replace(/\\/g, '/')}`);
    }

    ffmpegArgs.push('-filter_complex', processedFilter);
    if (outputOptions && Array.isArray(outputOptions)) ffmpegArgs.push(...outputOptions);

    const outputPath = join(tempDir, 'output.mp4');
    ffmpegArgs.push(outputPath);

    console.log(`[${uniqueId}] FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

    // Run FFmpeg
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let stderr = '';

      ffmpeg.stderr.on('data', data => {
        stderr += data.toString();
        const str = data.toString();
        const match = str.match(/frame=\s*(\d+)\s*fps=\s*([\d\.]+)/);
        if (match) {
          const [_, frameStr, fpsStr] = match;
          const frame = parseInt(frameStr, 10);
          const fps = parseFloat(fpsStr);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          let remainingText = '';
          if (totalFrames) {
            const remaining = ((totalFrames - frame) / fps).toFixed(1);
            remainingText = ` | Remaining: ${remaining}s`;
          }
          process.stdout.write(`\rFrame: ${frame} | FPS: ${fps} | Elapsed: ${elapsed}s${remainingText}   `);
        }
      });

      ffmpeg.on('close', code => {
        process.stdout.write('\n');
        console.log(`[${uniqueId}] FFmpeg exited with code ${code}`);
        if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        else resolve();
      });

      ffmpeg.on('error', err => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
    });

    const videoBuffer = await fs.readFile(outputPath);
    console.log(`[${uniqueId}] Video generated: ${videoBuffer.length} bytes in ${Date.now() - startTime}ms`);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', videoBuffer.length);
    res.send(videoBuffer);

  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({ error: 'Render failed', message: error.message });
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr);
      }
    }
  }
});

app.listen(PORT, () => console.log(`FFmpeg renderer listening on port ${PORT}`));
