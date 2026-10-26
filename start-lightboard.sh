#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22 LTS or newer, then run this launcher again.'
  exit 1
fi
if [[ ! -d node_modules/@mediapipe/tasks-vision ]]; then npm ci; fi
if [[ ! -f vendor/hand_landmarker.task || ! -f vendor/vision_bundle.js ]]; then npm run setup; fi
npm start
