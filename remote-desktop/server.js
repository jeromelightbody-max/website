'use strict';

const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const screenshot = require('screenshot-desktop');
const { exec }   = require('child_process');
const { networkInterfaces } = require('os');
const path = require('path');

const PORT    = parseInt(process.env.PORT       || '3000');
const FPS     = parseInt(process.env.FRAME_RATE || '10');
const INTERVAL = Math.round(1000 / FPS);

// ── HTTP + static files ──────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, 'public')));

// ── Screen dimensions ────────────────────────────────────────────────────────
let screenW = 1920, screenH = 1080;

function detectScreenSize() {
  exec('xdpyinfo | grep dimensions', (err, out) => {
    if (!err) {
      const m = out.match(/(\d+)x(\d+)/);
      if (m) { screenW = +m[1]; screenH = +m[2]; }
    } else {
      // fallback: xrandr
      exec("xrandr | grep '*' | awk '{print $1}'", (e2, out2) => {
        if (!e2) {
          const m2 = out2.trim().match(/(\d+)x(\d+)/);
          if (m2) { screenW = +m2[1]; screenH = +m2[2]; }
        }
      });
    }
    console.log(`Screen detected: ${screenW}x${screenH}`);
  });
}
detectScreenSize();

// ── Input handling (Linux xdotool) ──────────────────────────────────────────
function handleInput(ev) {
  const { type, x, y, button, key, text, delta } = ev;
  const ix = Math.round(x), iy = Math.round(y);

  switch (type) {
    case 'move':
      exec(`xdotool mousemove ${ix} ${iy}`);
      break;
    case 'click':
      exec(`xdotool mousemove ${ix} ${iy} click ${button || 1}`);
      break;
    case 'down':
      exec(`xdotool mousemove ${ix} ${iy} mousedown ${button || 1}`);
      break;
    case 'up':
      exec(`xdotool mousemove ${ix} ${iy} mouseup ${button || 1}`);
      break;
    case 'scroll': {
      const btn = delta > 0 ? 5 : 4;
      const n   = Math.min(Math.abs(Math.round(delta)), 10) || 1;
      exec(`xdotool mousemove ${ix} ${iy} click --repeat ${n} ${btn}`);
      break;
    }
    case 'key':
      exec(`xdotool key -- ${key}`);
      break;
    case 'type': {
      const safe = (text || '').replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
      exec(`xdotool type --clearmodifiers -- '${safe}'`);
      break;
    }
  }
}

// ── WebSocket + frame streaming ──────────────────────────────────────────────
const wss     = new WebSocket.Server({ server });
const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);
  console.log(`Client connected  (total: ${clients.size})`);

  ws.send(JSON.stringify({ type: 'config', w: screenW, h: screenH, fps: FPS }));

  ws.on('message', data => {
    try { handleInput(JSON.parse(data)); } catch { /* ignore malformed */ }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected (total: ${clients.size})`);
  });
});

let capturing = false;

async function captureAndBroadcast() {
  if (clients.size === 0 || capturing) return;
  capturing = true;
  try {
    // 'jpg' format keeps payload small; falls back to PNG on some platforms
    const buf = await screenshot({ format: 'jpg' });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(buf);
    }
  } catch (e) {
    process.stderr.write(`Capture error: ${e.message}\n`);
  } finally {
    capturing = false;
  }
}

setInterval(captureAndBroadcast, INTERVAL);

// ── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const nets = Object.values(networkInterfaces()).flat()
    .filter(n => n.family === 'IPv4' && !n.internal);

  console.log('\n=== Remote Desktop Server ===');
  console.log(`Local:   http://localhost:${PORT}`);
  nets.forEach(n => console.log(`Network: http://${n.address}:${PORT}`));
  console.log(`\nFrame rate : ${FPS} fps`);
  console.log('Open the Network URL on your phone.\n');
});
