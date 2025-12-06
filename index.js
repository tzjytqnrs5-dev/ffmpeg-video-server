const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json({ limit: '50mb' }));

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, response => {
      response.pipe(file)
        .on('finish', () => { file.close(); resolve(); })
        .on('error', err => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', reject);
  });
}

app.post('/render', async (req, res) => {
  const { images, duration = 3 } = req.body;
  if (!images?.length) return res.status(400).json({ error: 'No images' });

  const tmpDir = `/tmp/video_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (let i = 0; i < images.length; i++) {
      await downloadFile(images[i], path.join(tmpDir, `img${i}.jpg`));
    }

    const output = path.join(tmpDir, 'output.mp4');
    const cmd = `ffmpeg -y -framerate 1/${duration} -pattern_type glob -i '${tmpDir}/img*.jpg' -c:v libx264 -pix_fmt yuv420p ${output}`;

    exec(cmd, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const video = fs.readFileSync(output).toString('base64');
      fs.rmSync(tmpDir, { recursive: true, force: true });
      res.json({ success: true, video });
    });
  } catch (e) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'FFmpeg server running' }));

app.listen(process.env.PORT || 3000, () => console.log('Running on port ' + (process.env.PORT || 3000)));
