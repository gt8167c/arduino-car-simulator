#!/bin/sh
# Serve the CarK1 simulator on http://localhost:8137
cd "$(dirname "$0")" && exec python3 -m http.server 8137
