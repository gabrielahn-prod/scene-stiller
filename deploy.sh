#!/usr/bin/env bash
# 워커를 docker swarm service로 (재)배포. 사용법: ./build.sh && ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

SERVICE_NAME=scene-stiller-worker
IMAGE=scene-stiller-worker:latest
ENV_FILE=.env

if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy] $ENV_FILE not found in $(pwd)" >&2
  exit 1
fi

if ! docker info 2>/dev/null | grep -q "Swarm: active"; then
  echo "[deploy] swarm mode inactive, initializing"
  docker swarm init
fi

ENV_FLAGS=()
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  ENV_FLAGS+=(--env "$line")
done < "$ENV_FILE"

# 폴링 데몬이라 무중단 롤링업데이트 필요 없음 - 지우고 새로 만드는 게 제일 단순함
docker service rm "$SERVICE_NAME" >/dev/null 2>&1 || true
while docker service inspect "$SERVICE_NAME" >/dev/null 2>&1; do
  sleep 1
done

docker service create \
  --name "$SERVICE_NAME" \
  --restart-condition any \
  --restart-delay 5s \
  --mount type=volume,source=worker_tmp,target=/app/tmp \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  "${ENV_FLAGS[@]}" \
  "$IMAGE"

echo "[deploy] done. logs: docker service logs -f $SERVICE_NAME"
