import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Render endpoint
app.post('/render', async (req, res) => {
  const requestId = crypto.randomBytes(8).toString('hex');
  const tempDir = `/tmp/video-${requestId}`;
  
  console.log(`[${requestId}] Render request received`);
  
  try {
    const { topic, headline, template } = req.body;
    
    if (!topic && !headline) {
      return res.status(400).json({ success: false, error: 'Topic or headline required' });
    }

    await fs.mkdir(tempDir, { recursive: true });
    
    // Generate simple video with text overlay
    const text = (headline || topic).substring(0, 100);
    const outputPath = path.join(tempDir, 'output.mp4');
    
    // Simple FFmpeg command - solid color background with text
    const ffmpegCmd = `ffmpeg -f lavfi -i color=c=black:s=1080x1920:d=5 \
      -vf "drawtext=text='${text.replace(/'/g, "\\'")}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
      -c:v libx264 -pix_fmt yuv420p -t 5 "${outputPath}"`;
    
    console.log(`[${requestId}] Executing FFmpeg...`);
    await execAsync(ffmpegCmd);
    
    const videoBuffer = await fs.readFile(outputPath);
    const videoBase64 = videoBuffer.toString('base64');
    const videoUrl = `data:video/mp4;base64,${videoBase64}`;
    
    console.log(`[${requestId}] Video generated: ${videoBuffer.length} bytes`);
    
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    
    res.json({
      success: true,
      videoUrl: videoUrl,
      duration: 5
    });
    
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
