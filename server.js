// server.js - FINAL VERSION - Deploy this now
import express from 'express';
import cors from 'cors';
import ffmpeg from 'fluent-ffmpeg';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Required env vars
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-2' });
const s3 = new AWS.S3();
const TMP_DIR = '/tmp';

// Download helper
const downloadFile = (url, destPath) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
};

app.get('/health', (req, res) => res.status(200).send('OK'));

app.post('/render', async (req, res) => {
  const { title, backgroundVideoUrl, videoId } = req.body;

  if (!backgroundVideoUrl || !videoId) {
    return res.status(400).json({ success: false, error: 'Missing backgroundVideoUrl or videoId' });
  }

  if (!process.env.S3_BUCKET_NAME || !process.env.BASE44_URL || !process.env.BASE44_SERVICE_KEY) {
    return res.status(500).json({ success: false, error: 'Missing env vars' });
  }

  // Short, safe filenames — fixes Railway /tmp filename too long error
  const shortId = videoId.slice(0, 12);
  const outputFileName = `${shortId}.mp4`;                    // e.g. 693c89fd6327.mp4
  const outputPath = path.join(TMP_DIR, outputFileName);
  const bgVideoPath = path.join(TMP_DIR, `${shortId}-bg.mp4`);

  try {
    console.log(`Starting render for ${videoId}`);

    await downloadFile(backgroundVideoUrl, bgVideoPath);
    console.log(`Background downloaded`);

    let escapedTitle = title ? title.replace(/'/g, "\\'") : '';

    if (escapedTitle.length > 40) {
      const words = escapedTitle.split(' ');
      let lines = [];
      let line = '';
      for (const word of words) {
        if ((line + ' ' + word).length > 40) {
          lines.push(line.trim());
          line = word;
        } else line += (line ? ' ' : '') + word;
      }
      if (line) lines.push(line.trim());
      escapedTitle = lines.join('\\n');
    }

    await new Promise((resolve, reject) => {
      let cmd = ffmpeg(bgVideoPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions('-pix_fmt yuv420p')
        .on('end', resolve)
        .on('error', reject);

      if (escapedTitle) {
        const fontSize = escapedTitle.length > 50 ? 30 : escapedTitle.length > 30 ? 40 : 50;
        cmd.videoFilters(
          `drawtext=text='${escapedTitle}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=h-th-60:box=1:boxcolor=black@0.6:boxborderw=12`
        );
      }

      cmd.save(outputPath);
    });
    console.log(`FFmpeg done`);

    const videoBuffer = fs.readFileSync(outputPath);
    const base64Video = videoBuffer.toString('base64');

    // Upload to S3 → permanent public URL
    const s3Result = await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${videoId}.mp4`,           // full videoId in S3 for easy lookup
      Body: videoBuffer,
      ContentType: 'video/mp4',
      ACL: 'public-read'
    }).promise();

    console.log(`S3 upload: ${s3Result.Location}`);

    // Notify Base44 — uses your existing WEBHOOK_SECRET
    await fetch(process.env.BASE44_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BASE44_SERVICE_KEY}`  // ← this is your WEBHOOK_SECRET
      },
      body: JSON.stringify({
        video_url: s3Result.Location,
        job_id: videoId
      })
    });
    console.log(`Base44 notified`);

    // Cleanup
    fs.unlinkSync(outputPath);
    fs.unlinkSync(bgVideoPath);

    return res.json({
      success: true,
      videoUrl: s3Result.Location,     // permanent S3 link
      videoBase64: base64Video,
      videoId
    });

  } catch (err) {
    console.error(`Render failed:`, err.message);

    // Cleanup on error
    [outputPath, bgVideoPath].forEach(p => {
      try { fs.unlinkSync(p); } catch {}
    });

    return res.status(500).json({
      success: false,
      error: err.message,
      videoId
    });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Renderer live on ${HOST}:${PORT}`);
  console.log(`S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
});
