!/usr/bin/env bash
set -euo pipefail
IN_DIR="${PWD}/assets-src"
OUT_DIR="${PWD}/images"
MAXW="${1:-1600}"
QUALITY="${2:-0.82}"
mkdir -p "$OUT_DIR"
shopt -s nullglob
for f in "$IN_DIR"/*.{jpg,JPG,jpeg,JPEG,png,PNG}; do
  base=$(basename "$f")
  out="$OUT_DIR/${base%.*}.jpg"
  echo "• $base → $(basename "$out")"
  sips -s format jpeg "$f" --setProperty formatOptions "$QUALITY" \
       --setProperty profile "sRGB IEC61966-2.1" \
       --resampleWidth "$MAXW" --out "$out" >/dev/null
done
echo "✅ Images ready in $OUT_DIR"

