#!/usr/bin/env bash
set -euo pipefail

# CHANGE THIS to your actual originals path on MacAlpha:
ORIG_ROOT="/Volumes/OES"

http://127.0.0.1:3000/systems/videogear.htmlSTAGE_DIR="${PWD}/assets-src"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <relative-path-under-originals> [more paths...]"
  echo "Example: $0 images-master/oe_studio video-master/lockers-demo"
  exit 1
fi

mkdir -p "$STAGE_DIR"

for sub in "$@"; do
  src="${ORIGROOT%/}/${sub%/}/"
  echo "• Pulling ${src}"
  rsync -av --progress "$src" "$STAGEDIR/" || {
    echo "Could not rsync from ${src}. Is the volume mounted?"
    exit 1
  }
done

echo "✅ Staged originals in: $STAGE_DIR"
