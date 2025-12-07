#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INDIR="${ROOT_DIR}/scripts/assets-src"
OUTDIR="${ROOT_DIR}/scripts/assets-cmprsd"
THUMB_DIR="${ROOT_DIR}/images/video-thumbs"

mkdir -p "$OUTDIR" "$THUMB_DIR"
shopt -s nullglob

for f in "$INDIR"/*.{mov,mp4,mkv,avi,mpg,MOV,MP4,MKV,AVI,MPG}; do
  base=$(basename "$f")
  stem="${base%.*}"
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

echo "✅ Videos ready in $OUTDIR (thumbs in $THUMB_DIR)"
