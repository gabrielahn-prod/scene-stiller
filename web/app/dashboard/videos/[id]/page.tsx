import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AnomalyEventRow, VideoRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "대기중 (워커가 아직 픽업하지 않음)",
  processing: "분석중 (포즈 추출 / 이상행동 탐지 진행)",
  done: "완료",
  failed: "실패",
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function VideoDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", params.id)
    .single<VideoRow>();

  if (!video) notFound();

  const { data: events } = await supabase
    .from("anomaly_events")
    .select("*")
    .eq("video_id", params.id)
    .order("start_time_sec", { ascending: true })
    .returns<AnomalyEventRow[]>();

  const { data: signedOriginal } = video.storage_path
    ? await supabase.storage.from("videos").createSignedUrl(video.storage_path, 3600)
    : { data: null };

  const eventsWithUrls = await Promise.all(
    (events ?? []).map(async (ev) => {
      const clipUrl = ev.clip_storage_path
        ? (await supabase.storage.from("clips").createSignedUrl(ev.clip_storage_path, 3600)).data
            ?.signedUrl
        : null;
      const thumbUrl = ev.thumbnail_storage_path
        ? (await supabase.storage.from("clips").createSignedUrl(ev.thumbnail_storage_path, 3600))
            .data?.signedUrl
        : null;
      return { ...ev, clipUrl, thumbUrl };
    })
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>{video.filename}</h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>
        상태:{" "}
        <span className={`status-badge status-${video.status}`}>{STATUS_LABEL[video.status]}</span>
      </p>

      {video.status === "failed" && video.error_message && (
        <div className="card" style={{ borderColor: "#fecaca", marginBottom: 20, color: "#b91c1c" }}>
          분석 실패: {video.error_message}
        </div>
      )}

      {signedOriginal?.signedUrl && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>원본 영상</h2>
          <video src={signedOriginal.signedUrl} controls style={{ width: "100%", borderRadius: 8 }} />
        </div>
      )}

      <h2 style={{ fontSize: 15, marginBottom: 10 }}>
        이상행동 탐지 결과 {events && events.length > 0 && `(${events.length}건)`}
      </h2>

      {video.status !== "done" ? (
        <div className="card" style={{ color: "#64748b" }}>
          분석이 끝나면 이상행동 구간이 여기에 클립으로 표시됩니다.
        </div>
      ) : eventsWithUrls.length === 0 ? (
        <div className="card" style={{ color: "#15803d" }}>
          이상행동으로 탐지된 구간이 없습니다.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {eventsWithUrls.map((ev) => (
            <div key={ev.id} className="card">
              {ev.clipUrl ? (
                <video src={ev.clipUrl} controls poster={ev.thumbUrl ?? undefined} style={{ width: "100%", borderRadius: 8, marginBottom: 10 }} />
              ) : (
                <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>클립 없음</div>
              )}
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {formatTime(ev.start_time_sec)} – {formatTime(ev.end_time_sec)} · person #{ev.track_id}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                이상 점수 <strong>{ev.anomaly_score.toFixed(3)}</strong>{" "}
                <span style={{ color: "#64748b" }}>(임계값 {ev.threshold.toFixed(3)})</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
