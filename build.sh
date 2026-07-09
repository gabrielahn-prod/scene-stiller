#!/usr/bin/env bash
# 워커 이미지 빌드. 사용법: ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

IMAGE=scene-stiller-worker:latest

docker build -t "$IMAGE" -f worker/Dockerfile ./worker
echo "[build] built $IMAGE"
