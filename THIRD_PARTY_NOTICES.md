# Third-party notices

Lightboard uses Google's MediaPipe Tasks Vision runtime, installed from `@mediapipe/tasks-vision` (version pinned in `package-lock.json`). MediaPipe is distributed under the Apache License 2.0. See https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE.

The setup script downloads Google's official Hand Landmarker model from:
https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

Model documentation and applicable upstream information:
https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker

Generated deployment assets are copied into `dist/vendor`. Upstream runtime/model rights remain with their respective owners. These files are not authored by Lightboard contributors.
