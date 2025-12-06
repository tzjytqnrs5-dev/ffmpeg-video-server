const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Download file from URL
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

app.post('/render', async (req, res) => {
  const { images, duration = 2 } = req.body;
  
  if (!images || images.length === 0) {
    return res.status(400).json({ error: 'No images provided' });
  }

  const tmpDir = `/tmp/video_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Download all images
    for (let i = 0; i < images.length; i++) {
      await downloadFile(images[i], path.join(tmpDir, `image${i}.jpg`));
    }

    const outputPath = path.join(tmpDir, 'output.mp4');
    
    // Create video with FFmpeg
    const cmd = `ffmpeg -framerate 1/${duration} -pattern_type glob -i '${tmpDir}/image*.jpg' -c:v libx264 -pix_fmt yuv420p ${outputPath}`;
    
    exec(cmd, (error) => {
      if (error) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return res.status(500).json({ error: 'FFmpeg failed', details: error.message });
      }

      // Read the video file
      const videoBuffer = fs.readFileSync(outputPath);
      
      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
      
      // Send video as base64
      res.json({
        success: true,
        video: videoBuffer.toString('base64')
      });
    });

  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'FFmpeg server running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
