"""ffmpeg으로 이상행동 구간 클립 + 썸네일 추출."""

from __future__ import annotations

import subprocess
from pathlib import Path


def extract_clip(
    video_path: str, start_sec: float, end_sec: float, out_path: str | Path, pad_sec: float = 1.0
) -> None:
    """[start_sec, end_sec] 구간을 앞뒤로 pad_sec만큼 여유를 두고 잘라낸다.

    -ss를 -i 뒤에 둬서(느리지만 프레임 정확한) 정확한 구간 컷을 보장한다.
    클립은 짧으므로(수 초) 재인코딩 비용은 무시할 만하다.
    """

    start = max(0.0, start_sec - pad_sec)
    duration = (end_sec - start_sec) + 2 * pad_sec

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-ss", f"{start:.3f}",
        "-t", f"{duration:.3f}",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-movflags", "+faststart",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def extract_thumbnail(video_path: str, at_sec: float, out_path: str | Path) -> None:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{max(0.0, at_sec):.3f}",
        "-i", video_path,
        "-frames:v", "1",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
