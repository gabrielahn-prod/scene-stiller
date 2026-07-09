"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AiReportRow, AnomalyEventRow, VideoRow } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const REPORT_MODEL = process.env.OPENAI_REPORT_MODEL ?? "gpt-5.4-mini";

type IncidentReportJson = {
  title: string;
  submissionTargets: string[];
  incidentSummary: string;
  evidenceSummary: string;
  timeline: Array<{
    timeRange: string;
    person: string;
    finding: string;
    anomalyScore: number;
  }>;
  suggestedAttachments: string[];
  limitations: string[];
  policeStatementDraft: string;
  insuranceStatementDraft: string;
  nextActions: string[];
};

function formatSeconds(sec: number) {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function buildFallbackReport(video: VideoRow, events: AnomalyEventRow[]): IncidentReportJson {
  const timeline = events.map((event) => ({
    timeRange: `${formatSeconds(event.start_time_sec)}-${formatSeconds(event.end_time_sec)}`,
    person: `person #${event.track_id}`,
    finding: "시스템이 이상행동 후보 구간으로 탐지했습니다.",
    anomalyScore: Number(event.anomaly_score.toFixed(3)),
  }));

  const eventCountText = events.length > 0 ? `${events.length}개의 이상행동 후보 구간` : "이상행동 후보 구간 없음";

  return {
    title: `${video.filename} 영상 분석 보고서`,
    submissionTargets: ["경찰 신고 접수", "보험사 사고/도난 접수"],
    incidentSummary: `업로드 영상 ${video.filename}에 대한 이상행동 탐지 결과, ${eventCountText}이 확인되었습니다.`,
    evidenceSummary: `영상 길이 ${video.duration_sec ? `${video.duration_sec.toFixed(1)}초` : "미확인"}, 해상도 ${
      video.frame_width && video.frame_height ? `${video.frame_width}x${video.frame_height}` : "미확인"
    }, FPS ${video.fps ? video.fps.toFixed(2) : "미확인"} 기준으로 분석되었습니다.`,
    timeline,
    suggestedAttachments: ["원본 영상 파일", "이상행동 탐지 클립", "썸네일 이미지", "본 보고서"],
    limitations: [
      "본 문서는 AI 기반 영상 분석 결과를 바탕으로 한 제출용 초안입니다.",
      "범죄 사실, 고의성, 손해액은 담당 기관 또는 보험사의 추가 확인이 필요합니다.",
    ],
    policeStatementDraft: `본인은 ${video.filename} 영상에서 확인된 이상행동 의심 구간에 대해 사실 확인 및 필요한 조치를 요청합니다.`,
    insuranceStatementDraft: `보험금 청구 또는 사고 접수를 위해 ${video.filename} 영상 분석 결과와 관련 증빙 자료를 제출합니다.`,
    nextActions: ["원본 영상을 보존합니다.", "탐지 클립을 제출 자료에 첨부합니다.", "피해 물품/손해 내역이 있으면 별도 목록으로 정리합니다."],
  };
}

function reportJsonToMarkdown(report: IncidentReportJson) {
  const timeline =
    report.timeline.length > 0
      ? report.timeline
          .map((item) => `- ${item.timeRange} / ${item.person}: ${item.finding} (점수 ${item.anomalyScore})`)
          .join("\n")
      : "- 탐지된 이상행동 후보 구간이 없습니다.";

  return `# ${report.title}

## 제출 대상
${report.submissionTargets.map((target) => `- ${target}`).join("\n")}

## 사건 개요
${report.incidentSummary}

## 영상 분석 및 증거 요약
${report.evidenceSummary}

## 주요 탐지 구간
${timeline}

## 첨부 권장 자료
${report.suggestedAttachments.map((item) => `- ${item}`).join("\n")}

## 경찰 제출용 진술 초안
${report.policeStatementDraft}

## 보험사 제출용 진술 초안
${report.insuranceStatementDraft}

## 한계 및 유의사항
${report.limitations.map((item) => `- ${item}`).join("\n")}

## 다음 조치
${report.nextActions.map((item) => `- ${item}`).join("\n")}
`;
}

function extractOutputText(responseJson: any) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;

  const text = responseJson.output
    ?.flatMap((item: any) => item.content ?? [])
    ?.map((content: any) => content.text)
    ?.filter(Boolean)
    ?.join("\n");

  return typeof text === "string" && text.length > 0 ? text : null;
}

