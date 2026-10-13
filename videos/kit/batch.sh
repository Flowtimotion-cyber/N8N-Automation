#!/bin/bash
V=/home/claude/studio/course/videos_v2
for K in "$@"; do
  ./render.sh $K
  if [ -f renders/$K.mp4 ]; then
    ffmpeg -v error -y -i renders/$K.mp4 -c:v libx264 -crf 24 -preset medium -af loudnorm=I=-14:TP=-1 -c:a aac -b:a 128k -movflags +faststart -f mp4 $V/$K.mp4.new && mv $V/$K.mp4.new $V/$K.mp4
    ffmpeg -v error -y -i renders/$K.mp4 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -crf 36 -b:v 0 -af loudnorm=I=-14:TP=-1 -c:a libopus -b:a 96k -f webm $V/$K.webm.new && mv $V/$K.webm.new $V/$K.webm
    echo "$K encoded $(date +%T)" >> renders/batch.log
  else
    echo "$K FAILED" >> renders/batch.log
  fi
done
echo ALLDONE >> renders/batch.log
