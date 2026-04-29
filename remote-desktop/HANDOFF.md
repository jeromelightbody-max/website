# Remote Desktop — Handoff Document

Use this to continue the project on your local computer inside Claude Code.

---

## 1. Get the code

```bash
git clone https://github.com/jeromelightbody-max/website.git
cd website
git checkout claude/clarify-access-capabilities-OJrHI
cd remote-desktop
```

Or if you already have the repo:

```bash
git fetch origin
git checkout claude/clarify-access-capabilities-OJrHI
git pull
cd remote-desktop
```

---

## 2. Run it right now

```bash
./setup.sh
```

That script will:
- Check for Node.js, xdotool, and a screenshot backend (scrot / ImageMagick)
- Install missing packages automatically (via apt/dnf/pacman/brew)
- Run `npm install`
- Start the server on port 3000

Then open **`http://YOUR-LOCAL-IP:3000`** on your phone (both devices on the same WiFi).

Find your local IP:
```bash
# Linux / Mac
ip addr show | grep 'inet ' | grep -v 127
# or
hostname -I
```

**For remote access over the internet (4G/5G):**
```bash
# In a second terminal, after server is running:
cloudflared tunnel --url http://localhost:3000
# Download cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

---

## 3. What was built

```
remote-desktop/
├── server.js          # Node.js: screen capture + WebSocket + xdotool input
├── package.json       # Dependencies: express, ws, screenshot-desktop
├── setup.sh           # One-shot install + launch script
└── public/
    ├── index.html     # Shell HTML with toolbar and overlays
    ├── style.css      # Dark mobile-first UI
    └── client.js      # WebSocket client, touch gestures, viewport zoom/pan
```

**How it works:**
- Server captures the screen every ~100ms using `screenshot-desktop`
- Frames are sent as raw JPEG binary over a WebSocket
- Phone browser draws each frame onto a `<canvas>` using `createImageBitmap`
- Touch events on the canvas are translated to screen coordinates and sent back as JSON
- Server calls `xdotool` to replay mouse/keyboard input on the desktop

---

## 4. Phone gestures

| Gesture | Action |
|---|---|
| Tap | Left click |
| Double tap | Double click |
| Long press (hold ~0.6s) | Right click |
| Drag | Mouse drag |
| Two-finger pinch | Zoom in/out |
| Two-finger drag | Pan the view |
| ⌨️ Type button | Opens phone keyboard |
| 🔑 Keys button | Special keys (Esc, Tab, arrows, Ctrl+C…) |
| 🖱️ R-Click button | Next tap becomes right click |
| ⤢ Fit button | Reset zoom to full screen |

---

## 5. Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP/WebSocket port |
| `FRAME_RATE` | `10` | Frames per second |

Example:
```bash
FRAME_RATE=20 PORT=8080 node server.js
```

---

## 6. Continuing in Claude Code

Open Claude Code in your terminal from the project root:

```bash
cd website
claude
```

Paste this prompt to pick up where we left off:

> We built a self-hosted browser-based remote desktop in `remote-desktop/`. The server runs on Node.js, captures the screen with `screenshot-desktop`, streams JPEG frames over WebSocket, and replays input via `xdotool`. The phone client is a vanilla JS canvas app with pinch-zoom, pan, and touch gestures. The code is on branch `claude/clarify-access-capabilities-OJrHI`. I want to continue improving it.

### Ideas for next steps (pick any):
- **Authentication** — add a PIN/password so the URL is private even on a public tunnel
- **Adaptive quality** — lower JPEG quality when latency is high, increase when idle
- **Audio** — stream desktop audio to the phone browser (Web Audio API + FFmpeg pipe)
- **Clipboard sync** — share clipboard between phone and desktop
- **Multi-monitor** — let user switch between displays
- **Touch keyboard improvements** — hold a key-button for modifier combos (Ctrl+Shift+T, etc.)
- **WebRTC** — replace WebSocket frames with WebRTC for sub-100ms latency
- **macOS/Windows support** — swap `xdotool` for `cliclick` (mac) or `nircmd` (windows)
- **PWA** — add a web app manifest so it installs as a home screen app on iOS/Android

---

## 7. Key files to know

| File | What to look at |
|---|---|
| `server.js:55` | `handleInput()` — maps event types to xdotool commands |
| `server.js:70` | `captureAndBroadcast()` — the frame loop |
| `client.js:1` | `view` object — controls zoom/pan viewport state |
| `client.js:110` | `connect()` — WebSocket + frame receiver |
| `client.js:165` | Touch gesture handler (`touchstart/move/end`) |
| `client.js:230` | Toolbar button logic |
