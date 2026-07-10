import Link from "next/link";
import { deleteReport } from "@/app/dashboard/reports/actions";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, PLAN_INFO } from "@/lib/plan";
import type { AiReportRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  queued: "대기중",
  generating: "작성중",
  done: "완료",
  failed: "실패",
};

export default async function ReportsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canGenerateReports = PLAN_INFO[getUserPlan(user)].canGenerateReports;

  const { data: reportRows } = await (supabase.from("ai_reports") as any)
    .select("*")
    .order("created_at", { ascending: false });
  const reports = reportRows as AiReportRow[] | null;

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>보고서</h1>

      {!canGenerateReports && (
        <div className="card" style={{ marginBottom: 16, background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
          AI 보고서 생성은 Premium 플랜 전용 기능입니다. 현재 Pro 플랜에서는 영상 분석 결과만 확인할 수 있어요.
        </div>
      )}

      {!reports || reports.length === 0 ? (
        <div className="card" style={{ color: "#64748b" }}>
          아직 생성된 보고서가 없습니다. 분석이 완료된 영상에서 보고서 생성하기를 눌러 주세요.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reports.map((report) => (
            <div
              key={report.id}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none" }}
            >
              <Link href={`/dashboard/reports/${report.id}`} style={{ textDecoration: "none", flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{report.title}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  {new Date(report.created_at).toLocaleString("ko-KR")}
                </div>
              </Link>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="status-badge" style={{ background: "#e2e8f0", color: "#475569" }}>
                  {report.report_type === "photo" ? "사진 근거" : "AI 텍스트"}
                </span>
                <span className={`status-badge status-${report.status}`}>{STATUS_LABEL[report.status]}</span>
                <form action={deleteReport}>
                  <input type="hidden" name="reportId" value={report.id} />
                  <button className="btn btn-danger" type="submit">
                    삭제
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
