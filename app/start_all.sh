#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/Downloads/cyberguard-pro-cloud-latest"
API_DIR="$APP_DIR/app"
WEB_DIR="$APP_DIR/web-ready"
PORT_API="${PORT_API:-8080}"
PORT_WEB="${PORT_WEB:-5176}"

ENV_FILE="$API_DIR/.env.local"

# --- 0) Ensure Postgres container is up (optional if you use Render DB) ---
if ! docker ps --format '{{.Names}}' | grep -q '^cybermon-pg$'; then
  docker start cybermon-pg >/dev/null 2>&1 || \
  docker run -d --name cybermon-pg \
    -e POSTGRES_USER=cybermon -e POSTGRES_PASSWORD=cyberpass \
    -e POSTGRES_DB=cyberguardpro -p 5432:5432 postgres:15
fi

# --- 1) Make sure we have config (.env.local) with persistent keys ---
if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE (first run)…"
  ADMIN_KEY="$(openssl rand -hex 32)"
  JWT_SECRET="$(openssl rand -hex 32)"

  # Default to local Docker PG; replace with your Render URL if you prefer
  DATABASE_URL_DEFAULT="postgres://cybermon:cyberpass@localhost:5432/cyberguardpro"

  # Optional: put your Slack + OpenAI keys here now (or leave empty)
  SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
  OPENAI_API_KEY="${OPENAI_API_KEY:-}"
  AI_MODEL="${AI_MODEL:-gpt-4o-mini}"

  cat > "$ENV_FILE" <<EOF
ADMIN_KEY=$ADMIN_KEY
JWT_SECRET=$JWT_SECRET
DATABASE_URL=$DATABASE_URL_DEFAULT
PORT=$PORT_API

# Optional notifications / AI:
SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL
OPENAI_API_KEY=$OPENAI_API_KEY
AI_MODEL=$AI_MODEL
EOF
else
  echo "Using existing $ENV_FILE"
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

# --- 2) Kill anything on our ports, then start API ---
lsof -ti :$PORT_API | xargs -r kill -9 || true
echo "Starting API on :$PORT_API …"
(cd "$API_DIR" && ADMIN_KEY="$ADMIN_KEY" JWT_SECRET="$JWT_SECRET" DATABASE_URL="$DATABASE_URL" PORT="$PORT_API" node src/index.js) &
API_PID=$!

# small wait for server to come up
sleep 1.2

# Health check
curl -sf "http://localhost:$PORT_API/health" >/dev/null || {
  echo "API health check failed; printing logs for a moment…"
  sleep 1
}

# --- 3) Get JWT, activate plan, create API key ---
echo "Logging in and setting up tenant…"
TOKEN="$(curl -s -X POST "http://localhost:$PORT_API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"hello@freshprintslondon.com","password":"test123"}' | jq -r .token)"

if [ -z "${TOKEN:-}" ] || [ "$TOKEN" = "null" ]; then
  echo "No token returned — check your user/password exists in DB."
  echo "Tip: seed or update the users table with bcrypt hash for 'test123'."
  kill $API_PID 2>/dev/null || true
  exit 1
fi

# Activate Pro+ (unlocks all tiles/features)
curl -s -X POST "http://localhost:$PORT_API/billing/mock-activate" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plan":"pro_plus"}' >/dev/null

# Create fresh API key (kept only in browser/localStorage for the UI)
APIKEY="$(curl -s -X POST "http://localhost:$PORT_API/apikeys" \
  -H "Authorization: Bearer $TOKEN" | jq -r .api_key)"

echo "TOKEN (JWT): $TOKEN"
echo "APIKEY:      $APIKEY"

# --- 4) Start Vite on 5176 and inject credentials into localStorage ---
lsof -ti :$PORT_WEB | xargs -r kill -9 || true
echo "Starting web on :$PORT_WEB …"
(
  cd "$WEB_DIR"
  # wire API base for the web
  printf "VITE_API_BASE=http://localhost:%s\n" "$PORT_API" > .env
  npm install --silent || true
  npm run dev -- --port "$PORT_WEB"
) &
WEB_PID=$!

# wait a bit for Vite to boot
sleep 1.5

# Open the app in Safari or Chrome and inject localStorage via AppleScript
JS_SNIPPET="localStorage.setItem('token', '$TOKEN'); localStorage.setItem('api_key', '$APIKEY'); console.log('Injected token & api_key');"

open "http://localhost:$PORT_WEB/"

# Try Safari first
if mdfind 'kMDItemCFBundleIdentifier == "com.apple.Safari"' | grep -q Safari.app; then
  osascript <<OSA >/dev/null 2>&1 || true
tell application "Safari"
  activate
  delay 0.7
  try
    tell window 1 to set current tab to (make new tab with properties {URL:"http://localhost:$PORT_WEB/"})
  on error
    make new document with properties {URL:"http://localhost:$PORT_WEB/"}
  end try
  delay 0.8
  tell application "System Events" to keystroke "c" using {command down, option down} -- open console if devtools open (best-effort)
  do JavaScript "$JS_SNIPPET" in current tab of window 1
end tell
OSA
fi

# Try Chrome if installed
if mdfind 'kMDItemCFBundleIdentifier == "com.google.Chrome"' | grep -q "Google Chrome.app"; then
  osascript <<'OSA' >/dev/null 2>&1 || true
on run argv
  set theURL to item 1 of argv
  set js to item 2 of argv
  tell application "Google Chrome"
    activate
    if (count of windows) = 0 then
      make new window
    end if
    tell window 1
      set newTab to make new tab with properties {URL:theURL}
      delay 0.8
      tell newTab to execute javascript js
    end tell
  end tell
end run
OSA \
"http://localhost:$PORT_WEB/" "$JS_SNIPPET"
fi

echo ""
echo "✅ API running (pid: $API_PID) on http://localhost:$PORT_API"
echo "✅ Web running (pid: $WEB_PID) on http://localhost:$PORT_WEB"
echo "💡 localStorage injected (token + api_key). Refresh the tab if needed."
echo ""

# Keep the parent shell alive so background jobs survive if you want
wait
