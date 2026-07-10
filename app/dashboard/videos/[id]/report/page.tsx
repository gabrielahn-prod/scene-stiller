import { notFound, redirect } from "next/navigation";
import { createPhotoReport, createTextReport } from "@/app/dashboard/reports/actions";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, PLAN_INFO } from "@/lib/plan";
import type { VideoRow } from "@/lib/types";
import { SubmitButton } from "@/app/components/SubmitButton";

export default async function ReportTypeChoicePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!PLAN_INFO[getUserPlan(user)].canGenerateReports) {
    redirect(`/dashboard/videos/${params.id}?error=${encodeURIComponent("보고서 생성은 Premium 플랜에서만 가능합니다.")}`);
  }

  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", params.id)
    .single<VideoRow>();

  if (!video) notFound();
  if (video.status !== "done") redirect(`/dashboard/videos/${params.id}`);

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>보고서 종류 선택</h1>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>{video.filename}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <form action={createPhotoReport} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="hidden" name="videoId" value={video.id} />
          <h2 style={{ fontSize: 15, margin: 0 }}>사진 근거 자료 보고서</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0, flex: 1 }}>
            탐지된 이상행동 구간의 스냅샷과 클립을 시간순으로 모은 증거 자료입니다. AI 해석 없이 즉시 생성됩니다.
          </p>
          <SubmitButton pendingText="생성 중..." className="btn btn-secondary">
            사진 근거 자료로 생성
          </SubmitButton>
        </form>

        <form action={createTextReport} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="hidden" name="videoId" value={video.id} />
          <h2 style={{ fontSize: 15, margin: 0 }}>AI 텍스트 보고서</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0, flex: 1 }}>
            사건 개요, 위험도, 서류 제출용 진술 초안까지 정리된 글 형태의 보고서입니다. 생성에 다소 시간이 걸립니다.
          </p>
          <SubmitButton pendingText="생성 중...">AI 텍스트 보고서로 생성</SubmitButton>
        </form>
      </div>
    </div>
  );
}
