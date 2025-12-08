// worker.js
console.log("Render worker started");

// This is where jobs will be processed
// For now, just test with a simple FFmpeg command
import { spawn } from 'child_process';

const testFFmpeg = () => {
  const ffmpeg = spawn('ffmpeg', [
    '-f', 'lavfi',
    '-i', 'testsrc=duration=5:size=1080x1920:rate=30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    'test-output.mp4'
  ]);

  ffmpeg.stdout.on('data', data => console.log(`stdout: ${data}`));
  ffmpeg.stderr.on('data', data => console.log(`stderr: ${data}`));
  ffmpeg.on('close', code => console.log(`FFmpeg exited with code ${code}`));
};

testFFmpeg();
