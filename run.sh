#!/usr/bin/env bash
set -euo pipefail

# ===== Paths & defaults =====
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/app"
WEB="$ROOT/web-ready"

PORT_API="${PORT_API:-8080}"
PORT_WEB="${PORT_WEB:-5176}"

JWT_SECRET="${JWT_SECRET:-dev_secret_key}"
ADMIN_KEY="${ADMIN_KEY:-dev_admin_key}"
DATABASE_URL="${DATABASE_URL:-postgres://cybermon:cyberpass@localhost:5432/cyberguardpro}"

PG_CONTAINER="cybermon-pg"
LOG_DIR="$ROOT/logs"
PID_DIR="$ROOT/.pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

API_PID="$PID_DIR/api.pid"
WEB_PID="$PID_DIR/web.pid"

# ===== Helpers =====
note(){ printf "\033[1;36m[CGP]\033[0m %s\n" "$*"; }
warn(){ printf "\033[1;33m[CGP]\033[0m %s\n" "$*"; }
err(){  printf "\033[1;31m[CGP]\033[0m %s\n" "$*" 1>&2; }

is_running_pid(){ [ -f "$1" ] && ps -p "$(cat "$1" 2>/dev/null || echo -1)" >/dev/null 2>&1; }

wait_port(){
  local host="$1" port="$2" label="$3" tries=60
  for _ in $(seq 1 $tries); do
    (echo > /dev/tcp/$host/$port) >/dev/null 2>&1 && { note "$label is up on $host:$port"; return 0; }
    sleep 1
  done
  return 1
}

# ===== PG =====
ensure_pg(){
  if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
    note "Postgres container already running: ${PG_CONTAINER}"
  else
    if docker ps -a --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
      note "Starting existing Postgres container: ${PG_CONTAINER}"
      docker start "${PG_CONTAINER}" >/dev/null
    else
      note "Creating Postgres container: ${PG_CONTAINER}"
      docker run -d --name "${PG_CONTAINER}" \
        -e POSTGRES_USER=cybermon -e POSTGRES_PASSWORD=cyberpass \
        -e POSTGRES_DB=cyberguardpro -p 5432:5432 postgres:15 >/dev/null
    fi
  fi
  note "Waiting for Postgres (localhost:5432)..."
  wait_port localhost 5432 "Postgres" || { err "Postgres didn't start"; exit 1; }
}

# ===== API =====
start_api(){
  if is_running_pid "$API_PID"; then
    warn "API already running (PID $(cat "$API_PID"))."
    return 0
  fi
  note "Writing app/.env"
  cat > "$APP/.env" <<ENV
DATABASE_URL=$DATABASE_URL
JWT_SECRET=$JWT_SECRET
ADMIN_KEY=$ADMIN_KEY
ENV

  note "Installing API deps (safe)…"
  (cd "$APP" && npm install >/dev/null)

  note "Starting API on :$PORT_API"
  (cd "$APP" && \
    PORT=$PORT_API JWT_SECRET=$JWT_SECRET ADMIN_KEY=$ADMIN_KEY \
    nohup node src/index.js > "$LOG_DIR/api.log" 2>&1 & echo $! > "$API_PID")

  sleep 1
  if ! is_running_pid "$API_PID"; then
    err "API failed to start. See $LOG_DIR/api.log"
    exit 1
  fi

  note "Waiting health at http://localhost:$PORT_API/health …"
  for _ in $(seq 1 30); do
    if curl -fsS "http://localhost:$PORT_API/health" >/dev/null 2>&1; then
      note "API health OK."
      return 0
    fi
    sleep 1
  done
  warn "API health not ready yet (but process is running)."
}

stop_api(){
  if is_running_pid "$API_PID"; then
    note "Stopping API (PID $(cat "$API_PID"))"
    kill -9 "$(cat "$API_PID")" 2>/dev/null || true
    rm -f "$API_PID"
  else
    warn "API not running."
  fi
}

# ===== Web =====
start_web(){
  if is_running_pid "$WEB_PID"; then
    warn "Web already running (PID $(cat "$WEB_PID"))."
    return 0
  fi
  note "Writing web-ready/.env"
  echo "VITE_API_BASE=http://localhost:$PORT_API" > "$WEB/.env"

  note "Installing web deps (safe)…"
  (cd "$WEB" && npm install >/dev/null)

  # free the port if something is stuck
  lsof -ti :$PORT_WEB | xargs -r kill -9 >/dev/null 2>&1 || true

  note "Starting web on :$PORT_WEB"
  (cd "$WEB" && nohup npm run dev -- --port "$PORT_WEB" > "$LOG_DIR/web.log" 2>&1 & echo $! > "$WEB_PID")

  sleep 1
  if ! is_running_pid "$WEB_PID"; then
    err "Web failed to start. See $LOG_DIR/web.log"
    exit 1
  fi
  note "Web ready at http://localhost:$PORT_WEB/"
}

stop_web(){
  if is_running_pid "$WEB_PID"; then
    note "Stopping web (PID $(cat "$WEB_PID"))"
    kill -9 "$(cat "$WEB_PID")" 2>/dev/null || true
    rm -f "$WEB_PID"
  else
    warn "Web not running."
  fi
}

# ===== Public commands =====
cmd_up(){
  ensure_pg
  start_api
  start_web
  echo
  note "OPEN:  http://localhost:$PORT_WEB/"
  note "API:   http://localhost:$PORT_API/   (health: /health)"
  echo
  note "Logs:"
  echo "  tail -f \"$LOG_DIR/api.log\""
  echo "  tail -f \"$LOG_DIR/web.log\""
}

cmd_down(){
  stop_web
  stop_api
  note "Done. (Postgres container left running on purpose)"
}

cmd_status(){
  echo "— Status —"
  if is_running_pid "$API_PID"; then
    echo "API   : running (PID $(cat "$API_PID"))"
  else
    echo "API   : stopped"
  fi
  if is_running_pid "$WEB_PID"; then
    echo "Web   : running (PID $(cat "$WEB_PID"))"
  else
    echo "Web   : stopped"
  fi
  if docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
    echo "DB    : container '${PG_CONTAINER}' running"
  else
    echo "DB    : container '${PG_CONTAINER}' not running"
  fi
  # health ping (best-effort)
  curl -fsS "http://localhost:$PORT_API/health" >/dev/null 2>&1 \
    && echo "Health: API ok" || echo "Health: API not reachable"
}

cmd_logs(){
  note "Tailing logs (Ctrl+C to stop)…"
  tail -n +1 -f "$LOG_DIR/api.log" "$LOG_DIR/web.log"
}

cmd_restart(){
  stop_web || true
  stop_api || true
  cmd_up
}

usage(){
  cat <<USE
Usage: $(basename "$0") [up|down|status|logs|restart]

ENV overrides (optional):
  PORT_API=8080      # default 8080
  PORT_WEB=5176      # default 5176
  JWT_SECRET=dev_secret_key
  ADMIN_KEY=dev_admin_key
  DATABASE_URL=postgres://cybermon:cyberpass@localhost:5432/cyberguardpro
USE
}

# ===== Dispatch =====
case "${1:-}" in
  up)       cmd_up ;;
  down)     cmd_down ;;
  status)   cmd_status ;;
  logs)     cmd_logs ;;
  restart)  cmd_restart ;;
  *)        usage; exit 0 ;;
esac
