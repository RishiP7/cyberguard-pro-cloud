#!/bin/zsh
# Unified helper for managing .env (open, reset, show)
# Usage:
#   ./manage_env.sh open
#   ./manage_env.sh reset        # prompts before overwrite
#   ./manage_env.sh reset --force
#   ./manage_env.sh show         # prints masked values

set -euo pipefail

APP_DIR="${HOME}/Downloads/cyberguard-pro-cloud-latest/app"
ENV_FILE="${APP_DIR}/.env"
BACKUP_DIR="${APP_DIR}/.env_backups"

# >>> Your canonical values (edit here when you need to change them) <<<
CANON_ADMIN_KEY="c9572dd303831422d101e533403428c399b7d6b3530e2dc21f0031d6a25cf279"
CANON_JWT_SECRET="f184d5323b1e0f2765c9f81a774f9d87f5ea0edc52dca5ab99377b32a2d877f1"
CANON_DATABASE_URL="postgresql://cyberguardpro_user:66HDLrUUdIKwTRhkUZsrQSzXOgKezZwU@dpg-d2h3bhqdbo4c73amekqg-a.oregon-postgres.render.com/cyberguardpro"
export OPENAI_API_KEY=${OPENAI_API_KEY:-""}
CANON_AI_MODEL="gpt-4o-mini"
CANON_SLACK_WEBHOOK_URL="https://hooks.slack.com/services/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"
# <<< --------------------------------------------------------------- >>>

mkdir -p "$APP_DIR"
cd "$APP_DIR"

mask() {
  local v="$1"
  [[ -z "$v" ]] && { echo "(empty)"; return; }
  local len=${#v}
  if (( len <= 8 )); then
    echo "****"
  else
    echo "${v[1,4]}****${v[-4,-1]}"
  fi
}

write_env() {
  cat > "$ENV_FILE" <<EOF
ADMIN_KEY=$CANON_ADMIN_KEY
JWT_SECRET=$CANON_JWT_SECRET
DATABASE_URL=$CANON_DATABASE_URL
export OPENAI_API_KEY=${OPENAI_API_KEY:-""}
AI_MODEL=$CANON_AI_MODEL
SLACK_WEBHOOK_URL=$CANON_SLACK_WEBHOOK_URL
EOF
}

backup_env() {
  [[ -f "$ENV_FILE" ]] || return 0
  mkdir -p "$BACKUP_DIR"
  local ts
  ts=$(date +"%Y%m%d_%H%M%S")
  cp "$ENV_FILE" "$BACKUP_DIR/.env.$ts.bak"
  echo "🔒 Backed up existing .env -> $BACKUP_DIR/.env.$ts.bak"
}

cmd="${1:-help}"

case "$cmd" in
  open)
    if [[ -f "$ENV_FILE" ]]; then
      echo "Opening .env in TextEdit..."
      open -a TextEdit "$ENV_FILE"
    else
      echo ".env not found — creating from canonical values first."
      backup_env
      write_env
      open -a TextEdit "$ENV_FILE"
    fi
    ;;

  reset)
    force="${2:-}"
    if [[ "$force" != "--force" ]]; then
      echo "⚠️  This will overwrite $ENV_FILE with your canonical values."
      read "ans?Type 'YES' to continue: "
      if [[ "$ans" != "YES" ]]; then
        echo "Aborted."
        exit 1
      fi
    fi
    backup_env
    write_env
    echo "✅ .env has been reset."
    ;;

  show)
    if [[ ! -f "$ENV_FILE" ]]; then
      echo ".env not found."
      exit 1
    fi
    echo "Current .env (masked):"
    echo "  ADMIN_KEY            = $(mask "$(grep -E '^ADMIN_KEY=' "$ENV_FILE" | cut -d= -f2-)")"
    echo "  JWT_SECRET           = $(mask "$(grep -E '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2-)")"
    echo "  DATABASE_URL         = $(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
export OPENAI_API_KEY=${OPENAI_API_KEY:-""}
    echo "  AI_MODEL             = $(grep -E '^AI_MODEL=' "$ENV_FILE" | cut -d= -f2-)"
    echo "  SLACK_WEBHOOK_URL    = $(mask "$(grep -E '^SLACK_WEBHOOK_URL=' "$ENV_FILE" | cut -d= -f2-)")"
    ;;

  help|*)
    cat <<USAGE
Usage:
  ./manage_env.sh open         # open .env in TextEdit (creates if missing)
  ./manage_env.sh reset        # overwrite .env (prompts)
  ./manage_env.sh reset --force
  ./manage_env.sh show         # print masked values

Notes:
- Canonical values are defined at the top of this script.
- Backups go to: $BACKUP_DIR
USAGE
    ;;
esac
