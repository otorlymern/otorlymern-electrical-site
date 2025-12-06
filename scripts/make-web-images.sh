#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IN_DIR="${ROOT_DIR}/scripts/assets-src"
OUT_DIR="${ROOT_DIR}/assets-cmprsd"
MAXW="${1:-1600}"
QUALITY="${2:-0.82}"

mkdir -p "$OUT_DIR"
shopt -s nullglob

for f in "$IN_DIR"/*.{jpg,JPG,jpeg,JPEG,png,PNG}; do
  base=$(basename "$f")
  out="$OUT_DIR/${base%.*}.jpg"
  echo "• $base → $(basename "$out")"
  sips -s format jpeg "$f" --setProperty formatOptions "$QUALITY" \
     --resampleWidth "$MAXW" --out "$out" >/dev/null
done

echo "✅ Images ready in $OUT_DIR"
