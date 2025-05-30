#!/bin/bash
# ffmpeg_similarity_test.sh
# Generate difference images and calculate similarity to a reference black logo region using FFmpeg and ImageMagick.
# Usage: ./ffmpeg_similarity_test.sh <input_video.ts> <reference_black_logo.png> [start_time] [frames]
# Example: ./ffmpeg_similarity_test.sh input.ts black_logo.png 00:01:10 100

set -e

INPUT_VIDEO=${1:-"input.ts"}
REFERENCE_IMG=${2:-"black_logo.png"}
START_TIME=${3:-"00:01:00"}
FRAMES=${4:-500}

# NHK logo region to mask (default)
MASK_X=13
MASK_Y=60
MASK_W=400
MASK_H=54

OUTDIR="pics"
REPORT_FILE="$OUTDIR/similarity_report.txt"
mkdir -p "$OUTDIR"

# Clear previous report if exists
>"$REPORT_FILE"

echo "Generating difference images (masking logo region)..."
ffmpeg -hide_banner -loglevel error -ss "$START_TIME" -i "$INPUT_VIDEO" -i "$REFERENCE_IMG" \
    -filter_complex "[0:v]drawbox=x=${MASK_X}:y=${MASK_Y}:w=${MASK_W}:h=${MASK_H}:color=black@1:t=fill,extractplanes=y[vid]; [1:v]drawbox=x=${MASK_X}:y=${MASK_Y}:w=${MASK_W}:h=${MASK_H}:color=black@1:t=fill,format=gray,extractplanes=y[ref]; [vid][ref]blend=all_mode=difference[diff]" \
    -map "[diff]" -frames:v "$FRAMES" "$OUTDIR"/diff_%05d.png

echo "Calculating similarity for each frame (using ImageMagick)..."
for img in "$OUTDIR"/diff_*.png; do
    mean=$(magick "$img" -colorspace Gray -format "%[fx:mean]" info: 2>/dev/null || echo "")
    if [[ -z "$mean" ]]; then
        similarity="N/A"
    else
        similarity=$(awk "BEGIN { printf \"%.2f\", (1 - $mean) * 100 }")
    fi
    line="$(basename "$img"): $similarity% similar"
    printf "%s\n" "$line"
    printf "%s\n" "$line" >>"$REPORT_FILE"
done

echo "Done. Review the $OUTDIR directory for difference images and see $REPORT_FILE for similarity scores."
