import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AiReportRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  queued: "대기중",
  generating: "작성중",
  done: "완료",
  failed: "실패",
};

export default async function ReportsPage() {
  const supabase = createClient();
  const { data: reportRows } = await (supabase.from("ai_reports") as any)
    .select("*")
    .order("created_at", { ascending: false });
  const reports = reportRows as AiReportRow[] | null;

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>보고서</h1>

      {!reports || reports.length === 0 ? (
        <div className="card" style={{ color: "#64748b" }}>
          아직 생성된 보고서가 없습니다. 분석이 완료된 영상에서 보고서 생성하기를 눌러 주세요.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/dashboard/reports/${report.id}`}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none" }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{report.title}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  {new Date(report.created_at).toLocaleString("ko-KR")}
                </div>
              </div>
              <span className={`status-badge status-${report.status}`}>{STATUS_LABEL[report.status]}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
