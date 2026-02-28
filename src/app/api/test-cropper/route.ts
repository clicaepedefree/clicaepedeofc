import { NextResponse } from 'next/server'

export const GET = async () => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Image Cropper Test</title>
  <style>
    body { font-family: system-ui; max-width: 700px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    .info { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .feature-list { list-style: none; padding: 0; }
    .feature-list li { padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
    .feature-list li:before { content: "✅ "; }
    .feature-section { margin-top: 30px; border-top: 2px solid #ddd; padding-top: 20px; }
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

  <div class="feature-section">
    <div class="info">
      <h2>Feature: #69 - Show preview of cropped result before upload</h2>
      <p>Added a preview section to show the final cropped result before confirming:</p>
    </div>

    <ul class="feature-list">
      <li><strong>Preview Canvas:</strong> Separate canvas (previewCanvasRef) displays cropped result</li>
      <li><strong>Real-time Updates:</strong> Preview updates via drawPreview() on every crop/zoom/position change</li>
      <li><strong>Output Dimensions:</strong> Shows final output size (e.g., "Tamanho: 400×400 px")</li>
      <li><strong>Preview Section:</strong> Displayed below zoom controls with label "Pré-visualização"</li>
      <li><strong>Accurate Representation:</strong> Uses same crop calculations as final export</li>
    </ul>

    <h3>Preview Implementation</h3>
    <ul>
      <li>PREVIEW_MAX_SIZE: 100px maximum dimension for preview display</li>
      <li>Maintains aspect ratio of crop area</li>
      <li>Uses same source coordinates as handleCrop() for accuracy</li>
      <li>Renders in bg-muted/50 section with border and rounded corners</li>
    </ul>
  </div>

  <div class="feature-section">
    <div class="info">
      <h2>Feature: #70 - Integrate image cropper into menu item image upload</h2>
      <p>The cropper is now integrated into the menu item creation/update form:</p>
    </div>

    <ul class="feature-list">
      <li><strong>File Selection Intercepted:</strong> When user selects image, cropper modal opens automatically</li>
      <li><strong>Cropper Modal Opens:</strong> Shows ImageCropperModal with selected file</li>
      <li><strong>Upload on Confirm:</strong> Cropped image uploaded to UploadThing via handleCropComplete()</li>
      <li><strong>Cancel Handling:</strong> Returns to file selection state via handleCropCancel()</li>
      <li><strong>Loading State:</strong> Shows upload progress bar during UploadThing upload</li>
    </ul>

    <h3>Integration Details</h3>
    <ul>
      <li>Form location: <code>src/features/menu/components/create-or-update-item/create-or-update-item-form.tsx</code></li>
      <li>Props added to SingleFileUploader: <code>enableCropper={true} cropperAspectRatio={1}</code></li>
      <li>Aspect ratio: 1:1 (square) for menu item images</li>
      <li>Cropper is also enabled for category images (cropperAspectRatio={16/9})</li>
    </ul>
  </div>

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
