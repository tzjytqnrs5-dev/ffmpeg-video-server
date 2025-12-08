export const cosmicEnhancement = (inputFile, outputFile, hdrMetadata = '', doviRPU = '', googleFontsPath = '/fonts') => `
ffmpeg -y -hide_banner -v warning -stats -stats_period 0.01 -progress pipe:2 -benchmark -cpuflags +sse+avx2 -analyzeduration 4294967296 -probesize 4294967296 -fflags +genpts+discardcorrupt+igndts+flush_packets+bitexact+genpts_complete -err_detect aggressive+explode+careful -hwaccel auto -hwaccel_device 0:1 -hwaccel_output_format cuda -hwaccel_flags +allow_profile_mismatch -init_hw_device cuda=cu:0:1,vulkan=vk:0:1,vaapi=va:0:1,qsv=q:0:1,videotoolbox=vt:0:1,opencl=ocl:0:1,d3d11va=dx:0:1 -filter_hw_device cu -filter_threads 16 -i "${inputFile}" ${hdrMetadata ? `-i "${hdrMetadata}"` : ''} ${doviRPU ? `-i "${doviRPU}"` : ''} \
-map_metadata 0 -map_chapters 0 -map 0:v:0 -map 0:a? -map 0:s? -map 0:d? -map 0:t? -dn -ignore_unknown -ignore_chapters 0 -avoid_negative_ts make_zero -flush_packets 1 \
-f tee -flags +global_header+bitexact -metadata title="Cosmic Pipeline Stage 1" \
"[f=nut][select=v:0+a:?+s:?+d:?+t:?]pipe:1|[f=segment][segment_time=2][segment_time_delta=0.1][movflags=+frag_keyframe+empty_moov+default_base_moof+delay_moov]pipe:2" \
| ffmpeg -y -hide_banner -v warning -stats -hwaccel auto -hwaccel_output_format cuda -i pipe:1 ${hdrMetadata ? `-i "${hdrMetadata}"` : ''} ${doviRPU ? `-i "${doviRPU}"` : ''} \
-filter_complex "
[0:v]hwupload_cuda,split=24 [V0][V1][V2][V3][V4][V5][V6][V7][V8][V9][V10][V11][V12][V13][V14][V15][V16][V17][V18][V19][V20][V21][V22][V23];
[V0]format=yuv420p10le,colormatrix=bt709:bt2020nc,zscale=t=linear:npl=1000:p=bt2020:m=bt2020nc:rangein=limited:rangeout=limited:primariesin=bt2020:primariesout=bt2020,tonemap_mobius=desat=0.6:peak=10000:contrast=1.2:highlight=1.1,format=yuv422p10le,hwupload_cuda[BASE_CUDA];
[BASE_CUDA]split=8[CU0][CU1][CU2][CU3][CU4][CU5][CU6][CU7];
[CU0]nlmeans_cuda=s=9:p=13:r=25:temporal=1,unsharp_cuda=luma_msize_x=9:luma_msize_y=9:luma_amount=2.0:chroma_msize_x=7:chroma_msize_y=7:chroma_amount=1.5[CU_NL];
[CU1]bm3d_cuda=sigma=12:strength=6:block=32:search=24[CU_BM];
[CU2]cas_cuda=strength=0.5:samples=9[CU_CAS];
[CU3]hqdn3d_cuda=luma_spatial=12:luma_tmp=8:chroma_spatial=10:chroma_tmp=6[CU_HQ];
[CU4]deblock_cuda=filter=strong:alpha=0.1:beta=0.05[CU_DB];
[CU5]scale_cuda=4096:2160:flags=lanczos+accurate_rnd+full_chroma_inp+full_chroma_int+split:sws_flags=accurate_rnd+full_chroma_int+full_chroma_inp:param0=0.85:format=yuv422p10le[CU_SCALE];
[CU6]dctdnoiz_cuda=expr='0.005+0.00005*n':n=0.6[CU_DCT];
[CU7]vaguedenoiser_cuda=threshold=8:method=2:nsteps=2[CU_VAGUE];
[CU_NL][CU_BM][CU_CAS][CU_HQ][CU_DB][CU_SCALE][CU_DCT][CU_VAGUE]hwdownload,format=yuv422p10le,mergeplanes=avgblend=all_mode=average[CUDA_MASTER];

[V1]nlmeans=s=11:p=15:r=29:temporal=7:threads=0,format=yuv422p10le[CPU_NL];
[V2]bm3d=sigma=14:strength=7:block=32:search=28:fast=0[CPU_BM];
[V3]cas=strength=0.5:samples=11,deband=range=28:thra=10:thrb=10:thrc=10:blur=1[CPU_CAS];
[V4]vaguedenoiser=threshold=8:method=2:nsteps=3,owdenoise=depth=16:luma_strength=5:chroma_strength=4[CPU_VAGUE];
[V5]hqdn3d=14:10:18:14[CPU_HQ];
[V6]dctdnoiz=expr='0.006+0.0001*n':n=0.7[CPU_DCT];
[V7]deblock=filter=strong:alpha=0.08:beta=0.04[CPU_DB];
[V8]unsharp=9:9:2.2:9:9:1.8[CPU_US];
[V9]eq=contrast=1.2:saturation=1.35:gamma=0.92[CPU_EQ];

[0:v]split=4 [STD1][STD2][STD3][STD4]; \
[STD1]scale=1920:1080:flags=lanczos[STD1_SCALED]; \
[STD2]scale=1280:720:flags=lanczos[STD2_SCALED]; \
[STD3]scale=720:480:flags=lanczos[STD3_SCALED]; \
[STD4]scale=640:360:flags=lanczos[STD4_SCALED];

[CUDA_MASTER][CPU_NL][CPU_BM][CPU_CAS][CPU_VAGUE][CPU_HQ][CPU_DCT][CPU_DB][CPU_US][CPU_EQ][STD1_SCALED][STD2_SCALED][STD3_SCALED][STD4_SCALED]overlay=shortest=0:format=auto[FINAL_VIDEO];

[0:a]asplit=12[A0][A1][A2][A3][A4][A5][A6][A7][A8][A9][A10][A11];
[A0]dynaudnorm=f=350:g=30:p=0.98:m=25:c=1.2:r=0.95,loudnorm=I=-15:LRA=12:TP=-1:measured_I=-15.5:measured_LRA=10:measured_TP=-0.5:measured_thresh=-28:offset=0.8:linear=true:dual_mono=true:print_format=summary[a_norm];
[a_norm]firequalizer=gain_entry='entry(15,18);entry(60,14);entry(200,-4);entry(500,6);entry(2000,3);entry(6000,-5);entry(14000,-10)', sidechaincompress=threshold=0.002:ratio=12:attack=2.5:release=120:makeup=6:crossfeed=1, acrusher=bits=18:level_in=1.5:level_out=1.3:aa=2.0, crystalizer=i=12:c=1.2, superequalizer=1b=10:2b=8:3b=6:4b=4:5b=1:6b=-2:7b=-5:8b=-8:9b=-10:10b=-12[a_master];
[A1]rubberband=pitch=1.025:tempo=1.005[a_pitch]; [A2]aphaser=type=t:decay=0.75:delay=5:mix=0.85[a_phaser]; [A3]atempo=0.98[a_tempo]; [A4]highpass=f=60:order=4, lowpass=f=18000, afftdn=nf=-30[a_clean]; [A5]acompressor=ratio=4:threshold=-18:attack=5:release=100:makeup=3[a_comp];
[a_master][a_pitch][a_phaser][a_tempo][a_clean][a_comp]amix=inputs=6:duration=longest:dropout_transition=2[a_final];

${hdrMetadata ? '[1:v]extractplanes=r+g+b[hr][hg][hb];[hr][hg][hb]mergeplanes=0x001010:yuv444p16le,hdr10plus=metadata=[1]:apply_hdr10plus=1' : ''}
${doviRPU ? '[2:v]dolbyvision=rpu=[2]:profile=8.1:level=6.3' : ''}
" -map "[FINAL_VIDEO]" -map "[a_final]" -c:v libsvtav1 -preset 0 -crf 12 -g 360 -keyint_min 360 -c:a libopus -b:a 768k -vbr on -ac 8 -f mp4 "${outputFile}"
`;
