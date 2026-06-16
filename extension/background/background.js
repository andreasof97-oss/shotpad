/**
 * ShotPad — Background Service Worker
 * 
 * Coordinates capture between popup, content scripts, and editor.
 * Handles keyboard shortcuts and message passing.
 */

// ─── Keyboard Shortcut ─────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-visible') {
    await captureVisibleArea();
  }
});

// ─── Message Router ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'capture-visible':
      captureVisibleArea().then(() => sendResponse({ success: true }));
      return true; // async response

    case 'capture-region':
      captureRegion(sender.tab?.id).then(() => sendResponse({ success: true }));
      return true;

    case 'start-region-select':
      injectRegionSelector().then(() => sendResponse({ success: true }));
      return true;

    case 'capture-fullpage':
      captureFullPage().then(() => sendResponse({ success: true }));
      return true;

    case 'region-selected':
      // Content script reports selected region coordinates
      handleRegionSelected(message.rect, sender.tab.id)
        .then(() => sendResponse({ success: true }));
      return true;

    case 'fullpage-scroll-capture':
      // Content script requests a capture at current scroll position
      captureForStitch(sender.tab.id)
        .then((dataUrl) => sendResponse({ dataUrl }));
      return true;

    case 'fullpage-stitch':
      // Content script sends all captured frames for stitching
      stitchFullPage(message.captures, message.pageWidth, message.pageHeight, message.devicePixelRatio)
        .then((dataUrl) => {
          openEditor(dataUrl);
          sendResponse({ success: true });
        });
      return true;

    case 'region-cancelled':
      sendResponse({ success: true });
      return false;
  }
});

// ─── Capture: Visible Area ──────────────────────────────────────
async function captureVisibleArea() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });

    await incrementCaptureCount();
    await openEditor(dataUrl);
  } catch (err) {
    console.error('ShotPad: captureVisibleArea failed', err);
  }
}

// ─── Capture: Region ────────────────────────────────────────────
async function injectRegionSelector() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Inject content script for region selection
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/content.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    });

    // Tell the content script to start region selection
    await chrome.tabs.sendMessage(tab.id, { action: 'start-region-select' });
  } catch (err) {
    console.error('ShotPad: injectRegionSelector failed', err);
  }
}

async function captureRegion(tabId) {
  // This is called from popup — inject and start selection
  await injectRegionSelector();
}

async function handleRegionSelected(rect, tabId) {
  try {
    // Small delay to let overlay fade out
    await sleep(100);

    // Remove the overlay before capturing
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const overlay = document.getElementById('shotpad-overlay');
        if (overlay) overlay.remove();
      }
    });

    await sleep(50);

    // Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });

    // Crop to selected region using offscreen canvas approach
    const croppedUrl = await cropImage(dataUrl, rect);

    await incrementCaptureCount();
    await openEditor(croppedUrl);
  } catch (err) {
    console.error('ShotPad: handleRegionSelected failed', err);
  }
}

// ─── Capture: Full Page ─────────────────────────────────────────
async function captureFullPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Inject content script
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/content.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    });

    // Tell content script to start full-page capture
    await chrome.tabs.sendMessage(tab.id, { action: 'start-fullpage-capture' });
  } catch (err) {
    console.error('ShotPad: captureFullPage failed', err);
  }
}

async function captureForStitch(tabId) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });
    return dataUrl;
  } catch (err) {
    console.error('ShotPad: captureForStitch failed', err);
    return null;
  }
}

async function stitchFullPage(captures, pageWidth, pageHeight, devicePixelRatio) {
  // We receive an array of { dataUrl, scrollY, viewportHeight } objects
  // We create an offscreen canvas and stitch them together
  // Since service workers can't use Canvas, we'll do this in editor
  // Instead, store all captures and let editor stitch them
  const dpr = devicePixelRatio || 1;
  const stitchData = {
    captures,
    pageWidth: pageWidth * dpr,
    pageHeight: pageHeight * dpr,
    devicePixelRatio: dpr
  };

  // Store stitch data and open editor in stitch mode
  await chrome.storage.local.set({ shotpad_stitch: stitchData });
  await incrementCaptureCount();

  // Open editor in stitch mode
  const editorUrl = chrome.runtime.getURL('editor/editor.html') + '?mode=stitch';
  await chrome.tabs.create({ url: editorUrl });
  return null; // Editor handles stitching
}

// ─── Image Cropping (via createImageBitmap in service worker) ───
async function cropImage(dataUrl, rect) {
  try {
    // Fetch the image as a blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // Use OffscreenCanvas to crop
    const dpr = rect.devicePixelRatio || 1;
    const sx = Math.round(rect.x * dpr);
    const sy = Math.round(rect.y * dpr);
    const sw = Math.round(rect.width * dpr);
    const sh = Math.round(rect.height * dpr);

    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const reader = new FileReaderSync
      ? null // not available in service worker
      : null;

    // Convert blob to data URL
    return await blobToDataUrl(croppedBlob);
  } catch (err) {
    console.error('ShotPad: cropImage failed', err);
    return dataUrl; // fallback to uncropped
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Open Editor ────────────────────────────────────────────────
async function openEditor(dataUrl) {
  if (dataUrl) {
    await chrome.storage.local.set({ shotpad_capture: dataUrl });
  }
  const editorUrl = chrome.runtime.getURL('editor/editor.html');
  await chrome.tabs.create({ url: editorUrl });
}

// ─── Capture Count Tracking ─────────────────────────────────────
async function incrementCaptureCount() {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get(['shotpad_captures']);
  const captures = result.shotpad_captures || {};

  if (!captures[today]) {
    captures[today] = 0;
  }
  captures[today]++;

  // Clean up entries older than 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  for (const key of Object.keys(captures)) {
    if (key < cutoffStr) delete captures[key];
  }

  await chrome.storage.local.set({ shotpad_captures: captures });
}

// ─── Utility ────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
