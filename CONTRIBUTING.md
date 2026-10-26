# Contributing

Use Node.js 22 LTS and npm. Run `npm ci`, `npm run setup`, and `npm start`.

Before a pull request, run:

```sh
npm run check
npm test
npm run build
```

Keep camera frames and inference in the browser. Do not add telemetry, uploads, or secrets to the client. Keep paths relative so the app works under a GitHub Pages repository subdirectory. Do not commit `node_modules`, `vendor`, `dist`, personal drawings, or browser data.

Changes to calibration or gestures should include meaningful tests. Check drawing, undo/redo, export, and the browser tracking diagnostic. Describe physical hardware testing separately from automated checks; a passing model diagnostic does not verify projector alignment.
