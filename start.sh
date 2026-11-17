#!/usr/bin/env bash
# Start the personal, localhost-only app. Run from any working directory.
set -Eeuo pipefail
umask 077

BREAD_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$BREAD_ROOT"
BREAD_OPEN_BROWSER=1
case "${1:-}" in
  '') ;;
  --no-open) BREAD_OPEN_BROWSER=0 ;;
  --help|-h)
    echo 'Usage: ./start.sh [--no-open]'
    echo 'Starts the local database, FastAPI, and React. Ctrl+C stops the app servers.'
    echo 'Requires Python 3.11+, Node.js 22.12+ (or 20.19+), and Docker Compose.'
    exit 0 ;;
  *) echo 'Unknown option. Usage: ./start.sh [--no-open]' >&2; exit 1 ;;
esac

BREAD_BACKEND_PID=''
BREAD_FRONTEND_PID=''
cleanup() {
  trap - EXIT INT TERM
  for bread_pid in "$BREAD_FRONTEND_PID" "$BREAD_BACKEND_PID"; do
    if [[ -n "$bread_pid" ]]; then kill -TERM "$bread_pid" 2>/dev/null || true; fi
  done
  for bread_pid in "$BREAD_FRONTEND_PID" "$BREAD_BACKEND_PID"; do
    if [[ -n "$bread_pid" ]]; then wait "$bread_pid" 2>/dev/null || true; fi
  done
  if [[ -n "$BREAD_BACKEND_PID$BREAD_FRONTEND_PID" ]]; then
    echo 'App servers stopped. PostgreSQL is still running; your data is preserved.'
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for bread_command in python3 node npm docker curl; do
  command -v "$bread_command" >/dev/null 2>&1 || {
    echo "Missing prerequisite: $bread_command. Install it and run ./start.sh again." >&2
    exit 1
  }
done
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else "Python 3.11+ is required.")'
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if (!((major===20 && minor>=19)||(major===22 && minor>=12)||major>22)) {console.error("Node.js 22.12+ (or 20.19+) is required.");process.exit(1)}'
docker compose version >/dev/null

# Never replace or terminate another app already using these ports.
python3 - <<'PY'
import socket
import sys
for port in (8000, 5173):
    # Connecting detects a live listener without mistaking TIME_WAIT sockets from
    # recently stopped servers for active processes. Each server also checks its
    # own bind, so a race or another bind failure still stops startup safely.
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=1):
            sys.exit(f'Port {port} is already in use. Stop your existing app server before running ./start.sh.')
    except (ConnectionRefusedError, TimeoutError):
        pass
PY

echo 'Preparing the app…'
if [[ ! -x backend/.venv/bin/python ]]; then
  python3 -m venv backend/.venv
fi
BREAD_PYTHON="$BREAD_ROOT/backend/.venv/bin/python"
if ! "$BREAD_PYTHON" -c 'import fastapi, uvicorn, sqlmodel, psycopg, pydantic_settings, pwdlib, email_validator, dotenv, argon2' >/dev/null 2>&1; then
  "$BREAD_PYTHON" -m pip install -e './backend[dev]'
fi

# This launcher manages local development only; do not downgrade production settings.
"$BREAD_PYTHON" - <<'PY'
import os
from dotenv import dotenv_values
if os.environ.get('ENVIRONMENT') == 'production' or dotenv_values('backend/.env').get('ENVIRONMENT') == 'production':
    raise SystemExit('This launcher is for local personal use. Use your production startup process for ENVIRONMENT=production.')
PY
if [[ ! -f .env || ! -f backend/.env ]]; then
  "$BREAD_PYTHON" backend/scripts/setup_local.py
fi

if [[ ! -x frontend/node_modules/.bin/vite || frontend/package-lock.json -nt frontend/node_modules/.package-lock.json ]]; then
  (cd frontend && npm ci)
fi

if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == 'Darwin' ]]; then
    echo 'Starting Docker Desktop…'
    open -a Docker
  else
    echo 'Start Docker, then run ./start.sh again.' >&2
    exit 1
  fi
  for ((bread_attempt=0; bread_attempt<60; bread_attempt++)); do
    if docker info >/dev/null 2>&1; then break; fi
    sleep 2
  done
  docker info >/dev/null 2>&1 || { echo 'Docker did not become ready. Open Docker Desktop and retry.' >&2; exit 1; }
fi

echo 'Starting PostgreSQL…'
docker compose up -d --wait --wait-timeout 90 db
if ! (cd backend && "$BREAD_PYTHON" -c 'from app.db import get_engine; from sqlalchemy import text; connection = get_engine().connect(); connection.execute(text("SELECT 1")); connection.close()') >/dev/null 2>&1; then
  echo 'Configuring the local database roles…'
  "$BREAD_PYTHON" backend/scripts/secure_local_db.py
fi
(cd backend && "$BREAD_PYTHON" -m app.db && "$BREAD_PYTHON" -m app.cleanup)

mkdir -p .run
echo 'Starting the backend and frontend…'
(
  cd backend
  exec "$BREAD_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers --timeout-graceful-shutdown 5
) > .run/backend.log 2>&1 &
BREAD_BACKEND_PID=$!
(
  cd frontend
  exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
) > .run/frontend.log 2>&1 &
BREAD_FRONTEND_PID=$!

wait_for_server() {
  local bread_url="$1" bread_pid="$2" bread_label="$3" bread_attempt
  for ((bread_attempt=0; bread_attempt<30; bread_attempt++)); do
    if ! kill -0 "$bread_pid" 2>/dev/null; then
      echo "$bread_label exited during startup. See .run/backend.log and .run/frontend.log." >&2
      return 1
    fi
    if curl --silent --fail --max-time 1 "$bread_url" >/dev/null; then return 0; fi
    sleep 1
  done
  echo "$bread_label did not become ready. Check the logs in .run/." >&2
  return 1
}
wait_for_server 'http://127.0.0.1:8000/health' "$BREAD_BACKEND_PID" 'Backend'
wait_for_server 'http://127.0.0.1:5173/' "$BREAD_FRONTEND_PID" 'Frontend'

echo
echo 'Your app is ready: http://127.0.0.1:5173'
echo 'API docs:          http://127.0.0.1:8000/docs'
echo 'Logs:              .run/backend.log and .run/frontend.log'
echo 'Keep this terminal open. Press Ctrl+C to stop the app servers.'
if [[ "$BREAD_OPEN_BROWSER" == 1 ]]; then
  if [[ "$(uname -s)" == 'Darwin' ]]; then
    open 'http://127.0.0.1:5173' || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open 'http://127.0.0.1:5173' >/dev/null 2>&1 || true
  fi
fi

while kill -0 "$BREAD_BACKEND_PID" 2>/dev/null && kill -0 "$BREAD_FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
echo 'An app server stopped. Check the logs in .run/.' >&2
exit 1
