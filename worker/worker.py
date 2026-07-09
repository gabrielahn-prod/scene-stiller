"""분석 워커 메인 루프.

Supabase의 `videos` 테이블을 폴링하며 status='uploaded'인 영상을 하나씩 집어가
(1) 원본 영상 다운로드 -> (2) YOLO11-pose+ByteTrack 포즈 추출 ->
(3) 오토인코더 이상행동 탐지 -> (4) ffmpeg 클립/썸네일 추출 -> (5) 결과 업로드 및
DB 반영까지 수행한다.

실행: python worker.py   (계속 떠 있으면서 새 업로드를 감시하는 데몬 프로세스)

Vercel 같은 서버리스 환경은 장시간 실행되는 ML 추론에 맞지 않기 때문에,
프론트엔드(web/, Next.js)와 이 워커는 별도 프로세스/서버로 분리되어 있다.
로컬 머신이나 GPU가 있는 별도 서버에서 상시 실행하는 것을 전제로 한다.
"""

from __future__ import annotations

import os
import shutil
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

from pipeline.report import process_video

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
POLL_INTERVAL_SEC = float(os.environ.get("POLL_INTERVAL_SEC", "5"))
POSE_MODEL = os.environ.get("POSE_MODEL", "yolo11n-pose.pt")
WORK_DIR = Path(os.environ.get("WORK_DIR", "./tmp"))

ANOMALY_WINDOW_FRAMES = int(os.environ.get("ANOMALY_WINDOW_FRAMES", "32"))
ANOMALY_STRIDE_FRAMES = int(os.environ.get("ANOMALY_STRIDE_FRAMES", "8"))
ANOMALY_THRESHOLD_STD = float(os.environ.get("ANOMALY_THRESHOLD_STD", "2.5"))
ANOMALY_MIN_SEGMENT_FRAMES = int(os.environ.get("ANOMALY_MIN_SEGMENT_FRAMES", "16"))


def fetch_next_pending_video(sb: Client) -> dict | None:
    res = (
        sb.table("videos")
        .select("*")
        .eq("status", "uploaded")
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def mark_processing(sb: Client, video_id: str) -> None:
    sb.table("videos").update({"status": "processing"}).eq("id", video_id).execute()


def mark_done(sb: Client, video_id: str, meta) -> None:
    sb.table("videos").update(
        {
            "status": "done",
            "duration_sec": meta.frame_count / meta.fps if meta.fps else None,
            "fps": meta.fps,
            "frame_width": meta.width,
            "frame_height": meta.height,
            "processed_at": "now()",
        }
    ).eq("id", video_id).execute()


def mark_failed(sb: Client, video_id: str, error_message: str) -> None:
    sb.table("videos").update(
        {"status": "failed", "error_message": error_message[:2000]}
    ).eq("id", video_id).execute()


def process_one(sb: Client, video_row: dict) -> None:
    video_id = video_row["id"]
    user_id = video_row["user_id"]
    storage_path = video_row["storage_path"]

    print(f"[worker] processing video_id={video_id} storage_path={storage_path}")
    mark_processing(sb, video_id)

    video_work_dir = WORK_DIR / video_id
    video_work_dir.mkdir(parents=True, exist_ok=True)
    local_video_path = video_work_dir / "original.mp4"

    try:
        # 1) 원본 영상 다운로드
        blob = sb.storage.from_("videos").download(storage_path)
        local_video_path.write_bytes(blob)

        # 2~4) 포즈 추출 -> 이상행동 탐지 -> 클립 추출
        meta, results = process_video(
            video_path=str(local_video_path),
            video_id=video_id,
            work_dir=str(WORK_DIR),
            pose_model=POSE_MODEL,
            window_frames=ANOMALY_WINDOW_FRAMES,
            stride_frames=ANOMALY_STRIDE_FRAMES,
            threshold_std=ANOMALY_THRESHOLD_STD,
            min_segment_frames=ANOMALY_MIN_SEGMENT_FRAMES,
        )

        # 5) 클립/썸네일 업로드 + anomaly_events insert
        for seg, clip_path, thumb_path in results:
            clip_storage_path = f"{user_id}/{video_id}/{clip_path.name}"
            thumb_storage_path = f"{user_id}/{video_id}/{thumb_path.name}"

            sb.storage.from_("clips").upload(
                clip_storage_path, str(clip_path), {"content-type": "video/mp4"}
            )
            sb.storage.from_("clips").upload(
                thumb_storage_path, str(thumb_path), {"content-type": "image/jpeg"}
            )

            sb.table("anomaly_events").insert(
                {
                    "video_id": video_id,
                    "user_id": user_id,
                    "track_id": seg.track_id,
                    "start_frame": seg.start_frame,
                    "end_frame": seg.end_frame,
                    "start_time_sec": seg.start_time_sec,
                    "end_time_sec": seg.end_time_sec,
                    "anomaly_score": seg.score,
                    "threshold": seg.threshold,
                    "clip_storage_path": clip_storage_path,
                    "thumbnail_storage_path": thumb_storage_path,
                }
            ).execute()

        mark_done(sb, video_id, meta)
        print(f"[worker] done video_id={video_id} events={len(results)}")

    except Exception as exc:  # noqa: BLE001 - 워커는 절대 죽지 않고 실패를 기록해야 함
        print(f"[worker] FAILED video_id={video_id}: {exc}")
        traceback.print_exc()
        mark_failed(sb, video_id, str(exc))

    finally:
        shutil.rmtree(video_work_dir, ignore_errors=True)


def main() -> None:
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[worker] started, polling every {POLL_INTERVAL_SEC}s")
    while True:
        video_row = fetch_next_pending_video(sb)
        if video_row is None:
            time.sleep(POLL_INTERVAL_SEC)
            continue

        process_one(sb, video_row)


if __name__ == "__main__":
    main()
