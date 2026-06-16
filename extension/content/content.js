/**
 * ShotPad — Content Script
 * 
 * Handles two modes:
 * 1. Region selection — overlay where user draws a rectangle
 * 2. Full page scroll-stitch — scrolls page and captures at each position
 */

(() => {
  // Guard against double injection
  if (window.__shotpadInjected) return;
  window.__shotpadInjected = true;

  // ─── Message Listener ───────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'start-region-select':
        startRegionSelect();
        sendResponse({ success: true });
        break;
      case 'start-fullpage-capture':
        startFullPageCapture();
        sendResponse({ success: true });
        break;
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // REGION SELECTION
  // ═══════════════════════════════════════════════════════════════

  function startRegionSelect() {
    // Remove any existing overlay
    cleanup();

    const overlay = document.createElement('div');
    overlay.id = 'shotpad-overlay';

    // Tooltip instruction
    const tooltip = document.createElement('div');
    tooltip.id = 'shotpad-tooltip';
    tooltip.textContent = 'Click and drag to select a region • ESC to cancel';
    overlay.appendChild(tooltip);

    // Dim layers (top, bottom, left, right)
    const dimTop = createDim('shotpad-dim-top');
    const dimBottom = createDim('shotpad-dim-bottom');
    const dimLeft = createDim('shotpad-dim-left');
    const dimRight = createDim('shotpad-dim-right');
    overlay.appendChild(dimTop);
    overlay.appendChild(dimBottom);
    overlay.appendChild(dimLeft);
    overlay.appendChild(dimRight);

    // Set initial full-screen dim
    dimTop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.45);pointer-events:none;z-index:2147483646;';

    // Selection rectangle
    const selection = document.createElement('div');
    selection.id = 'shotpad-selection';
    selection.style.display = 'none';
    overlay.appendChild(selection);

    // Dimensions label
    const dimLabel = document.createElement('div');
    dimLabel.id = 'shotpad-dimensions';
    dimLabel.style.display = 'none';
    overlay.appendChild(dimLabel);

    document.body.appendChild(overlay);

    let isDrawing = false;
    let startX = 0;
    let startY = 0;

    function onMouseDown(e) {
      if (e.button !== 0) return; // Left click only
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;

      selection.style.display = 'block';
      dimLabel.style.display = 'block';
      tooltip.style.display = 'none';

      updateSelection(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    }

    function onMouseMove(e) {
      if (!isDrawing) return;
      updateSelection(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    }

    function onMouseUp(e) {
      if (!isDrawing) return;
      isDrawing = false;

      const rect = getRect(startX, startY, e.clientX, e.clientY);
      
      // Minimum selection size: 10x10
      if (rect.width < 10 || rect.height < 10) {
        cleanup();
        return;
      }

      // Send the selected region to background
      rect.devicePixelRatio = window.devicePixelRatio || 1;
      chrome.runtime.sendMessage({
        action: 'region-selected',
        rect
      });

      // Cleanup is handled by background after capture
      e.preventDefault();
      e.stopPropagation();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cleanup();
        chrome.runtime.sendMessage({ action: 'region-cancelled' });
      }
    }

    function updateSelection(currentX, currentY) {
      const rect = getRect(startX, startY, currentX, currentY);

      // Update selection box
      selection.style.left = rect.x + 'px';
      selection.style.top = rect.y + 'px';
      selection.style.width = rect.width + 'px';
      selection.style.height = rect.height + 'px';

      // Update dim layers around selection
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Top dim: full width, from top to selection top
      dimTop.style.cssText = `position:fixed;top:0;left:0;width:${w}px;height:${rect.y}px;background:rgba(0,0,0,0.45);pointer-events:none;z-index:2147483646;`;
      // Bottom dim: full width, from selection bottom to screen bottom
      dimBottom.style.cssText = `position:fixed;top:${rect.y + rect.height}px;left:0;width:${w}px;height:${h - rect.y - rect.height}px;background:rgba(0,0,0,0.45);pointer-events:none;z-index:2147483646;`;
      // Left dim: from selection top to selection bottom, left edge to selection left
      dimLeft.style.cssText = `position:fixed;top:${rect.y}px;left:0;width:${rect.x}px;height:${rect.height}px;background:rgba(0,0,0,0.45);pointer-events:none;z-index:2147483646;`;
      // Right dim: from selection top to selection bottom, selection right to screen right
      dimRight.style.cssText = `position:fixed;top:${rect.y}px;left:${rect.x + rect.width}px;width:${w - rect.x - rect.width}px;height:${rect.height}px;background:rgba(0,0,0,0.45);pointer-events:none;z-index:2147483646;`;

      // Update dimensions label
      const dpr = window.devicePixelRatio || 1;
      dimLabel.textContent = `${Math.round(rect.width * dpr)} × ${Math.round(rect.height * dpr)}`;
      dimLabel.style.left = (rect.x + rect.width / 2 - 30) + 'px';
      dimLabel.style.top = (rect.y + rect.height + 8) + 'px';
    }

    overlay.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('keydown', onKeyDown, true);

    // Store cleanup references
    overlay.__shotpadCleanup = () => {
      overlay.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }

  function createDim(id) {
    const dim = document.createElement('div');
    dim.className = 'shotpad-dim';
    dim.id = id;
    return dim;
  }

  function getRect(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // FULL PAGE SCROLL-STITCH CAPTURE
  // ═══════════════════════════════════════════════════════════════

  async function startFullPageCapture() {
    cleanup();

    const dpr = window.devicePixelRatio || 1;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const fullHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.body.clientHeight,
      document.documentElement.clientHeight
    );

    // Save current scroll position to restore later
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;

    // Show progress indicator
    const progress = document.createElement('div');
    progress.id = 'shotpad-progress';
    progress.innerHTML = `
      <span>📸 Capturing full page...</span>
      <div id="shotpad-progress-bar">
        <div id="shotpad-progress-fill"></div>
      </div>
      <span id="shotpad-progress-text">0%</span>
    `;
    document.body.appendChild(progress);

    const captures = [];
    const totalScrolls = Math.ceil(fullHeight / viewportHeight);
    let currentScroll = 0;

    // Hide any fixed/sticky elements during capture to avoid duplication
    const fixedElements = findFixedElements();
    const fixedStates = hideFixedElements(fixedElements);

    try {
      for (let i = 0; i < totalScrolls; i++) {
        const scrollY = i * viewportHeight;
        // Don't scroll past the end
        const actualScrollY = Math.min(scrollY, fullHeight - viewportHeight);

        window.scrollTo(0, actualScrollY);

        // Wait for scroll to settle and any lazy-loaded content
        await sleep(250);

        // Request background to capture current visible tab
        const response = await sendMessage({ action: 'fullpage-scroll-capture' });

        if (response && response.dataUrl) {
          captures.push({
            dataUrl: response.dataUrl,
            scrollY: actualScrollY,
            viewportHeight,
            isLast: i === totalScrolls - 1
          });
        }

        // Update progress
        const pct = Math.round(((i + 1) / totalScrolls) * 100);
        const fill = document.getElementById('shotpad-progress-fill');
        const text = document.getElementById('shotpad-progress-text');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = pct + '%';

        currentScroll++;
      }
    } finally {
      // Restore fixed elements
      restoreFixedElements(fixedElements, fixedStates);
    }

    // Restore original scroll position
    window.scrollTo(originalScrollX, originalScrollY);

    // Remove progress indicator
    progress.remove();

    // Send captures to background for stitching
    chrome.runtime.sendMessage({
      action: 'fullpage-stitch',
      captures,
      pageWidth: viewportWidth,
      pageHeight: fullHeight,
      devicePixelRatio: dpr
    });
  }

  /**
   * Find all fixed/sticky positioned elements to hide during full-page capture.
   * This prevents headers/footers from appearing in every stitched frame.
   */
  function findFixedElements() {
    const all = document.querySelectorAll('*');
    const fixed = [];
    for (const el of all) {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        // Skip our own progress element
        if (el.id === 'shotpad-progress') continue;
        fixed.push(el);
      }
    }
    return fixed;
  }

  function hideFixedElements(elements) {
    return elements.map(el => {
      const original = el.style.visibility;
      el.style.visibility = 'hidden';
      return original;
    });
  }

  function restoreFixedElements(elements, states) {
    elements.forEach((el, i) => {
      el.style.visibility = states[i];
    });
  }

  // ─── Utilities ──────────────────────────────────────────────────

  function cleanup() {
    const overlay = document.getElementById('shotpad-overlay');
    if (overlay) {
      if (overlay.__shotpadCleanup) overlay.__shotpadCleanup();
      overlay.remove();
    }
    const progress = document.getElementById('shotpad-progress');
    if (progress) progress.remove();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        resolve(response);
      });
    });
  }
})();
