"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { VideoStatus } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "대기중 (워커가 아직 픽업하지 않음)",
  processing: "분석중 (포즈 추출 / 이상행동 탐지 진행)",
  done: "완료",
  failed: "실패",
};

export function VideoStatusBar({
  videoId,
  initialStatus,
  initialProgress,
}: {
  videoId: string;
  initialStatus: VideoStatus;
  initialProgress: number;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState(initialProgress);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`video-status-${videoId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "videos", filter: `id=eq.${videoId}` },
        (payload) => {
          const next = payload.new as { status: VideoStatus; progress: number };
          setStatus(next.status);
          setProgress(next.progress);
          if (next.status === "done" || next.status === "failed") {
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [videoId, router]);

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: status === "processing" ? 8 : 0 }}>
        상태: <span className={`status-badge status-${status}`}>{STATUS_LABEL[status]}</span>
      </p>
      {status === "processing" && (
        <div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{progress}%</div>
        </div>
      )}
    </div>
  );
}
