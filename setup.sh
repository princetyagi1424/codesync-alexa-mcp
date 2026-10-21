#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "═══════════════════════════════════════════════════════════"
echo "  CodeSync AI — Setup & Launch"
echo "  Amazon Developer Hackathon 2026 (Alexa+ Track)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Backend ──────────────────────────────────────────────────
echo "▶ Installing backend dependencies..."
cd "$ROOT/backend"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created backend/.env from .env.example (add keys for live mode)"
fi
npm install --silent
echo "  Backend dependencies ready."

# ── Frontend ─────────────────────────────────────────────────
echo "▶ Installing frontend dependencies..."
cd "$ROOT/frontend"
npm install --silent
echo "  Frontend dependencies ready."

echo ""
echo "▶ Starting servers..."
echo "  Backend  → http://localhost:5000"
echo "  Frontend → http://localhost:5173"
echo "  Press Ctrl+C to stop both."
echo ""

# Launch both; trap Ctrl+C to kill children
cd "$ROOT/backend"
npm run dev &
BACKEND_PID=$!

cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

wait
