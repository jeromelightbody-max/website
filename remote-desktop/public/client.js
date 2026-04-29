'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let ws, reconnectTimer;
let screenW = 1920, screenH = 1080;
let currentFrame = null;
let rightClickNext = false;
let toolbarTimer   = null;

// Viewport: what portion of the remote screen is visible (screen coordinates)
const view = { x: 0, y: 0, w: 1920, h: 1080 };

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas    = document.getElementById('screen');
const ctx       = canvas.getContext('2d');
const overlay   = document.getElementById('overlay');
const toolbar   = document.getElementById('toolbar');
const keysPanel = document.getElementById('keys-panel');
const kbInput   = document.getElementById('kb-input');
const statusDot = document.getElementById('status-dot');
const fpsEl     = document.getElementById('fps');
const toastEl   = document.getElementById('toast');

// ── Canvas resize ─────────────────────────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  render();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Rendering ─────────────────────────────────────────────────────────────────
function render() {
  if (!currentFrame) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.drawImage(
    currentFrame,
    view.x, view.y, view.w, view.h,   // source region (screen coords)
    0, 0, canvas.width, canvas.height  // destination (full canvas)
  );
}

// ── Viewport helpers ──────────────────────────────────────────────────────────
function canvasToScreen(cx, cy) {
  return {
    x: view.x + (cx / canvas.width)  * view.w,
    y: view.y + (cy / canvas.height) * view.h,
  };
}

function clampView() {
  view.x = Math.max(0, Math.min(view.x, screenW - view.w));
  view.y = Math.max(0, Math.min(view.y, screenH - view.h));
}

function applyZoom(factor, pivotCx, pivotCy) {
  const before = canvasToScreen(pivotCx, pivotCy);
  view.w = Math.min(Math.max(view.w * factor, 320), screenW);
  view.h = Math.min(Math.max(view.h * factor, 200), screenH);
  const after = canvasToScreen(pivotCx, pivotCy);
  view.x += before.x - after.x;
  view.y += before.y - after.y;
  clampView();
}

function applyPan(dcx, dcy) {
  view.x -= (dcx / canvas.width)  * view.w;
  view.y -= (dcy / canvas.height) * view.h;
  clampView();
}

