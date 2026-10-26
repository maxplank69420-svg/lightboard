# Lightboard

A projector whiteboard with a black canvas, white default ink, webcam fingertip tracking, perspective calibration, and hands-free tool selection. Runs in a modern desktop Chrome or Edge browser. No accounts or cloud processing.

## Use online

Open [Lightboard](https://maxplank69420-svg.github.io/lightboard/) in desktop Chrome or Edge, allow camera access, and follow the projector setup below. All camera processing stays on your device. The hosted app downloads its model from this same site; internet is required to load the site and model.

## Run locally

```sh
npm install
npm run setup
npm start
```

You can also run `bash ./start-lightboard.sh` to install missing dependencies and start the app.

Open **http://localhost:4173**. Setup downloads the official MediaPipe hand model and copies its runtime into `vendor/`. Once installed, the app works without an internet connection. Node.js 22 LTS or newer is required.

## Projector + webcam

1. Connect your projector and select **Extend** in your computer's display settings. The projector is the extra display; Lightboard does not install a display driver or create a virtual display.
2. Secure the webcam on the projector, facing the wall. Keep the whole projected rectangle and your hand in view. Avoid obstructing projector vents. Keep some room light so the camera can see your hand.
3. Move the browser window to the projector. Click **Fullscreen** or press **F**. Fullscreen before calibrating, since calibration depends on the projected area.
4. Open **Setup**, select your webcam, and click **Connect camera**. Allow the browser's camera permission.
5. Click **Calibrate projection**. Put your index fingertip at each numbered target. With your finger held still, press **Space**, or use **Capture in 3 seconds** and move your finger to the target. Repeat for all four targets.
6. Draw on the wall with just your index finger extended and your other fingers curled. **Open your hand to pause**. Alternatively choose pinch mode: keep the index finger pointing and pinch your thumb to your middle finger to draw.
7. Hold the fingertip over a pen, color, eraser, undo, or redo button for about a second to select it without using the computer. Save, clear, and settings are available with the mouse. H hides the controls, leaving a small restore button.

The camera detects the fingertip's position, **not physical wall contact**. Gestures control whether ink is on. Finger tracking can fail if your hand is too small in the camera frame, blurred, blocked, or poorly lit. For a very large projection, test webcam resolution and placement. Recalibrate whenever you move the projector/camera or change projection geometry, zoom, keystone, or display arrangement. An aspect-ratio change invalidates calibration automatically. Calibration for a different camera is also invalidated.

## Drawing controls

- Pen (**P**), eraser (**E**), five preset colors, custom color, brush size, undo/redo.
- Undo: **Ctrl/⌘ Z**. Redo: **Ctrl/⌘ Shift Z**.
- Fullscreen: **F**. Show/hide controls: **H**. Cancel calibration: **Escape**.
- Mouse, pen, and touch input work with no camera.
- **Save** exports a PNG with a black background. The canvas is also saved in this browser's local storage. Changing browsers or clearing browser data removes that local copy; export important work.
- Clear has confirmation and can be undone during the current session. Undo history is session-only.

## Verification

```sh
npm test
npm run check
```

Tests cover perspective mapping, mirrored/rotated mounts, invalid calibration, drawing bounds, and gesture behavior. Open `/tests/diagnostics.html` on the running local server to verify actual local model initialization and frame inference without requiring a camera.

Camera/projector hardware accuracy must be checked on the physical installation. All camera frames and model inference remain in the browser. Camera processing stops when disconnected or when the page closes; drawing pauses when the tab is hidden or loses focus.

Hand tracking uses Google's [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js), pinned in `package-lock.json`.

## Build and GitHub Pages

```sh
npm ci
npm run setup
npm run build
```

`dist/` contains the complete static site, including the hand tracking runtime and model. Asset paths are relative so repository subdirectories work. The build includes a `.nojekyll` file. Build output, dependencies, and generated model files are excluded from source control.

The [deployment workflow](.github/workflows/pages.yml) checks and builds every pull request and deploys pushes to `main` using GitHub Pages. In repository **Settings → Pages**, choose **GitHub Actions** as the source. No deployment secrets are required. The workflow uses GitHub's scoped Pages deployment token.

Use the [hosted diagnostic](https://maxplank69420-svg.github.io/lightboard/tests/diagnostics.html) to verify local model initialization and test-frame inference. Webcam and projector alignment must still be tested on your hardware.

Drawings and calibration are saved per browser origin: the hosted app and localhost have separate storage. Export important drawings as PNG before switching.

## Repository layout

- `src/app.js`: drawing, camera lifecycle, calibration, and controls.
- `src/geometry.js`: perspective transformation and gesture detection.
- `src/tracker.js`: background hand tracking worker.
- `scripts/`: setup, local server, and static build.
- `tests/`: geometry/gesture tests and browser inference diagnostic.
- `.github/workflows/pages.yml`: verification and Pages deployment.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for upstream runtime/model information.

## Small hands / distant webcam

In **Setup**, use **High** (request 1080p) or **Maximum** (request 4K), then reconnect. The actual camera resolution is displayed below the preview; requesting 4K cannot make a lower-resolution webcam supply 4K detail. Increase **Tracking crop** and click the preview to center its green box on your drawing area. The detector receives that crop, and detections are mapped back into the full camera image so crop adjustments preserve calibration. Keep every calibration target and the entire drawing area inside the crop.

If bare-hand recognition still fails, select **Colored fingertip marker · long range**. Put bright pink tape or a colored cap on your fingertip, choose its color in Setup, reconnect, and recalibrate using the marker at each target. This tracks a colored patch instead of recognizing finger joints. Choose a color different from projected ink and objects in view. Similar-sized matching patches cause tracking to pause rather than guess.

Marker ink starts paused. Press **Space**, click **Ink paused**, or dwell over that projected button to start/stop drawing. Cover the marker to reposition without drawing. This mode cannot distinguish wall contact or recognize hand gestures. No camera frames leave the browser.

Cropping makes a small hand or marker larger in the detector's input; it cannot recover missing sensor detail or motion blur. Actual usable distance depends on your installation and needs physical testing.

## Erase

Click **Erase** in the bottom toolbar or press **E**. It starts with a broad brush (48), has its own saved-in-session size, and the size slider adjusts it up to 120. With the webcam, use your normal drawing gesture (or marker ink) to erase; the cursor becomes a dashed eraser circle. Hold over the projected Erase button to select it from the wall. Press **P** or select a color to return to drawing. Undo restores erased ink. The clear button removes the whole canvas after confirmation and is also undoable.
