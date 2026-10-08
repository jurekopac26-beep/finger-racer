#!/bin/sh
# Publishes the game to Netlify (site b6f15175-025f-4d35-b8de-fc1a3dd20956) — only the files the game needs.
cd "$(dirname "$0")" || exit 1
STAGE="$(mktemp -d)"
cp index.html paho-mqtt.js qrcode.js favicon.svg favicon-32x32.png favicon.ico apple-touch-icon.png icon-192.png icon-512.png manifest.json "$STAGE"/ || exit 1
netlify deploy --prod --dir="$STAGE" --site=b6f15175-025f-4d35-b8de-fc1a3dd20956 --message "${1:-auto deploy}"
STATUS=$?
rm -rf "$STAGE"
exit $STATUS
