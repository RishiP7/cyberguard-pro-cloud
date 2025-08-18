#!/usr/bin/env bash
set -e

APP="$HOME/Downloads/cyberguard-pro-cloud-latest/app"
WEB="$HOME/Downloads/cyberguard-pro-cloud-latest/web-ready"

# Optional: start Postgres Docker container if it exists
if command -v docker >/dev/null 2>&1; then
  if docker ps -a --format '{{.Names}}' | grep -q '^cybermon-pg$'; then
    docker start cybermon-pg >/dev/null 2>&1 || true
  fi
fi

# Build single-line commands for Terminal
BACKEND_CMD="bash -lc 'cd \"$APP\"; lsof -ti :8080 | xargs -r kill -9 2>/dev/null || true; \
export PORT=8080 JWT_SECRET=dev_secret_key ADMIN_KEY=dev_admin_key; \
npm install --silent || true; echo Starting API on :8080 ...; node src/index.js'"

FRONTEND_CMD="bash -lc 'cd \"$WEB\"; lsof -ti :5176 | xargs -r kill -9 2>/dev/null || true; \
printf \"VITE_API_BASE=http://localhost:8080\n\" > .env; \
npm install --silent || true; echo Starting web on :5176 ...; npm run dev -- --port 5176'"

# Launch each in its own Terminal window (macOS)
osascript <<OSA
tell application "Terminal"
  activate
  do script "$BACKEND_CMD"
  delay 1
  do script "$FRONTEND_CMD"
end tell
OSA

echo "Launched two Terminal windows: API (:8080) and Web (:5176). Keep them open."
