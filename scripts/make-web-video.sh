#!/usr/bin/env bash
set -euo pipefail

INDIR="${PWD}/assets-src"
OUTDIR="${PWD}/video"
THUMB_DIR="${PWD}/images/video-thumbs"

mkdir -p "$OUTDIR" "$THUMBDIR"
shopt -s nullglob

for f in "$INDIR"/.{mov,mp4,mkv,avi,mpg}; do
  base=$(basename "$f")
  stem="${base%.}"
  out="${OUTDIR}/${stem}.mp4"
  thumb="${THUMB_DIR}/${stem}.jpg"

  echo "• $base → $(basename "$out")"
  ffmpeg -y -i "$f" \
    -vf "scale='min(1280,iw)':'min(720,ih)':forceoriginalaspectratio=decrease" \
    -c:v libx264 -preset medium -crf 22 -pixfmt yuv420p \
    -movflags +faststart \
    -c:a aac -b:a 160k -ac 2 \
    "$out"

  echo "  + poster → $(basename "$thumb")"
  ffmpeg -y -i "$out" -ss 00:00:03 -vframes 1 "$thumb"
done

echo "✅ Videos ready in $OUTDIR (thumbs in $THUMBDIR)"
