import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { deleteReport } from "@/app/dashboard/reports/actions";
import { createClient } from "@/lib/supabase/server";
import type { AiReportRow, AnomalyEventRow, VideoRow } from "@/lib/types";
import { PdfDownloadButton } from "./PdfDownloadButton";

const STATUS_LABEL: Record<string, string> = {
  queued: "대기중",
  generating: "작성중",
  done: "완료",
  failed: "실패",
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: reportRow } = await (supabase.from("ai_reports") as any)
    .select("*")
    .eq("id", params.id)
    .single();
  const report = reportRow as AiReportRow | null;

  if (!report) notFound();

  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", report.video_id)
    .single<VideoRow>();

  const { data: events } = await supabase
    .from("anomaly_events")
    .select("*")
    .eq("video_id", report.video_id)
    .order("start_time_sec", { ascending: true })
    .returns<AnomalyEventRow[]>();

  const isPhotoReport = report.report_type === "photo";

  const eventsWithUrls = isPhotoReport
    ? await Promise.all(
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
      )
    : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>{report.title}</h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "8px 0 0" }}>
            상태: <span className={`status-badge status-${report.status}`}>{STATUS_LABEL[report.status]}</span>
            {" · "}
            {isPhotoReport ? "사진 근거 자료" : "AI 텍스트 보고서"}
          </p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {report.status === "done" && <PdfDownloadButton />}
          <Link className="btn btn-secondary" href={video ? `/dashboard/videos/${video.id}` : "/dashboard/videos"}>
            원본 영상 보기
          </Link>
          <form action={deleteReport}>
            <input type="hidden" name="reportId" value={report.id} />
            <button className="btn btn-danger" type="submit">
              삭제
            </button>
          </form>
        </div>
      </div>

      {report.status === "failed" && (
        <div className="card" style={{ borderColor: "#fecaca", color: "#b91c1c", marginBottom: 20 }}>
          보고서 생성 실패: {report.error_message ?? "알 수 없는 오류"}
        </div>
      )}

      {report.status !== "done" && report.status !== "failed" && (
        <div className="card" style={{ color: "#64748b", marginBottom: 20 }}>
          보고서를 작성하고 있습니다. 잠시 뒤 새로고침해 주세요.
        </div>
      )}

      {isPhotoReport ? (
        <>
          <div className="card" style={{ marginBottom: 20, fontSize: 13, color: "#64748b" }}>
            영상: {video?.filename ?? report.video_id} · 탐지 구간 {eventsWithUrls.length}건
          </div>
          {eventsWithUrls.length === 0 ? (
            <div className="card" style={{ color: "#15803d" }}>탐지된 이상행동 구간이 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {eventsWithUrls.map((ev) => (
                <div key={ev.id} className="card">
                  {ev.clipUrl ? (
                    <video
                      className="screen-only"
                      src={ev.clipUrl}
                      controls
                      poster={ev.thumbUrl ?? undefined}
                      style={{ width: "100%", borderRadius: 8, marginBottom: 10 }}
                    />
                  ) : (
                    <div className="screen-only" style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>클립 없음</div>
                  )}
                  {ev.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="print-only"
                      src={ev.thumbUrl}
                      alt=""
                      style={{ width: "100%", borderRadius: 8, marginBottom: 10 }}
                    />
                  ) : (
                    <div className="print-only" style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>썸네일 없음</div>
                  )}
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {formatTime(ev.start_time_sec)}-{formatTime(ev.end_time_sec)} · person #{ev.track_id}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    이상 점수 <strong>{ev.anomaly_score.toFixed(3)}</strong>{" "}
                    <span style={{ color: "#64748b" }}>(임계값 {ev.threshold.toFixed(3)})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        report.report_markdown && (
          <div className="card">
            <div className="report-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.report_markdown}</ReactMarkdown>
            </div>
          </div>
        )
      )}
    </div>
  );
}
