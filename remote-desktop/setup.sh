#!/usr/bin/env bash
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       Remote Desktop — Setup             ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Node.js check ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "✗  Node.js not found. Install it from https://nodejs.org then re-run."
  exit 1
fi
echo "✓  Node.js $(node -v)"

# ── xdotool check ────────────────────────────────────────────────────────────
if ! command -v xdotool &>/dev/null; then
  echo "   xdotool not found — installing..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y xdotool
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y xdotool
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm xdotool
  elif command -v brew &>/dev/null; then
    brew install xdotool
  else
    echo "✗  Could not install xdotool automatically."
    echo "   Install it manually: https://github.com/jordansissel/xdotool"
    exit 1
  fi
fi
echo "✓  xdotool $(xdotool version 2>/dev/null | head -1)"

# ── Screenshot backend check ─────────────────────────────────────────────────
CAPTURE_OK=false
if command -v scrot &>/dev/null; then
  echo "✓  scrot (screenshot backend)"
  CAPTURE_OK=true
elif command -v import &>/dev/null; then
  echo "✓  ImageMagick import (screenshot backend)"
  CAPTURE_OK=true
fi

if [ "$CAPTURE_OK" = false ]; then
  echo "   No screenshot backend found — installing scrot..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y scrot
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y scrot
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm scrot
  else
    echo "   Could not install scrot — install it manually or install ImageMagick."
  fi
fi

# ── npm install ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "Installing npm dependencies..."
npm install
echo ""

# ── Remote access hint ───────────────────────────────────────────────────────
echo "────────────────────────────────────────────"
echo "  Optional: public access via Cloudflare Tunnel"
echo "  (free, no port-forwarding, works over 4G/5G)"
echo ""
echo "  1. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
echo "  2. Run in a second terminal after starting the server:"
echo "       cloudflared tunnel --url http://localhost:3000"
echo "  3. Use the https://... URL it prints on your phone."
echo "────────────────────────────────────────────"
echo ""

# ── Start the server ─────────────────────────────────────────────────────────
echo "Starting server (Ctrl+C to stop)..."
echo ""
DISPLAY=${DISPLAY:-:0} node server.js