async function generateReportWithOpenAI(
  supabase: SupabaseClient,
  video: VideoRow,
  events: AnomalyEventRow[]
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다. root .env 또는 배포 환경 변수에 추가해 주세요.");
  }

  const fallback = buildFallbackReport(video, events);
  const payload = {
    video: {
      filename: video.filename,
      processedAt: video.processed_at,
      durationSec: video.duration_sec,
      fps: video.fps,
      frameWidth: video.frame_width,
      frameHeight: video.frame_height,
    },
    anomalyEvents: events.map((event) => ({
      trackId: event.track_id,
      startTime: formatSeconds(event.start_time_sec),
      endTime: formatSeconds(event.end_time_sec),
      startTimeSec: event.start_time_sec,
      endTimeSec: event.end_time_sec,
      anomalyScore: Number(event.anomaly_score.toFixed(3)),
      threshold: Number(event.threshold.toFixed(3)),
    })),
  };

  // 탐지 구간마다 뽑아둔 썸네일을 GPT가 실제로 보고 해석하도록 이미지로 첨부한다.
  const eventThumbnails = await Promise.all(
    events.map(async (event) => {
      if (!event.thumbnail_storage_path) return null;
      const { data } = await supabase.storage
        .from("clips")
        .createSignedUrl(event.thumbnail_storage_path, 600);
      return data?.signedUrl
        ? {
            label: `${formatSeconds(event.start_time_sec)}-${formatSeconds(event.end_time_sec)} / person #${event.track_id}`,
            url: data.signedUrl,
          }
        : null;
    })
  );

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: `다음 영상 분석 결과로 제출용 보고서 JSON을 작성해 주세요. 이어서 각 탐지 구간의 스냅샷 이미지를 보여드릴 테니, 점수만 보고 판단하지 말고 이미지 속 사람의 행동/자세/주변 상황을 직접 관찰해서 finding과 evidenceSummary에 반영해 주세요.\n${JSON.stringify(payload, null, 2)}`,
    },
  ];
  for (const thumb of eventThumbnails) {
    if (!thumb) continue;
    userContent.push({ type: "input_text", text: `[구간 ${thumb.label} 스냅샷]` });
    userContent.push({ type: "input_image", image_url: thumb.url });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REPORT_MODEL,
      input: [
        {
          role: "system",
          content:
            "너는 한국어 CCTV/이상행동 분석 보고서를 작성하는 보조자다. 경찰 또는 보험사 제출에 적합한 사실 중심 문서 초안을 작성한다. 함께 제공되는 탐지 구간 스냅샷 이미지를 직접 관찰해서 사람의 행동/자세/주변 물건 등 시각적 근거를 반영하고, 이미지만으로 단정할 수 없는 부분은 한계로 명시한다. 탐지 결과를 범죄 확정처럼 단정하지 말고, AI 탐지 후보와 확인 필요 사항을 분리한다.",
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "incident_report",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: Object.keys(fallback),
            properties: {
              title: { type: "string" },
              submissionTargets: { type: "array", items: { type: "string" } },
              incidentSummary: { type: "string" },
              evidenceSummary: { type: "string" },
              timeline: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["timeRange", "person", "finding", "anomalyScore"],
                  properties: {
                    timeRange: { type: "string" },
                    person: { type: "string" },
                    finding: { type: "string" },
                    anomalyScore: { type: "number" },
                  },
                },
              },
              suggestedAttachments: { type: "array", items: { type: "string" } },
              limitations: { type: "array", items: { type: "string" } },
              policeStatementDraft: { type: "string" },
              insuranceStatementDraft: { type: "string" },
              nextActions: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI 보고서 생성 실패 (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const responseJson = await response.json();
  const outputText = extractOutputText(responseJson);
  if (!outputText) {
    throw new Error("OpenAI 응답에서 보고서 텍스트를 찾지 못했습니다.");
  }

  const reportJson = JSON.parse(outputText) as IncidentReportJson;
  return {
    reportJson,
    markdown: reportJsonToMarkdown(reportJson),
  };
}

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

  const { data: events } = await supabase
    .from("anomaly_events")
    .select("*")
    .eq("video_id", videoId)
    .order("start_time_sec", { ascending: true })
    .returns<AnomalyEventRow[]>();

  const reportDate = new Date().toISOString().slice(0, 10);
  const title = `${video.filename} 분석 보고서`;
  const { data: reportResult, error } = await (supabase.from("ai_reports") as any)
    .upsert(
      {
        video_id: video.id,
        user_id: user.id,
        report_date: reportDate,
        title,
        status: "generating",
        report_json: {},
        report_markdown: null,
        ai_model: REPORT_MODEL,
        error_message: null,
        updated_at: new Date().toISOString(),
        generated_at: null,
      },
      { onConflict: "video_id" }
    )
    .select("*")
    .single();
  const report = reportResult as AiReportRow | null;

  if (error || !report) {
    redirect(`/dashboard/videos/${videoId}?error=${encodeURIComponent(error?.message ?? "보고서 생성 요청 실패")}`);
  }

  try {
    const generated = await generateReportWithOpenAI(supabase, video, events ?? []);
    const { error: updateError } = await (supabase.from("ai_reports") as any)
      .update({
        title: generated.reportJson.title || title,
        status: "done",
        report_json: generated.reportJson,
        report_markdown: generated.markdown,
        ai_model: REPORT_MODEL,
        error_message: null,
        updated_at: new Date().toISOString(),
        generated_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    if (updateError) {
      throw updateError;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "보고서 생성 중 알 수 없는 오류가 발생했습니다.";
    await (supabase.from("ai_reports") as any)
      .update({
        status: "failed",
        error_message: message.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", report.id);
  }

  revalidatePath("/dashboard/reports");
  redirect(`/dashboard/reports/${report.id}`);
}

export async function deleteReport(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) {
    redirect("/dashboard/reports");
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: reportRow } = await (supabase.from("ai_reports") as any)
    .select("*")
    .eq("id", reportId)
    .single();
  const report = reportRow as AiReportRow | null;

  if (!report || report.user_id !== user.id) {
    redirect("/dashboard/reports");
  }

  const admin = createAdminClient();
  await admin.from("ai_reports").delete().eq("id", report.id).eq("user_id", user.id);

  revalidatePath("/dashboard/reports");
  redirect("/dashboard/reports");
}
