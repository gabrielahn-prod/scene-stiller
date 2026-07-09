"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AiReportRow, VideoRow } from "@/lib/types";

export async function createReportForVideo(formData: FormData) {
  const videoId = String(formData.get("videoId") ?? "");
  if (!videoId) {
    redirect("/dashboard/videos");
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .single<VideoRow>();

  if (!video || video.status !== "done") {
    redirect(`/dashboard/videos/${videoId}`);
  }

  const reportDate = new Date().toISOString().slice(0, 10);
  const title = `${video.filename} 분석 보고서`;
  const { data: report, error } = await (supabase.from("ai_reports") as any)
    .upsert(
      {
        video_id: video.id,
        user_id: user.id,
        report_date: reportDate,
        title,
        status: "queued",
        report_json: {},
        report_markdown: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "video_id" }
    )
    .select("*")
    .single<AiReportRow>();

  if (error || !report) {
    redirect(`/dashboard/videos/${videoId}?error=${encodeURIComponent(error?.message ?? "보고서 생성 요청 실패")}`);
  }

  revalidatePath("/dashboard/reports");
  redirect(`/dashboard/reports/${report.id}`);
}
