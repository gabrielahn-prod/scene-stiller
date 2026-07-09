#!/usr/bin/env bash
# 로컬(맥) Docker Desktop에서 워커 실행. 노트북이 켜져있는 동안만 동작.
# 사용법: ./build.sh && ./run-local.sh
set -euo pipefail
cd "$(dirname "$0")"

CONTAINER_NAME=scene-stiller-worker
IMAGE=scene-stiller-worker:latest
ENV_FILE=.env

if [ ! -f "$ENV_FILE" ]; then
  echo "[run-local] $ENV_FILE not found in $(pwd)" >&2
  exit 1
fi

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -v scene-stiller-worker-tmp:/app/tmp \
  "$IMAGE"

echo "[run-local] started. logs: docker logs -f $CONTAINER_NAME"
