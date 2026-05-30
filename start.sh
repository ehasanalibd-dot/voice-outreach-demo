#!/bin/bash
# Voice Outreach Demo App - Startup Script
# Starts both backend (port 4001) and frontend (port 3000)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "🎙️  Voice Outreach Demo — Starting..."

# Kill any existing processes on our ports
kill -9 $(lsof -ti:4001) 2>/dev/null || true
kill -9 $(lsof -ti:3000) 2>/dev/null || true
sleep 1

# Start backend
echo "🚀 Starting backend on port 4001..."
cd "$SCRIPT_DIR/backend"
npx tsx src/index.ts &
BACKEND_PID=$!
sleep 2

# Start frontend
echo "🖥️  Starting frontend on port 3000..."
cd "$SCRIPT_DIR/frontend"
npx next start --port 3000 &
FRONTEND_PID=$!
sleep 2

echo ""
echo "✅ Voice Outreach Demo is running!"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:4001"
echo "   Dashboard: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both services."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT INT

wait
