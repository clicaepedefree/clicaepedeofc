import { NextResponse } from 'next/server'

export const GET = async () => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Image Cropper Test</title>
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    .info { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .feature-list { list-style: none; padding: 0; }
    .feature-list li { padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
    .feature-list li:before { content: "✅ "; }
  </style>
</head>
<body>
  <h1>Image Cropper Component Test</h1>

  <div class="info">
    <h2>Feature: #68 - Allow zoom/scale adjustment in image cropper</h2>
    <p>The ImageCropperModal component has been updated with the following features:</p>
  </div>

  <ul class="feature-list">
    <li><strong>Zoom Slider:</strong> Range input slider between +/- buttons for precise zoom control</li>
    <li><strong>Zoom Limits:</strong> Configurable MIN_ZOOM (0.5x) and MAX_ZOOM (3x) constants</li>
    <li><strong>Real-time Preview:</strong> Canvas updates instantly when zoom changes via drawCanvas()</li>
    <li><strong>Pinch-to-zoom:</strong> Touch devices can use two-finger pinch gestures for zooming</li>
    <li><strong>Zoom Indicator:</strong> Shows current zoom level as percentage (e.g., "150%")</li>
    <li><strong>Mouse Wheel Zoom:</strong> Scroll wheel zooms in/out on the canvas</li>
    <li><strong>Reset Button:</strong> Returns zoom to 100% and centers image</li>
  </ul>

  <h3>Implementation Details</h3>
  <ul>
    <li>Located at: <code>src/shared/image-cropper-modal.tsx</code></li>
    <li>Used by: <code>SingleFileUploader</code> when <code>enableCropper={true}</code></li>
    <li>Pinch gesture detection via <code>getTouchDistance()</code></li>
    <li>Smooth zoom sensitivity: 0.01 for pinch gestures</li>
  </ul>
</body>
</html>
  `

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
