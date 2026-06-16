/**
 * ShotPad — Editor Script
 * 
 * Full-featured canvas-based image editor with annotation tools.
 * Uses a layered approach: base image + annotations re-rendered on each change.
 * Supports undo/redo via snapshot-based history.
 */

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

const state = {
  // Canvas & context
  canvas: null,
  ctx: null,

  // The base screenshot image
  baseImage: null,
  baseImageWidth: 0,
  baseImageHeight: 0,

  // Current tool & settings
  currentTool: 'arrow',
  currentColor: '#ef4444',
  lineThickness: 4,
  fontSize: 20,

  // Annotations array — each annotation is an object
  annotations: [],

  // Undo/Redo history — stores full annotation snapshots
  history: [],
  historyIndex: -1,
  maxHistory: 50,

  // Drawing state
  isDrawing: false,
  drawStart: null,
  currentAnnotation: null,
  freehandPoints: [],

  // Crop state
  isCropping: false,
  cropStart: null,
  cropRect: null,

  // Text state
  isTyping: false,
  textPosition: null,

  // Canvas offset (for mouse coordinate calculation)
  canvasRect: null,

  // Zoom
  zoom: 1
};

// ═══════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  state.canvas = document.getElementById('editor-canvas');
  state.ctx = state.canvas.getContext('2d');

  // Check if we're in stitch mode
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

  if (mode === 'stitch') {
    await loadStitchData();
  } else {
    await loadCapturedImage();
  }

  setupToolbar();
  setupColorPicker();
  setupThickness();
  setupCanvasEvents();
  setupKeyboardShortcuts();
  setupActionButtons();

  // Save initial state
  saveHistory();
});

/**
 * Load captured screenshot from chrome.storage.local
 */
async function loadCapturedImage() {
  try {
    const result = await chrome.storage.local.get(['shotpad_capture']);
    const dataUrl = result.shotpad_capture;

    if (!dataUrl) {
      showToast('No screenshot found', true);
      return;
    }

    const img = new Image();
    img.onload = () => {
      state.baseImage = img;
      state.baseImageWidth = img.naturalWidth;
      state.baseImageHeight = img.naturalHeight;
      initCanvas();
      // Clean up storage
      chrome.storage.local.remove(['shotpad_capture']);
    };
    img.onerror = () => {
      showToast('Failed to load screenshot', true);
    };
    img.src = dataUrl;
  } catch (err) {
    console.error('ShotPad: loadCapturedImage failed', err);
    showToast('Failed to load screenshot', true);
  }
}

/**
 * Load and stitch full-page capture data
 */
