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

// Main render endpoint (Robust resource handling and command building)
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

    // 1. Load resources (FONTS)
    const resourcePaths = {};
    for (const resource of resources) {
      // NOTE: We assume resources are fonts based on client code
      const resourceName = resource.name; // e.g., 'HeadlineFont.ttf'
      const resourceUrl = resource.url; 
      try {
        // Option A: Check for pre-cached local fonts (Good, but client should use full path)
        const localFontPath = join(__dirname, 'fonts', resourceName);
        try {
          await fs.access(localFontPath);
          resourcePaths[resourceName] = localFontPath;
          console.log(`[${uniqueId}] Using pre-cached local font: ${resourceName}`);
        } catch {
          // Option B: Download the font from the signed URL
          console.log(`[${uniqueId}] Downloading resource: ${resourceName}`);
          const response = await fetch(resourceUrl, { timeout: 30000 });
          if (!response.ok) throw new Error(`Failed to fetch ${resourceName}`);
          const buffer = await response.buffer();
          
          // CRITICAL FIX: Download fonts directly into the temporary directory
          const resourcePath = join(tempDir, resourceName);
          await fs.writeFile(resourcePath, buffer);
          resourcePaths[resourceName] = resourcePath; // Store the *temp* path
          console.log(`[${uniqueId}] Saved resource: ${resourceName} to ${resourcePath}`);
        }
      } catch (err) {
        console.error(`[${uniqueId}] Resource loading failed for ${resourceName}:`, err);
        throw new Error(`Failed to load resource ${resourceName}`);
      }
    }

    // 2. Build FFmpeg command
    const ffmpegArgs = [];
    for (const input of inputs) {
      if (input.options && Array.isArray(input.options)) ffmpegArgs.push(...input.options);
      ffmpegArgs.push('-i', input.url);
    }

    // CRITICAL FIX: Replace resource names in filterComplex with their absolute, temp file paths.
    let processedFilter = filterComplex;
    for (const [name, path] of Object.entries(resourcePaths)) {
      // Create a regex that searches for the font filename, with or without quotes
      // The client sends: fontfile=MyFont.ttf:
      const regex = new RegExp(`fontfile=['"]?${name}['"]?`, 'g');
      
      // The replacement must escape backslashes for FFmpeg and use the correct path structure
      // Use the 'path' which is already correctly formatted for the OS
      // We explicitly escape the path just in case, but rely on join/replace above
      const escapedPath = path.replace(/\\/g, '/').replace(/:/g, '\\:');
      
      processedFilter = processedFilter.replace(regex, `fontfile=${escapedPath}`);
      console.log(`[${uniqueId}] Replaced fontfile ${name} with ${escapedPath}`);
    }

    ffmpegArgs.push('-filter_complex', processedFilter);
    
    // Add audio track mapping to outputOptions if it's not already there
    // This is a safety measure to ensure the music input is mapped correctly.
    if (!outputOptions.some(opt => opt.startsWith('-map') && opt.includes(':a'))) {
         // Assuming music is the last input URL
         const audioInputIndex = inputs.length - 1; 
         ffmpegArgs.push('-map', `${audioInputIndex}:a`);
    }

    if (outputOptions && Array.isArray(outputOptions)) ffmpegArgs.push(...outputOptions);

    const outputPath = join(tempDir, 'output.mp4');
    ffmpegArgs.push(outputPath);

    console.log(`[${uniqueId}] FFmpeg command (simplified): ffmpeg -i ... -filter_complex ... ${outputPath}`);
    // console.log(`[${uniqueId}] Full Args: ${ffmpegArgs.join(' ')}`); // Uncomment for detailed debug

    // 3. Run FFmpeg
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let stderr = '';

      // ... (Rest of the FFmpeg execution/logging block remains the same) ...
      ffmpeg.stderr.on('data', data => {
        stderr += data.toString();
        // ... progress logging ...
      });

      ffmpeg.on('close', code => {
        process.stdout.write('\n');
        console.log(`[${uniqueId}] FFmpeg exited with code ${code}`);
        if (code !== 0) {
          // Send more detail on failure
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
    console.error('Render error:', error);
    res.status(500).json({ error: 'Render failed', message: error.message, detail: error.stack });
  } finally {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`[${uniqueId}] Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr);
      }
    }
  }
});

app.listen(PORT, () => console.log(`FFmpeg renderer listening on port ${PORT}`));
