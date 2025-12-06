const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json({ limit: '100mb' }));

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);
  const client = url.startsWith('https') ? https : http;
  client.get(url, res => {
    res.pipe(file)
      .on('close', () => resolve())
      .on('error', err => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  }).on('error', reject);
});

app.get('/health', (req, res) => res.json({status:'ok'}));
app.get('/', (req, res) => res.json({status:'FFmpeg server running'}));

app.post('/render', async (req, res) => {
  const { images, duration = 3 } = req.body;
  if (!images?.length) return res.status(400).json({error:'no images'});

  const tmpDir = `/tmp/video_${Date.now()}`;
  fs.mkdirSync(tmpDir, {recursive:true});

  try {
    for (let i = 0; i < images.length; i++) {
      await downloadFile(images[i], path.join(tmpDir, `img${i}.jpg`));
    }
    const out = path.join(tmpDir, 'out.mp4');
    const cmd = `ffmpeg -y -framerate 1/${duration} -pattern_type glob -i '${tmpDir}/img*.jpg' -c:v libx264 -pix_fmt yuv420p ${out}`;

    exec(cmd, err => {
      if (err) return res.status(500).json({error: err.message});
      const video = fs.readFileSync(out).toString('base64');
      fs.rmSync(tmpDir, {recursive:true, force:true});
      res.json({success:true, video});
    });
  } catch (e) {
    fs.rmSync(tmpDir, {recursive:true, force:true});
    res.status(500).json({error: e.message});
  }
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log('Listening on port', port));
