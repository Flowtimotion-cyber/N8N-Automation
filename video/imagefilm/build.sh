#!/bin/bash
# Imagefilm zusammensetzen (läuft in der Higgsfield-Sandbox, Ordner ~/film)
# Erwartet: cA.mp4 cB.mp4 cC.mp4 cD.mp4 cE.mp4, fr_e1..fr_e5 (PNG-Frames, 30 fps)
# Optional: vo.mp3 (Sprecherspur aus HeyGen) -> wird über alles gelegt, Effekte werden darunter abgesenkt
set -e
cd ~/film
W=1280; H=720; FPS=25
V="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p,setsar=1"
mkdir -p seg

# Grafik-Szenen -> Video mit leisem Whoosh
for s in e1 e2 e4 e5; do
  ffmpeg -v error -y -framerate 30 -i fr_$s/f%05d.png -f lavfi -i "anoisesrc=color=pink:amplitude=0.25:d=1.2" \
    -filter_complex "[0:v]$V[v];[1:a]highpass=f=300,lowpass=f=5000,afade=t=in:d=0.35,afade=t=out:st=0.4:d=0.8,volume=0.5,apad[a]" \
    -map "[v]" -map "[a]" -shortest -c:v libx264 -preset medium -crf 18 -c:a aac -ar 48000 -ac 2 seg/$s.mp4
done

# Kinoclips normalisieren (Ton behalten)
for c in A B C D; do
  ffmpeg -v error -y -i c$c.mp4 -vf "$V" -c:v libx264 -preset medium -crf 18 -c:a aac -ar 48000 -ac 2 seg/c$c.mp4
done
# Agent-Montage mit Einblendungen (transparente Frames drüberlegen)
ffmpeg -v error -y -i cE.mp4 -framerate 30 -i fr_e3/f%05d.png \
  -filter_complex "[0:v]scale=${W}:${H},fps=${FPS},eq=brightness=-0.06[b];[1:v]fps=${FPS}[o];[b][o]overlay=0:0:shortest=1,format=yuv420p,setsar=1[v]" \
  -map "[v]" -map 0:a -c:v libx264 -preset medium -crf 18 -c:a aac -ar 48000 -ac 2 seg/cE.mp4

ORDER="cA e1 cB e2 cE e4 cC cD e5"
# Übergänge: 0,5 s Überblendung
XF=0.5
inputs=""; i=0
for s in $ORDER; do inputs="$inputs -i seg/$s.mp4"; i=$((i+1)); done
n=$i
filt=""; prev="0:v"; preva="0:a"; off=0
idx=0
for s in $ORDER; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 seg/$s.mp4)
  if [ $idx -gt 0 ]; then
    filt="$filt[$prev][$idx:v]xfade=transition=fade:duration=$XF:offset=$off[v$idx];[$preva][$idx:a]acrossfade=d=$XF[a$idx];"
    prev="v$idx"; preva="a$idx"
  fi
  off=$(python3 -c "print(round($off + $d - ($XF if $idx < $n-1 else 0),3))")
  idx=$((idx+1))
done
# Atmosphäre: leiser Klangteppich über den ganzen Film
TOTAL=$off
filt="$filt anoisesrc=color=brown:amplitude=0.03:d=$TOTAL,lowpass=f=400,volume=0.6[bed];[$preva][bed]amix=inputs=2:normalize=0[sfx]"
ffmpeg -v error -y $inputs -filter_complex "$filt" -map "[$prev]" -map "[sfx]" -c:v libx264 -preset medium -crf 19 -c:a aac -b:a 192k -ar 48000 film_sfx.mp4

if [ -f vo.mp3 ]; then
  ffmpeg -v error -y -i film_sfx.mp4 -i vo.mp3 -filter_complex \
    "[1:a]aresample=48000,volume=1.0[vo];[0:a][vo]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];[duck][vo]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k film_final.mp4
fi
ffprobe -v error -show_entries format=duration -of csv=p=0 film_sfx.mp4
echo FERTIG
