#!/usr/bin/env bash
set -Eeuo pipefail

STACK_DIR="${STACK_DIR:-/opt/coreforge/reactive-resume}"
IMAGE="${IMAGE:-ghcr.io/disgruntledtech93/reactive-resume-renewed:latest}"
SERVICE="${SERVICE:-reactive-resume}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

cd "$STACK_DIR"

if [[ ! -f "$COMPOSE_FILE" || ! -f .env ]]; then
  echo "Expected $STACK_DIR/$COMPOSE_FILE and $STACK_DIR/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

mkdir -p /srv/reactive-resume/backups

echo "Creating PostgreSQL backup..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "/srv/reactive-resume/backups/pre-vault-${TIMESTAMP}.sql.gz"

cp "$COMPOSE_FILE" "${COMPOSE_FILE}.pre-vault-${TIMESTAMP}"

python3 - "$COMPOSE_FILE" "$IMAGE" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
image = sys.argv[2]
text = path.read_text()
pattern = re.compile(r'(^\s+image:\s+)(?:amruthpillai/reactive-resume|ghcr\.io/disgruntledtech93/reactive-resume-renewed):[^\s]+', re.MULTILINE)
updated, count = pattern.subn(rf'\g<1>{image}', text, count=1)
if count != 1:
    raise SystemExit("Could not locate the Reactive Resume image line in the Compose file.")
path.write_text(updated)
PY

echo "Pulling $IMAGE..."
docker compose -f "$COMPOSE_FILE" pull "$SERVICE"

echo "Recreating only the application container..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate "$SERVICE"

for _ in $(seq 1 45); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' coreforge-reactive-resume 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    echo "Reactive Resume Renewed is healthy."
    docker compose -f "$COMPOSE_FILE" ps
    exit 0
  fi
  if [[ "$status" == "unhealthy" || "$status" == "exited" ]]; then
    break
  fi
  sleep 2
done

echo "Deployment did not become healthy. Recent logs:" >&2
docker compose -f "$COMPOSE_FILE" logs --tail=150 "$SERVICE" >&2
exit 1
