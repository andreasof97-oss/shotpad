/**
 * ShotPad — Popup Script
 * 
 * Handles capture mode button clicks and displays capture count.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ─── Capture Buttons ──────────────────────────────────────────
  const btnVisible = document.getElementById('btn-visible');
  const btnRegion = document.getElementById('btn-region');
  const btnFullpage = document.getElementById('btn-fullpage');
  const btnSettings = document.getElementById('btn-settings');

  // Visible Area Capture
  btnVisible.addEventListener('click', async () => {
    btnVisible.style.opacity = '0.6';
    btnVisible.style.pointerEvents = 'none';

    await chrome.runtime.sendMessage({ action: 'capture-visible' });
    window.close(); // Close popup after initiating capture
  });

  // Region Select Capture
  btnRegion.addEventListener('click', async () => {
    btnRegion.style.opacity = '0.6';
    btnRegion.style.pointerEvents = 'none';

    await chrome.runtime.sendMessage({ action: 'start-region-select' });
    window.close(); // Close popup — selection happens on the page
  });

  // Full Page Capture
  btnFullpage.addEventListener('click', async () => {
    btnFullpage.style.opacity = '0.6';
    btnFullpage.style.pointerEvents = 'none';

    await chrome.runtime.sendMessage({ action: 'capture-fullpage' });
    window.close(); // Close popup — capture happens in background
  });

  // Settings (placeholder for future)
  btnSettings.addEventListener('click', () => {
    // Future: open options page
    // For now, just show a tooltip or do nothing
  });

  // ─── Capture Count ────────────────────────────────────────────
  loadCaptureCount();
});

/**
 * Load and display today's capture count from storage
 */
async function loadCaptureCount() {
  const countEl = document.getElementById('capture-count');
  const today = new Date().toISOString().split('T')[0];

  try {
    const result = await chrome.storage.local.get(['shotpad_captures']);
    const captures = result.shotpad_captures || {};
    const todayCount = captures[today] || 0;

    if (todayCount === 0) {
      countEl.textContent = 'No captures today';
    } else if (todayCount === 1) {
      countEl.textContent = '1 capture today';
    } else {
      countEl.textContent = `${todayCount} captures today`;
    }
  } catch (err) {
    countEl.textContent = 'No captures today';
  }
}
