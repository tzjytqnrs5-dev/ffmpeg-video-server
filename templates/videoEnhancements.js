// videoEnhancementsTemplates.js
export const tiktokTemplates = {

  // ========================
  // 1–6: Quick Social Boosters
  // ========================
  socialBooster1: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,split=2[v0][v1];
[v0]fade=t=in:st=0:d=0.5,fade=t=out:st=14:d=0.5[vf0];
[v1]drawtext=text='${text}':fontfile=/fonts/Impact-Regular.ttf:fontsize=72:fontcolor=white:x=(w-tw)/2:y=h-th-50:shadowcolor=black:shadowx=3:shadowy=3,fade=t=in:st=0:d=0.5:alpha=1[vf1];
[vf0][vf1]overlay=shortest=1" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${clip}_socialBooster1.mp4"
  `,
  socialBooster2: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,split=3[v0][v1][v2];
[v0]drawtext=text='${text}':fontfile=/fonts/Impact-Regular.ttf:fontsize=60:fontcolor=yellow:x=(w-tw)/2:y=50:shadowcolor=black:shadowx=2:shadowy=2,fade=t=in:st=0:d=0.5[vf0];
[v1]hue=s=0.5[vf1];
[v2]eq=contrast=1.3:saturation=1.2[vf2];
[vf0][vf1][vf2]blend=all_mode=addition:opacity=0.7" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${clip}_socialBooster2.mp4"
  `,
  socialBooster3: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,fade=t=in:st=0:d=0.5,split=2[v0][v1];
[v1]drawtext=text='${text}':fontfile=/fonts/Impact-Regular.ttf:fontsize=64:fontcolor=#00FFFF:x=(w-tw)/2:y=h-th-100:shadowcolor=black:shadowx=2:shadowy=2[vf1];
[v0][vf1]overlay=shortest=1,fade=t=out:st=14:d=0.5" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${clip}_socialBooster3.mp4"
  `,
  socialBooster4: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,split=2[v0][v1];
[v0]hue=h=60:s=1[vf0];
[v1]drawtext=text='${text}':fontfile=/fonts/Impact-Regular.ttf:fontsize=72:fontcolor=white:x=(w-tw)/2:y=50:shadowcolor=black:shadowx=3:shadowy=3[vf1];
[vf0][vf1]overlay=shortest=1,format=yuv420p" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${clip}_socialBooster4.mp4"
  `,
  socialBooster5: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,split=3[v0][v1][v2];
[v0]curves=preset=vintage[vf0];
[v1]drawtext=text='${text}':fontfile=/fonts/Impact-Regular.ttf:fontsize=64:fontcolor=red:x=(w-tw)/2:y=h-th-80:shadowcolor=black:shadowx=2:shadowy=2[vf1];
[v2]eq=contrast=1.2:saturation=1.3[vf2];
[vf0][vf1][vf2]blend=all_mode=overlay:opacity=0.6" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${clip}_socialBooster5.mp4"
  `,
  socialBooster6: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,split=2[v0][v1];
[v0]drawtext=text='${text}':fontfile=/fonts/Impact-Regular.ttf:fontsize=72:fontcolor=yellow:x=(w-tw)/2:y=50:shadowcolor=black:shadowx=3:shadowy=3[vf0];
[v1]eq=brightness=0.05:contrast=1.2[vf1];
[vf0][vf1]overlay=shortest=1" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${clip}_socialBooster6.mp4"
  `,

  // ========================
  // 7–12: Aesthetic Cinematic
  // ========================
  cinematic1: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,lut3d=/filters/cinematic.cube[v0];
[v0]drawtext=text='${text}':fontfile=/fonts/Roboto-Bold.ttf:fontsize=60:fontcolor=white:x=(w-tw)/2:y=h-th-50:shadowcolor=black:shadowx=2:shadowy=2" -c:v libx264 -preset slow -crf 22 -c:a aac -b:a 160k "${clip}_cinematic1.mp4"
  `,
  cinematic2: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,boxblur=10:1:cr=1[vf0];
[vf0]drawtext=text='${text}':fontfile=/fonts/Roboto-Bold.ttf:fontsize=64:fontcolor=#00FFFF:x=(w-tw)/2:y=h-th-80:shadowcolor=black:shadowx=2:shadowy=2" -c:v libx264 -preset slow -crf 22 -c:a aac -b:a 160k "${clip}_cinematic2.mp4"
  `,
  cinematic3: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,curves=preset=vintage[v0];
[v0]drawtext=text='${text}':fontfile=/fonts/Roboto-Bold.ttf:fontsize=60:fontcolor=yellow:x=(w-tw)/2:y=h-th-60:shadowcolor=black:shadowx=2:shadowy=2" -c:v libx264 -preset slow -crf 22 -c:a aac -b:a 160k "${clip}_cinematic3.mp4"
  `,
  cinematic4: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,eq=contrast=1.2:saturation=1.15:brightness=0.02[vf0];
[vf0]drawtext=text='${text}':fontfile=/fonts/Roboto-Bold.ttf:fontsize=72:fontcolor=white:x=(w-tw)/2:y=h-th-50:shadowcolor=black:shadowx=3:shadowy=3" -c:v libx264 -preset slow -crf 22 -c:a aac -b:a 160k "${clip}_cinematic4.mp4"
  `,
  cinematic5: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,lut3d=/filters/teal-orange.cube[vf0];
[vf0]drawtext=text='${text}':fontfile=/fonts/Roboto-Bold.ttf:fontsize=64:fontcolor=#FF00FF:x=(w-tw)/2:y=h-th-70:shadowcolor=black:shadowx=2:shadowy=2" -c:v libx264 -preset slow -crf 22 -c:a aac -b:a 160k "${clip}_cinematic5.mp4"
  `,
  cinematic6: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,boxblur=5:1[v0];
[v0]drawtext=text='${text}':fontfile=/fonts/Roboto-Bold.ttf:fontsize=60:fontcolor=white:x=(w-tw)/2:y=h-th-60:shadowcolor=black:shadowx=2:shadowy=2" -c:v libx264 -preset slow -crf 22 -c:a aac -b:a 160k "${clip}_cinematic6.mp4"
  `,

  // ========================
  // 13–18: Gaming Clips / Highlights
  // ========================
  gamingHighlight1: (clip, text, music) => `
ffmpeg -y -i "${clip}" -i "${music}" -filter_complex "
[0:v]scale=1080:1920,setsar=1,split=2[v0][v1];
[v0]drawtext=text='${text}':fontfile=/fonts/PressStart2P-Regular.ttf:fontsize=48:fontcolor=red:x=(w-tw)/2:y=50:shadowcolor=black:shadowx=2:shadowy=2[vf0];
[v1]hue=h=60:s=1[vf1];
[vf0][vf1]blend=all_mode=screen" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 128k "${clip}_gamingHighlight1.mp4"
  `,
// ... templates 14–30 follow same pattern
};
