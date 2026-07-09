import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { VideoRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "대기중",
  processing: "분석중",
  done: "완료",
  failed: "실패",
};

export default async function VideosPage() {
  const supabase = createClient();
  // RLS 정책(videos_select_own)이 자기 user_id 행만 반환하도록 보장한다.
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<VideoRow[]>();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>내 영상</h1>
        <Link className="btn" href="/dashboard/upload">
          + 새 영상 업로드
        </Link>
      </div>

      {!videos || videos.length === 0 ? (
        <div className="card" style={{ color: "#64748b" }}>
          아직 업로드한 영상이 없습니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {videos.map((v) => (
            <Link
              key={v.id}
              href={`/dashboard/videos/${v.id}`}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{v.filename}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  {new Date(v.created_at).toLocaleString("ko-KR")}
                </div>
              </div>
              <span className={`status-badge status-${v.status}`}>{STATUS_LABEL[v.status]}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