async function loadStitchData() {
  try {
    const result = await chrome.storage.local.get(['shotpad_stitch']);
    const stitchData = result.shotpad_stitch;

    if (!stitchData || !stitchData.captures || stitchData.captures.length === 0) {
      showToast('No full-page capture data found', true);
      return;
    }

    const { captures, pageWidth, pageHeight, devicePixelRatio } = stitchData;
    const dpr = devicePixelRatio || 1;

    // Load all capture images
    const images = await Promise.all(
      captures.map(cap => loadImage(cap.dataUrl))
    );

    // Create stitching canvas
    const stitchCanvas = document.createElement('canvas');
    stitchCanvas.width = pageWidth;
    stitchCanvas.height = pageHeight;
    const stitchCtx = stitchCanvas.getContext('2d');

    // Draw each capture at its scroll position
    for (let i = 0; i < captures.length; i++) {
      const cap = captures[i];
      const img = images[i];
      if (!img) continue;

      const y = Math.round(cap.scrollY * dpr);
      stitchCtx.drawImage(img, 0, y);
    }

    // Convert stitched canvas to image
    const stitchedDataUrl = stitchCanvas.toDataURL('image/png');
    const finalImg = await loadImage(stitchedDataUrl);

    state.baseImage = finalImg;
    state.baseImageWidth = finalImg.naturalWidth;
    state.baseImageHeight = finalImg.naturalHeight;
    initCanvas();

    // Clean up storage
    chrome.storage.local.remove(['shotpad_stitch']);
  } catch (err) {
    console.error('ShotPad: loadStitchData failed', err);
    showToast('Failed to stitch full-page capture', true);
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Initialize canvas size to match the image, fitting within viewport
 */
function initCanvas() {
  const wrapper = document.getElementById('canvas-wrapper');
  const wrapperWidth = wrapper.clientWidth - 40;
  const wrapperHeight = wrapper.clientHeight - 40;

  // Calculate zoom to fit image in viewport
  const scaleX = wrapperWidth / state.baseImageWidth;
  const scaleY = wrapperHeight / state.baseImageHeight;
  state.zoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

  // Set canvas size to actual image size (not display size)
  state.canvas.width = state.baseImageWidth;
  state.canvas.height = state.baseImageHeight;

  // Set display size via CSS
  state.canvas.style.width = Math.round(state.baseImageWidth * state.zoom) + 'px';
  state.canvas.style.height = Math.round(state.baseImageHeight * state.zoom) + 'px';

  updateZoomLabel();
  renderCanvas();
}

// ═══════════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════════

/**
 * Full canvas re-render: base image + all annotations
 */
function renderCanvas() {
  const { ctx, canvas, baseImage, annotations } = state;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw base image
  if (baseImage) {
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  }

  // Draw all annotations
  for (const ann of annotations) {
    drawAnnotation(ctx, ann);
  }

  // Draw current in-progress annotation (while dragging)
  if (state.currentAnnotation) {
    drawAnnotation(ctx, state.currentAnnotation);
  }
}

/**
 * Draw a single annotation object on the canvas
 */
function drawAnnotation(ctx, ann) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (ann.type) {
    case 'arrow':
      drawArrow(ctx, ann);
      break;
    case 'rectangle':
      drawRectangle(ctx, ann);
      break;
    case 'ellipse':
      drawEllipse(ctx, ann);
      break;
    case 'line':
      drawLine(ctx, ann);
      break;
    case 'freehand':
      drawFreehand(ctx, ann);
      break;
    case 'text':
      drawText(ctx, ann);
      break;
    case 'blur':
      drawBlur(ctx, ann);
      break;
  }

  ctx.restore();
}

function drawArrow(ctx, ann) {
  const { x1, y1, x2, y2, thickness } = ann;
  const headLength = Math.max(thickness * 4, 12);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  // Draw line
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawRectangle(ctx, ann) {
  const { x1, y1, x2, y2 } = ann;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  ctx.strokeRect(x, y, w, h);
}

function drawEllipse(ctx, ann) {
  const { x1, y1, x2, y2 } = ann;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLine(ctx, ann) {
  ctx.beginPath();
  ctx.moveTo(ann.x1, ann.y1);
  ctx.lineTo(ann.x2, ann.y2);
  ctx.stroke();
}

function drawFreehand(ctx, ann) {
  if (!ann.points || ann.points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(ann.points[0].x, ann.points[0].y);

  for (let i = 1; i < ann.points.length; i++) {
    ctx.lineTo(ann.points[i].x, ann.points[i].y);
  }
  ctx.stroke();
}

function drawText(ctx, ann) {
  ctx.font = `bold ${ann.fontSize}px Arial, sans-serif`;
  ctx.fillStyle = ann.color;
  ctx.textBaseline = 'top';

  // Draw each line of text
  const lines = ann.text.split('\n');
  const lineHeight = ann.fontSize * 1.3;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], ann.x, ann.y + i * lineHeight);
  }
}

function drawBlur(ctx, ann) {
  const { x1, y1, x2, y2 } = ann;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  if (w < 2 || h < 2) return;

  // Get the pixel data for the region
  const imageData = ctx.getImageData(x, y, w, h);
  pixelate(imageData, 10);
  ctx.putImageData(imageData, x, y);
}

/**
 * Pixelate image data in-place
 */
function pixelate(imageData, blockSize) {
  const { data, width, height } = imageData;

  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      // Average the colors in this block
      let r = 0, g = 0, b = 0, a = 0, count = 0;

      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          const idx = (y * width + x) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
          count++;
        }
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      a = Math.round(a / count);

      // Fill the block with the average color
      for (let y = by; y < Math.min(by + blockSize, height); y++) {
        for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
          const idx = (y * width + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// CANVAS MOUSE EVENTS
// ═══════════════════════════════════════════════════════════════════

function setupCanvasEvents() {
  const canvas = state.canvas;
  const wrapper = document.getElementById('canvas-wrapper');

  canvas.addEventListener('mousedown', onCanvasMouseDown);
  canvas.addEventListener('mousemove', onCanvasMouseMove);
  canvas.addEventListener('mouseup', onCanvasMouseUp);

  // Also listen on wrapper for crop overlay
  const cropOverlay = document.getElementById('crop-overlay');
  cropOverlay.addEventListener('mousedown', onCropMouseDown);
  cropOverlay.addEventListener('mousemove', onCropMouseMove);
  cropOverlay.addEventListener('mouseup', onCropMouseUp);

  // Update canvas rect on resize
  window.addEventListener('resize', () => {
    if (state.baseImage) {
      initCanvas();
    }
  });
}

/**
 * Convert mouse event to canvas coordinates (accounting for zoom)
 */
function getCanvasCoords(e) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function onCanvasMouseDown(e) {
  if (e.button !== 0) return; // Left click only
  if (state.currentTool === 'crop') return; // Crop uses overlay
  
  const coords = getCanvasCoords(e);

  // If typing, commit text first
  if (state.isTyping) {
    commitText();
  }

  if (state.currentTool === 'text') {
    startText(coords);
    return;
  }

  state.isDrawing = true;
  state.drawStart = coords;

  if (state.currentTool === 'freehand') {
    state.freehandPoints = [coords];
    state.currentAnnotation = {
      type: 'freehand',
      points: [coords],
      color: state.currentColor,
      thickness: state.lineThickness
    };
  } else {
    state.currentAnnotation = {
      type: state.currentTool,
      x1: coords.x,
      y1: coords.y,
      x2: coords.x,
      y2: coords.y,
      color: state.currentColor,
      thickness: state.lineThickness
    };
  }
}

function onCanvasMouseMove(e) {
  if (!state.isDrawing || !state.currentAnnotation) return;

  const coords = getCanvasCoords(e);

  if (state.currentTool === 'freehand') {
    state.freehandPoints.push(coords);
    state.currentAnnotation.points = [...state.freehandPoints];
  } else {
    state.currentAnnotation.x2 = coords.x;
    state.currentAnnotation.y2 = coords.y;
  }

  renderCanvas();
}

function onCanvasMouseUp(e) {
  if (!state.isDrawing || !state.currentAnnotation) return;

  const coords = getCanvasCoords(e);
  state.isDrawing = false;

  if (state.currentTool === 'freehand') {
    state.freehandPoints.push(coords);
    state.currentAnnotation.points = [...state.freehandPoints];
  } else {
    state.currentAnnotation.x2 = coords.x;
    state.currentAnnotation.y2 = coords.y;
  }

  // Only add if there's meaningful content
  const ann = state.currentAnnotation;
  let isValid = false;

  if (ann.type === 'freehand') {
    isValid = ann.points.length > 2;
  } else {
    const dx = Math.abs(ann.x2 - ann.x1);
    const dy = Math.abs(ann.y2 - ann.y1);
    isValid = dx > 2 || dy > 2;
  }

  if (isValid) {
    state.annotations.push(state.currentAnnotation);
    saveHistory();
  }

  state.currentAnnotation = null;
  state.freehandPoints = [];
  renderCanvas();
}

// ═══════════════════════════════════════════════════════════════════
// TEXT TOOL
// ═══════════════════════════════════════════════════════════════════

function startText(coords) {
  state.isTyping = true;
  state.textPosition = coords;

  const textInput = document.getElementById('text-input');
  const rect = state.canvas.getBoundingClientRect();
  const wrapper = document.getElementById('canvas-wrapper');
  const wrapperRect = wrapper.getBoundingClientRect();

  // Position the textarea at the click location
  const displayX = (coords.x / state.canvas.width) * rect.width + rect.left - wrapperRect.left + wrapper.scrollLeft;
  const displayY = (coords.y / state.canvas.height) * rect.height + rect.top - wrapperRect.top + wrapper.scrollTop;

  textInput.style.left = displayX + 'px';
  textInput.style.top = displayY + 'px';
  textInput.style.display = 'block';
  textInput.style.color = state.currentColor;
  textInput.style.fontSize = (state.fontSize * state.zoom) + 'px';
  textInput.value = '';
  textInput.focus();

  // Handle Enter key to commit (Shift+Enter for newline)
  textInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitText();
    }
    if (e.key === 'Escape') {
      cancelText();
    }
  };
}

function commitText() {
  const textInput = document.getElementById('text-input');
  const text = textInput.value.trim();

  if (text && state.textPosition) {
    state.annotations.push({
      type: 'text',
      x: state.textPosition.x,
      y: state.textPosition.y,
      text,
      color: state.currentColor,
      fontSize: state.fontSize,
      thickness: state.lineThickness
    });
    saveHistory();
    renderCanvas();
  }

  textInput.style.display = 'none';
  textInput.value = '';
  state.isTyping = false;
  state.textPosition = null;
}

function cancelText() {
  const textInput = document.getElementById('text-input');
  textInput.style.display = 'none';
  textInput.value = '';
  state.isTyping = false;
  state.textPosition = null;
}

// ═══════════════════════════════════════════════════════════════════
// CROP TOOL
// ═══════════════════════════════════════════════════════════════════

function onCropMouseDown(e) {
  if (state.currentTool !== 'crop') return;

  const rect = state.canvas.getBoundingClientRect();
  const wrapper = document.getElementById('canvas-wrapper');
  const wrapperRect = wrapper.getBoundingClientRect();

  // Calculate position relative to canvas display
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Clamp to canvas bounds
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  state.isCropping = true;
  state.cropStart = { x, y };

  const selection = document.getElementById('crop-selection');
  selection.style.display = 'block';
  selection.style.left = (rect.left - wrapperRect.left + wrapper.scrollLeft + x) + 'px';
  selection.style.top = (rect.top - wrapperRect.top + wrapper.scrollTop + y) + 'px';
  selection.style.width = '0px';
  selection.style.height = '0px';
}

function onCropMouseMove(e) {
  if (!state.isCropping) return;

  const rect = state.canvas.getBoundingClientRect();
  const wrapper = document.getElementById('canvas-wrapper');
  const wrapperRect = wrapper.getBoundingClientRect();

  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

  const sx = Math.min(state.cropStart.x, x);
  const sy = Math.min(state.cropStart.y, y);
  const sw = Math.abs(x - state.cropStart.x);
  const sh = Math.abs(y - state.cropStart.y);

  const selection = document.getElementById('crop-selection');
  selection.style.left = (rect.left - wrapperRect.left + wrapper.scrollLeft + sx) + 'px';
  selection.style.top = (rect.top - wrapperRect.top + wrapper.scrollTop + sy) + 'px';
  selection.style.width = sw + 'px';
  selection.style.height = sh + 'px';

  state.cropRect = { x: sx, y: sy, width: sw, height: sh };
}

function onCropMouseUp(e) {
  if (!state.isCropping) return;
  state.isCropping = false;

  if (!state.cropRect || state.cropRect.width < 10 || state.cropRect.height < 10) {
    cancelCrop();
    return;
  }

  // Show confirm/cancel buttons
  showCropConfirm();
}

function showCropConfirm() {
  const selection = document.getElementById('crop-selection');
  
  // Remove existing buttons
  const existing = document.querySelector('.crop-confirm');
  if (existing) existing.remove();

  const btnContainer = document.createElement('div');
  btnContainer.className = 'crop-confirm';
  btnContainer.style.left = selection.style.left;
  btnContainer.style.top = (parseInt(selection.style.top) + parseInt(selection.style.height) + 8) + 'px';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'crop-btn confirm';
  confirmBtn.textContent = '✓ Crop';
  confirmBtn.onclick = applyCrop;

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'crop-btn cancel';
  cancelBtn.textContent = '✕ Cancel';
  cancelBtn.onclick = cancelCrop;

  btnContainer.appendChild(confirmBtn);
  btnContainer.appendChild(cancelBtn);

  document.getElementById('crop-overlay').appendChild(btnContainer);
}

function applyCrop() {
  if (!state.cropRect) return;

  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;

  // Convert display coordinates to canvas coordinates
  const cx = Math.round(state.cropRect.x * scaleX);
  const cy = Math.round(state.cropRect.y * scaleY);
  const cw = Math.round(state.cropRect.width * scaleX);
  const ch = Math.round(state.cropRect.height * scaleY);

  // Render current state (base + annotations) to a temp canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = state.canvas.width;
  tempCanvas.height = state.canvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(state.canvas, 0, 0);

  // Create cropped image
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cw;
  croppedCanvas.height = ch;
  const croppedCtx = croppedCanvas.getContext('2d');
  croppedCtx.drawImage(tempCanvas, cx, cy, cw, ch, 0, 0, cw, ch);

  // Convert to image and set as new base
  const croppedImg = new Image();
  croppedImg.onload = () => {
    state.baseImage = croppedImg;
    state.baseImageWidth = cw;
    state.baseImageHeight = ch;
    state.annotations = []; // Clear annotations (they're baked into the crop)
    state.currentAnnotation = null;
    initCanvas();
    saveHistory();
    cancelCrop();
    setTool('arrow'); // Switch back to arrow after crop
  };
  croppedImg.src = croppedCanvas.toDataURL('image/png');
}

function cancelCrop() {
  const selection = document.getElementById('crop-selection');
  selection.style.display = 'none';

  const confirm = document.querySelector('.crop-confirm');
  if (confirm) confirm.remove();

  state.cropRect = null;
  state.isCropping = false;
}

// ═══════════════════════════════════════════════════════════════════
// TOOLBAR SETUP
// ═══════════════════════════════════════════════════════════════════

function setupToolbar() {
  const toolBtns = document.querySelectorAll('.tool-btn');

  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      setTool(tool);
    });
  });
}

