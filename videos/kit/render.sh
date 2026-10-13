#!/bin/bash
# usage: render.sh KEY [quality]
K=$1; Q=${2:-looks}
export HYPERFRAMES_BROWSER_PATH=$(cat /home/claude/studio/kit/browser_path)
cd /home/claude/studio/kit/out/$K || exit 1
mkdir -p /home/claude/studio/kit/renders
S=$(date +%s)
/home/claude/studio/node_modules/.bin/hyperframes render . -o /home/claude/studio/kit/renders/$K.mp4 -f 25 -q $Q --crf 23 -w 2 --quiet > /home/claude/studio/kit/renders/$K.log 2>&1
echo "EXIT $? $(( $(date +%s)-S ))s" >> /home/claude/studio/kit/renders/$K.log
