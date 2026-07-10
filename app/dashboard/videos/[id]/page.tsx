import { notFound } from "next/navigation";
import { createReportForVideo } from "@/app/dashboard/reports/actions";
import { deleteVideo } from "@/app/dashboard/videos/actions";
import { createClient } from "@/lib/supabase/server";
import type { AnomalyEventRow, VideoRow } from "@/lib/types";
import { getUserPlan, PLAN_INFO } from "@/lib/plan";
import { VideoStatusBar } from "./VideoStatusBar";
import { SubmitButton } from "@/app/components/SubmitButton";

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function VideoDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canGenerateReports = PLAN_INFO[getUserPlan(user)].canGenerateReports;

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
      const downloadName = `${video.filename.replace(/\.[^.]+$/, "")}_${formatTime(ev.start_time_sec)}-${formatTime(ev.end_time_sec)}.mp4`;
      const clipDownloadUrl = ev.clip_storage_path
        ? (
            await supabase.storage
              .from("clips")
              .createSignedUrl(ev.clip_storage_path, 3600, { download: downloadName })
          ).data?.signedUrl
        : null;
      return { ...ev, clipUrl, thumbUrl, clipDownloadUrl };
    })
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{video.filename}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {video.status === "done" && canGenerateReports && (
            <form action={createReportForVideo}>
              <input type="hidden" name="videoId" value={video.id} />
              <SubmitButton pendingText="보고서 생성 중...">보고서 생성하기</SubmitButton>
            </form>
          )}
          {video.status === "done" && !canGenerateReports && (
            <span
              className="btn btn-secondary"
              style={{ opacity: 0.6, cursor: "not-allowed" }}
              title="Premium 플랜으로 업그레이드하면 AI 보고서를 생성할 수 있어요"
            >
              보고서 생성은 Premium 전용
            </span>
          )}
          <form action={deleteVideo}>
            <input type="hidden" name="videoId" value={video.id} />
            <button className="btn btn-danger" type="submit">
              삭제
            </button>
          </form>
        </div>
      </div>
      <VideoStatusBar videoId={video.id} initialStatus={video.status} initialProgress={video.progress} />

      {searchParams.error && (
        <div className="card" style={{ borderColor: "#fecaca", marginBottom: 20, color: "#b91c1c" }}>
          {searchParams.error}
        </div>
      )}

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
              {ev.clipDownloadUrl && (
                <a
                  href={ev.clipDownloadUrl}
                  download
                  className="btn"
                  style={{ display: "inline-block", marginTop: 10 }}
                >
                  영상 다운로드
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
