#!/usr/bin/env bash
# Wraps index.html (written for the preview viewer) into a complete web page
# that works when opened directly or hosted. Run: bash website/build.sh
set -e
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  # title, meta and fonts from the top of index.html belong in <head>
  sed -n '1,/<style>/p' index.html | sed '$d'
  sed -n '/<style>/,/<\/style>/p' index.html
  printf '</head>\n<body>\n'
  sed -n '/<\/style>/,$p' index.html | sed '1d'
  printf '\n</body>\n</html>\n'
} > standalone/ai-for-you.html
echo "Built standalone/ai-for-you.html"