function resetView() {
  view.x = 0; view.y = 0; view.w = screenW; view.h = screenH;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function sendInput(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

let fpsCount = 0, lastFpsTs = Date.now();

function connect() {
  clearTimeout(reconnectTimer);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.binaryType = 'blob';

  ws.onopen = () => {
    setStatus('connected');
    overlay.classList.add('hidden');
  };

  ws.onclose = () => {
    setStatus('disconnected');
    overlay.classList.remove('hidden');
    reconnectTimer = setTimeout(connect, 2500);
  };

  ws.onerror = () => setStatus('error');

  ws.onmessage = async (e) => {
    if (typeof e.data === 'string') {
      const msg = JSON.parse(e.data);
      if (msg.type === 'config') {
        screenW = msg.w; screenH = msg.h;
        view.x = 0; view.y = 0; view.w = screenW; view.h = screenH;
      }
      return;
    }
    // Binary = JPEG/PNG frame
    try {
      const bmp = await createImageBitmap(e.data);
      currentFrame = bmp;
      render();
      // FPS counter
      fpsCount++;
      const now = Date.now();
      if (now - lastFpsTs >= 1000) {
        fpsEl.textContent = `${fpsCount} fps`;
        fpsCount = 0; lastFpsTs = now;
      }
    } catch { /* skip bad frame */ }
  };
}

// ── Status / Toast ────────────────────────────────────────────────────────────
function setStatus(s) {
  statusDot.className = `status-dot ${s}`;
}

let toastTimer;
function toast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ── Toolbar visibility ────────────────────────────────────────────────────────
function showToolbar() {
  toolbar.classList.add('visible');
  clearTimeout(toolbarTimer);
  toolbarTimer = setTimeout(() => toolbar.classList.remove('visible'), 3500);
}

// ── Touch gesture handler ─────────────────────────────────────────────────────
const DRAG_THRESH   = 12;  // px before tap becomes drag
const LONG_PRESS_MS = 620;
const DOUBLE_TAP_MS = 260;

const g = {
  type:           null,  // 'tap' | 'drag' | 'pinch' | 'consumed'
  startCx:        0, startCy: 0,
  lastCx:         0, lastCy:  0,
  startTime:      0,
  longPressTimer: null,
  lastTapTime:    0,
  pinchDist:      0,
  lastMidCx:      0, lastMidCy: 0,
};

function getTouchCanvas(t) {
  const r = canvas.getBoundingClientRect();
  return { cx: t.clientX - r.left, cy: t.clientY - r.top };
}

function pinchDist2(t1, t2) {
  const p1 = getTouchCanvas(t1), p2 = getTouchCanvas(t2);
  return Math.hypot(p1.cx - p2.cx, p1.cy - p2.cy);
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  showToolbar();

  if (e.touches.length === 1) {
    const { cx, cy } = getTouchCanvas(e.touches[0]);
    Object.assign(g, {
      type: 'tap', startCx: cx, startCy: cy,
      lastCx: cx, lastCy: cy, startTime: Date.now(),
    });

    g.longPressTimer = setTimeout(() => {
      if (g.type === 'tap') {
        const scr = canvasToScreen(g.startCx, g.startCy);
        sendInput({ type: 'click', ...scr, button: 3 });
        navigator.vibrate?.([15, 8, 15]);
        toast('Right click');
        g.type = 'consumed';
      }
    }, LONG_PRESS_MS);

  } else if (e.touches.length === 2) {
    clearTimeout(g.longPressTimer);
    if (g.type === 'drag') {
      sendInput({ type: 'up', ...canvasToScreen(g.lastCx, g.lastCy), button: 1 });
    }
    const p1 = getTouchCanvas(e.touches[0]), p2 = getTouchCanvas(e.touches[1]);
    g.type       = 'pinch';
    g.pinchDist  = Math.hypot(p1.cx - p2.cx, p1.cy - p2.cy);
    g.lastMidCx  = (p1.cx + p2.cx) / 2;
    g.lastMidCy  = (p1.cy + p2.cy) / 2;
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();

  if (e.touches.length === 1 && g.type !== 'pinch') {
    const { cx, cy } = getTouchCanvas(e.touches[0]);
    const moved = Math.hypot(cx - g.startCx, cy - g.startCy);

    if (g.type === 'tap' && moved > DRAG_THRESH) {
      clearTimeout(g.longPressTimer);
      g.type = 'drag';
      sendInput({ type: 'down', ...canvasToScreen(g.startCx, g.startCy), button: 1 });
    }
    if (g.type === 'drag') {
      sendInput({ type: 'move', ...canvasToScreen(cx, cy) });
    }
    g.lastCx = cx; g.lastCy = cy;

  } else if (e.touches.length === 2 && g.type === 'pinch') {
    const p1 = getTouchCanvas(e.touches[0]), p2 = getTouchCanvas(e.touches[1]);
    const d   = Math.hypot(p1.cx - p2.cx, p1.cy - p2.cy);
    const mcx = (p1.cx + p2.cx) / 2;
    const mcy = (p1.cy + p2.cy) / 2;

    if (g.pinchDist > 0) {
      applyZoom(g.pinchDist / d, mcx, mcy);
      applyPan(mcx - g.lastMidCx, mcy - g.lastMidCy);
      render();
    }

    g.pinchDist = d; g.lastMidCx = mcx; g.lastMidCy = mcy;
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  clearTimeout(g.longPressTimer);

  if (e.touches.length === 0) {
    if (g.type === 'drag') {
      sendInput({ type: 'up', ...canvasToScreen(g.lastCx, g.lastCy), button: 1 });

    } else if (g.type === 'tap') {
      const now = Date.now();
      const scr = canvasToScreen(g.startCx, g.startCy);

      if (now - g.lastTapTime < DOUBLE_TAP_MS) {
        // Double tap → double click
        sendInput({ type: 'click', ...scr, button: 1 });
        sendInput({ type: 'click', ...scr, button: 1 });
        g.lastTapTime = 0;
      } else {
        g.lastTapTime = now;
        // Wait to distinguish single vs double tap
        setTimeout(() => {
          if (g.lastTapTime !== now) return;
          const btn = rightClickNext ? 3 : 1;
          sendInput({ type: 'click', ...scr, button: btn });
          if (rightClickNext) {
            rightClickNext = false;
            document.getElementById('btn-rclick').classList.remove('active');
            toast('Right-click mode off');
          }
        }, DOUBLE_TAP_MS);
      }
    }

    g.type = null;
  }
}, { passive: false });

// Mouse wheel for desktop browsers testing
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const r   = canvas.getBoundingClientRect();
  const scr = canvasToScreen(e.clientX - r.left, e.clientY - r.top);
  sendInput({ type: 'scroll', ...scr, delta: e.deltaY / 100 });
}, { passive: false });

// ── Keyboard input ────────────────────────────────────────────────────────────
const KEY_MAP = {
  Backspace:  'BackSpace', Tab: 'Tab', Enter: 'Return',
  Escape:     'Escape',    Delete: 'Delete',
  Home:       'Home',      End: 'End',
  ArrowLeft:  'Left',      ArrowRight: 'Right',
  ArrowUp:    'Up',        ArrowDown: 'Down',
};

kbInput.addEventListener('input', () => {
  const t = kbInput.value;
  if (t) { sendInput({ type: 'type', text: t }); kbInput.value = ''; }
});

kbInput.addEventListener('keydown', e => {
  const mapped = KEY_MAP[e.key];
  if (mapped) {
    e.preventDefault();
    sendInput({ type: 'key', key: mapped });
    kbInput.value = '';
  }
});

// Special key buttons
document.querySelectorAll('[data-key]').forEach(btn => {
  btn.addEventListener('click', () => sendInput({ type: 'key', key: btn.dataset.key }));
});

// ── Toolbar buttons ───────────────────────────────────────────────────────────
document.getElementById('btn-keyboard').addEventListener('click', () => {
  keysPanel.classList.remove('visible');
  kbInput.style.pointerEvents = 'auto';
  kbInput.focus();
  setTimeout(() => { kbInput.style.pointerEvents = 'none'; }, 100);
  showToolbar();
});

document.getElementById('btn-keys').addEventListener('click', () => {
  keysPanel.classList.toggle('visible');
  showToolbar();
});

document.getElementById('btn-rclick').addEventListener('click', () => {
  rightClickNext = !rightClickNext;
  document.getElementById('btn-rclick').classList.toggle('active', rightClickNext);
  toast(rightClickNext ? 'Next tap = right click' : 'Right-click mode off');
  showToolbar();
});

document.getElementById('btn-zoom-reset').addEventListener('click', () => {
  resetView(); render();
  showToolbar();
});

// Show toolbar on any touch of the overlay UI
toolbar.addEventListener('touchstart', () => showToolbar());
keysPanel.addEventListener('touchstart', () => showToolbar());

// ── Boot ──────────────────────────────────────────────────────────────────────
connect();
