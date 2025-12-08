import express from 'express';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { randomBytes } from 'node:crypto'; // <-- CRITICAL FIX: Use node: prefix

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

// Worker test route remains but is simplified to avoid complex logic
app.get('/worker-test', (req, res) => {
  console.log("Worker test request received (Inactive for main jobs)");
  // This is a minimal test; the actual worker.js file is now empty/simplified.
  res.send("Worker test received. Main rendering uses /render.");
});

// Main render endpoint (Robust resource handling and command building)
app.post('/render', async (req, res) => {
  console.log(`[${new Date().toISOString()}] Incoming render request from ${req.ip}`);
  const startTime = Date.now();
  let tempDir = null;
  let uniqueId = randomBytes(8).toString('hex'); // Initialize here for use in finally block

  try {
    const { inputs, resources = [], filterComplex, outputOptions = [], totalFrames } = req.body;
    if (!inputs || !Array.isArray(inputs)) {
      return res.status(400).json({ error: 'Invalid inputs array' });
    }
    if (!filterComplex) {
      return res.status(400).json({ error: 'Missing filterComplex' });
    }

    tempDir = join(tmpdir(), `ffmpeg-${uniqueId}`);
    await fs.mkdir(tempDir, { recursive: true });

    console.log(`[${uniqueId}] Starting render with ${inputs.length} inputs, ${resources.length} resources`);

    // 1. Load resources (FONTS)
    const resourcePaths = {};
    for (const resource of resources) {
      const resourceName = resource.name; 
      const resourceUrl = resource.url; 
      try {
        console.log(`[${uniqueId}] Downloading resource: ${resourceName}`);
        const response = await fetch(resourceUrl, { timeout: 30000 });
        if (!response.ok) throw new Error(`Failed to fetch ${resourceName}`);
        const buffer = await response.buffer();
        
        // Download fonts directly into the temporary directory
        const resourcePath = join(tempDir, resourceName);
        await fs.writeFile(resourcePath, buffer);
        resourcePaths[resourceName] = resourcePath; // Store the *temp* path
        console.log(`[${uniqueId}] Saved resource: ${resourceName} to ${resourcePath}`);

      } catch (err) {
        console.error(`[${uniqueId}] Resource loading failed for ${resourceName}:`, err);
        throw new Error(`Failed to load resource ${resourceName}`);
      }
    }

    // 2. Build FFmpeg command
    const ffmpegArgs = [];
    
    // Add input files and their options
    for (const input of inputs) {
      if (input.options && Array.isArray(input.options)) ffmpegArgs.push(...input.options);
      ffmpegArgs.push('-i', input.url);
    }

    // CRITICAL FIX: Replace resource names in filterComplex with their absolute, temp file paths.
    let processedFilter = filterComplex;
    for (const [name, path] of Object.entries(resourcePaths)) {
      const regex = new RegExp(`fontfile=['"]?${name}['"]?`, 'g');
      
      // Escape path for FFmpeg, particularly backslashes on Windows and colons for filter compatibility
      const escapedPath = path.replace(/\\/g, '/').replace(/:/g, '\\:');
      
      processedFilter = processedFilter.replace(regex, `fontfile=${escapedPath}`);
      console.log(`[${uniqueId}] Replaced fontfile ${name} with ${escapedPath}`);
    }

    ffmpegArgs.push('-filter_complex', processedFilter);
    
    if (outputOptions && Array.isArray(outputOptions)) ffmpegArgs.push(...outputOptions);

    const outputPath = join(tempDir, 'output.mp4');
    ffmpegArgs.push(outputPath);

    console.log(`[${uniqueId}] FFmpeg command (simplified): ffmpeg -i ... -filter_complex ... ${outputPath}`);

    // 3. Run FFmpeg
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let stderr = '';
      const totalStart = Date.now();
      let lastFrame = 0;
      let lastTime = Date.now();

      ffmpeg.stderr.on('data', data => {
        const dataStr = data.toString();
        stderr += dataStr;

        // Progress logging (adapted from original code to be more robust)
        if (dataStr.includes('frame=')) {
          const frameMatch = dataStr.match(/frame=\s*(\d+)/);
          const timeMatch = dataStr.match(/time=\s*(\d+:\d+:\d+\.\d+)/);
          const fpsMatch = dataStr.match(/fps=\s*(\d+\.?\d*)/);

          if (frameMatch && timeMatch && fpsMatch) {
            const frame = parseInt(frameMatch[1], 10);
            const fps = parseFloat(fpsMatch[1]);
            const elapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

            let remainingText = '';
            if (totalFrames && totalFrames > 0) {
              const framesRemaining = totalFrames - frame;
              // Simple heuristic estimate
              const frameDelta = frame - lastFrame;
              const timeDelta = Date.now() - lastTime;

              if (frameDelta > 100 && timeDelta > 1000) { // Update rate limit
                 const avgFps = frameDelta / (timeDelta / 1000);
                 const remainingTimeSec = framesRemaining / avgFps;
                 remainingText = ` | Remaining: ${remainingTimeSec.toFixed(1)}s`;
                 lastFrame = frame;
                 lastTime = Date.now();
              }
            }
            process.stdout.write(`\r[${uniqueId}] Frame: ${frame} | FPS: ${fps} | Elapsed: ${elapsed}s${remainingText}   `);
          }
        }
      });

      ffmpeg.on('close', code => {
        process.stdout.write('\n');
        console.log(`[${uniqueId}] FFmpeg exited with code ${code}`);
        if (code !== 0) {
          const lastErr = stderr.slice(-1500);
          console.error(`[${uniqueId}] FFmpeg Last 1500 chars of stderr: ${lastErr}`);
          reject(new Error(`ffmpeg exited with code ${code}. Error snippet: ${lastErr.substring(0, 500)}`));
        } else resolve();
      });

      ffmpeg.on('error', err => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
    });

    // 4. Send Response
    const videoBuffer = await fs.readFile(outputPath);
    console.log(`[${uniqueId}] Video generated: ${videoBuffer.length} bytes in ${Date.now() - startTime}ms`);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', videoBuffer.length);
    res.send(videoBuffer);

  } catch (error) {
    console.error(`[${uniqueId}] Render error:`, error);
    res.status(500).json({ error: 'Render failed', message: error.message, detail: error.stack });
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`[${uniqueId}] Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupErr) {
        console.error(`[${uniqueId}] Cleanup error:`, cleanupErr);
      }
    }
  }
});

app.listen(PORT, () => console.log(`FFmpeg renderer listening on port ${PORT}`));
