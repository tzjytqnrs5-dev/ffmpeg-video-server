import express from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'ffmpeg-video-renderer' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Main render endpoint
app.post('/render', async (req, res) => {
  const startTime = Date.now();
  let tempDir = null;

  try {
    const { inputs, resources = [], filterComplex, outputOptions = [] } = req.body;

    if (!inputs || !Array.isArray(inputs)) {
      return res.status(400).json({ error: 'Invalid inputs array' });
    }

    if (!filterComplex) {
      return res.status(400).json({ error: 'Missing filterComplex' });
    }

    // Create unique temp directory
    const uniqueId = randomBytes(8).toString('hex');
    tempDir = join(tmpdir(), `ffmpeg-${uniqueId}`);
    await fs.mkdir(tempDir, { recursive: true });

    console.log(`[${uniqueId}] Starting render with ${inputs.length} inputs, ${resources.length} resources`);

    // Download and save resources (fonts, etc)
    const resourcePaths = {};
    for (const resource of resources) {
      try {
        console.log(`[${uniqueId}] Downloading resource: ${resource.name}`);
        const response = await fetch(resource.url, { timeout: 30000 });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ${resource.name}: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.buffer();
        const resourcePath = join(tempDir, resource.name);
        await fs.writeFile(resourcePath, buffer);
        resourcePaths[resource.name] = resourcePath;
        console.log(`[${uniqueId}] Saved resource: ${resource.name} (${buffer.length} bytes)`);
      } catch (err) {
        console.error(`[${uniqueId}] Resource download failed:`, err);
        throw new Error(`Failed to download resource ${resource.name}: ${err.message}`);
      }
    }

    // Build FFmpeg command
    const ffmpegArgs = [];

    // Add inputs with their options
    for (const input of inputs) {
      if (input.options && Array.isArray(input.options)) {
        ffmpegArgs.push(...input.options);
      }
      ffmpegArgs.push('-i', input.url);
    }

    // Replace resource names in filterComplex with absolute paths
    let processedFilter = filterComplex;
    for (const [name, path] of Object.entries(resourcePaths)) {
      // Replace fontfile references
      processedFilter = processedFilter.replace(
        new RegExp(`fontfile=${name}`, 'g'),
        `fontfile=${path.replace(/\\/g, '/')}`
      );
    }

    // Add filter complex
    ffmpegArgs.push('-filter_complex', processedFilter);

    // Add output options
    if (outputOptions && Array.isArray(outputOptions)) {
      ffmpegArgs.push(...outputOptions);
    }

    // Output file
    const outputPath = join(tempDir, 'output.mp4');
    ffmpegArgs.push(outputPath);

    console.log(`[${uniqueId}] FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

    // Run FFmpeg
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log progress
        if (data.toString().includes('frame=')) {
          process.stdout.write('.');
        }
      });

      ffmpeg.on('close', (code) => {
        console.log(`\n[${uniqueId}] FFmpeg exited with code ${code}`);
        if (code !== 0) {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        } else {
          resolve();
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });
    });

    // Read output file
    const videoBuffer = await fs.readFile(outputPath);
    console.log(`[${uniqueId}] Video generated: ${videoBuffer.length} bytes in ${Date.now() - startTime}ms`);

    // Send video as response
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', videoBuffer.length);
    res.send(videoBuffer);

  } catch (error) {
    console.error('Render error:', error);
    
    const errorResponse = {
      error: 'Render failed',
      message: error.message
    };

    // Add specific error types
    if (error.message.includes('Filter not found')) {
      errorResponse.error = 'Font or FFmpeg error';
      errorResponse.hint = 'FFmpeg may be missing drawtext filter or fonts not loaded';
    }

    res.status(500).json(errorResponse);
  } finally {
    // Cleanup temp directory
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FFmpeg video server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