function setTool(tool) {
  // Commit any in-progress text
  if (state.isTyping) {
    commitText();
  }

  // Cancel any in-progress crop
  if (state.currentTool === 'crop' && tool !== 'crop') {
    cancelCrop();
    document.getElementById('crop-overlay').style.display = 'none';
  }

  state.currentTool = tool;

  // Update button states
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  // Show/hide crop overlay
  const cropOverlay = document.getElementById('crop-overlay');
  cropOverlay.style.display = tool === 'crop' ? 'block' : 'none';

  // Update cursor
  if (tool === 'text') {
    state.canvas.style.cursor = 'text';
  } else if (tool === 'crop') {
    state.canvas.style.cursor = 'default';
  } else {
    state.canvas.style.cursor = 'crosshair';
  }
}

function setupColorPicker() {
  const swatches = document.querySelectorAll('.color-swatch');
  const customColor = document.getElementById('custom-color');

  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      state.currentColor = swatch.dataset.color;
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  });

  customColor.addEventListener('input', (e) => {
    state.currentColor = e.target.value;
    swatches.forEach(s => s.classList.remove('active'));
  });
}

function setupThickness() {
  const thickBtns = document.querySelectorAll('.thickness-btn');

  thickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      state.lineThickness = parseInt(btn.dataset.thickness);
      thickBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't capture shortcuts when typing text
    if (state.isTyping) return;

    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    // Redo: Ctrl+Y or Ctrl+Shift+Z
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }

    // Tool shortcuts
    switch (e.key.toLowerCase()) {
      case 'a': setTool('arrow'); break;
      case 'r': setTool('rectangle'); break;
      case 'c': setTool('ellipse'); break;
      case 'l': setTool('line'); break;
      case 'd': setTool('freehand'); break;
      case 't': setTool('text'); break;
      case 'b': setTool('blur'); break;
      case 'x': setTool('crop'); break;
      case 'escape':
        if (state.currentTool === 'crop') {
          cancelCrop();
          document.getElementById('crop-overlay').style.display = 'none';
          setTool('arrow');
        }
        if (state.isTyping) {
          cancelText();
        }
        break;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// HISTORY (UNDO/REDO)
// ═══════════════════════════════════════════════════════════════════

function saveHistory() {
  // Trim any future states if we're not at the end
  state.history = state.history.slice(0, state.historyIndex + 1);

  // Deep clone current annotations
  const snapshot = JSON.parse(JSON.stringify(state.annotations));
  state.history.push(snapshot);

  // Cap history size
  if (state.history.length > state.maxHistory) {
    state.history.shift();
  }

  state.historyIndex = state.history.length - 1;
  updateUndoRedoButtons();
}

function undo() {
  if (state.historyIndex <= 0) return;

  state.historyIndex--;
  state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  renderCanvas();
  updateUndoRedoButtons();
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;

  state.historyIndex++;
  state.annotations = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
  renderCanvas();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');

  if (undoBtn) undoBtn.classList.toggle('disabled', state.historyIndex <= 0);
  if (redoBtn) redoBtn.classList.toggle('disabled', state.historyIndex >= state.history.length - 1);
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT (DOWNLOAD / COPY)
// ═══════════════════════════════════════════════════════════════════

function downloadPNG() {
  const link = document.createElement('a');
  link.download = `shotpad-${Date.now()}.png`;
  link.href = state.canvas.toDataURL('image/png');
  link.click();
}

async function copyToClipboard() {
  try {
    const blob = await new Promise(resolve => {
      state.canvas.toBlob(resolve, 'image/png');
    });

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);

    showToast('Copied to clipboard!');
  } catch (err) {
    console.error('Clipboard copy failed:', err);
    showToast('Copy failed — try downloading instead', 'error');
  }
}

function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ═══════════════════════════════════════════════════════════════════
// ACTION BUTTONS SETUP
// ═══════════════════════════════════════════════════════════════════

function setupActionButtons() {
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const downloadBtn = document.getElementById('btn-download');
  const copyBtn = document.getElementById('btn-copy');

  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (redoBtn) redoBtn.addEventListener('click', redo);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadPNG);
  if (copyBtn) copyBtn.addEventListener('click', copyToClipboard);
}

// ═══════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

async function init() {
  state.canvas = document.getElementById('editor-canvas');
  state.ctx = state.canvas.getContext('2d');

  // Setup all UI
  setupToolbar();
  setupColorPicker();
  setupThickness();
  setupCanvasEvents();
  setupKeyboardShortcuts();
  setupActionButtons();

  // Load the captured image
  await loadCapturedImage();

  // Save initial history state
  saveHistory();
  updateUndoRedoButtons();

  // Set default tool
  setTool('arrow');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);