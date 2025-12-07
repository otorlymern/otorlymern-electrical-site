#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
IN_DIR="${ROOT_DIR}/scripts/assets-src"
OUT_DIR="${ROOT_DIR}/scripts/assets-cmprsd"
PDF_PRESET="${1:-/ebook}"

command -v gs >/dev/null || { echo "Ghostscript (gs) is required for PDF compression."; exit 1; }

mkdir -p "$OUT_DIR"
shopt -s nullglob

for f in "$IN_DIR"/*.{pdf,PDF}; do
  base=$(basename "$f")
  out="$OUT_DIR/${base%.*}.pdf"
  echo "• $base → $(basename "$out")"
  gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 \
     -dNOPAUSE -dQUIET -dBATCH \
     -dPDFSETTINGS="$PDF_PRESET" \
     -sOutputFile="$out" "$f"
done

echo "✅ PDFs ready in $OUT_DIR (preset: $PDF_PRESET)"
