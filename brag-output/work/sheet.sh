#!/usr/bin/env bash
# Usage: sheet.sh <html> <outdir> t1,t2,... (up to 12 times) -> <outdir>/sheet.jpg in time order
set -e
html=$1; out=$2; times=$3
mkdir -p "$out"
node "$(dirname "$0")/render.cjs" "$html" "$out" stills "$times"
args=(); filt=""; lay=""; i=0
for t in ${times//,/ }; do
  f=$(printf "%s/still-%.2f.jpg" "$out" "$t"); args+=(-i "$f")
  filt+="[$i]scale=640:-1[v$i];"; lay+="$(( (i%3)*640 ))_$(( (i/3)*360 ))|"; i=$((i+1))
done
ins=""; for j in $(seq 0 $((i-1))); do ins+="[v$j]"; done
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "${filt}${ins}xstack=inputs=$i:layout=${lay%|}" -frames:v 1 "$out/sheet.jpg"
