"""한 영상에 대해 포즈 추출 -> 이상행동 탐지 -> 클립 추출까지 end-to-end로 실행."""

from __future__ import annotations

from pathlib import Path

from . import anomaly_detection, clip_export, poselift_format, pose_extraction
from .anomaly_detection import AnomalySegment
from .pose_extraction import VideoMeta


def process_video(
    video_path: str,
    video_id: str,
    work_dir: str,
    pose_model: str = "yolo11n-pose.pt",
    window_frames: int = 32,
    stride_frames: int = 8,
    threshold_std: float = 2.5,
    min_segment_frames: int = 16,
) -> tuple[VideoMeta, list[tuple[AnomalySegment, Path, Path]]]:
    meta = pose_extraction.read_video_meta(video_path)

    tracks = pose_extraction.extract_pose_tracks(video_path, model_name=pose_model)
    normalized = {
        track_id: poselift_format.normalize_track(track) for track_id, track in tracks.items()
    }

    segments = anomaly_detection.detect_anomalies_for_video(
        normalized,
        fps=meta.fps,
        window_frames=window_frames,
        stride_frames=stride_frames,
        threshold_std=threshold_std,
        min_segment_frames=min_segment_frames,
    )

    clip_dir = Path(work_dir) / video_id / "clips"
    results: list[tuple[AnomalySegment, Path, Path]] = []

    for idx, seg in enumerate(segments):
        clip_path = clip_dir / f"event_{idx:03d}.mp4"
        thumb_path = clip_dir / f"event_{idx:03d}.jpg"

        clip_export.extract_clip(video_path, seg.start_time_sec, seg.end_time_sec, clip_path)
        mid_sec = (seg.start_time_sec + seg.end_time_sec) / 2
        clip_export.extract_thumbnail(video_path, mid_sec, thumb_path)

        results.append((seg, clip_path, thumb_path))

    return meta, results
