"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, PLAN_INFO } from "@/lib/plan";
import type { AiReportRow, AnomalyEventRow, VideoRow } from "@/lib/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const REPORT_MODEL = process.env.OPENAI_REPORT_MODEL ?? "gpt-5.4-mini";

const SUSPICION_TYPES = ["결제 부재", "은닉 제스처", "입·출고 불일치", "기타"] as const;
type SuspicionType = (typeof SUSPICION_TYPES)[number];

type RiskLevel = "주의" | "경고" | "심각";

type TimelineFinding = {
  finding: string;
};

type IncidentReportJson = {
  title: string;
  storeName: string;
  storeAddress: string;
  incidentDateTime: string;
  cameraLocation: string;
  suspicionType: SuspicionType;
  incidentSummary: string;
  evidenceSummary: string[];
  timeline: TimelineFinding[];
  suggestedAttachments: string[];
  limitations: string[];
  submissionStatementDraft: string;
  nextActions: string[];
};

type TimelineEntry = {
  timeRange: string;
  person: string;
  finding: string;
  anomalyScore: number;
  threshold: number;
  riskLevel: RiskLevel;
};

function formatSeconds(sec: number) {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function computeRiskLevel(score: number, threshold: number): RiskLevel {
  const ratio = threshold > 0 ? score / threshold : score;
  if (ratio >= 1.5) return "심각";
  if (ratio >= 1.2) return "경고";
  return "주의";
}

function buildTimeline(events: AnomalyEventRow[], findings: TimelineFinding[]): TimelineEntry[] {
  return events.map((event, i) => ({
    timeRange: `${formatSeconds(event.start_time_sec)}-${formatSeconds(event.end_time_sec)}`,
    person: `person #${event.track_id}`,
    finding: findings[i]?.finding ?? "시스템이 이상행동 후보 구간으로 탐지했습니다.",
    anomalyScore: Number(event.anomaly_score.toFixed(3)),
    threshold: Number(event.threshold.toFixed(3)),
    riskLevel: computeRiskLevel(event.anomaly_score, event.threshold),
  }));
}

function getStoreMetadata(user: Pick<User, "user_metadata"> | null | undefined) {
  const businessName =
    typeof user?.user_metadata?.business_name === "string" ? user.user_metadata.business_name : "미등록 매장";
  const businessAddress =
    typeof user?.user_metadata?.business_address === "string" && user.user_metadata.business_address
      ? user.user_metadata.business_address
      : "미등록";
  return { businessName, businessAddress };
}

function buildFallbackReport(
  video: VideoRow,
  events: AnomalyEventRow[],
  store: { businessName: string; businessAddress: string }
): IncidentReportJson {
  return {
    title: `${store.businessName} CCTV 이상행동 분석 보고서`,
    storeName: store.businessName,
    storeAddress: store.businessAddress,
    incidentDateTime: `${video.created_at.slice(0, 10)} (영상 업로드일 기준)`,
    cameraLocation: video.camera_location ?? "미등록",
    suspicionType: "기타",
    incidentSummary: `업로드 영상 ${video.filename}에 대한 이상행동 탐지 결과, ${
      events.length > 0 ? `${events.length}개의 이상행동 후보 구간` : "이상행동 후보 구간 없음"
    }이 확인되었습니다.`,
    evidenceSummary: [
      `영상 길이 ${video.duration_sec ? `${video.duration_sec.toFixed(1)}초` : "미확인"}, 해상도 ${
        video.frame_width && video.frame_height ? `${video.frame_width}x${video.frame_height}` : "미확인"
      }, FPS ${video.fps ? video.fps.toFixed(2) : "미확인"} 기준으로 분석되었습니다.`,
    ],
    timeline: events.map(() => ({ finding: "시스템이 이상행동 후보 구간으로 탐지했습니다." })),
    suggestedAttachments: ["원본 영상 파일", "이상행동 탐지 클립", "썸네일 이미지", "본 보고서"],
    limitations: [
      "본 문서는 AI 기반 영상 분석 결과를 바탕으로 한 제출용 초안입니다.",
      "범죄 사실, 고의성, 손해액은 담당 기관 또는 보험사의 추가 확인이 필요합니다.",
    ],
    submissionStatementDraft: `${store.businessName}에서 ${video.filename} 영상 분석 중 확인된 이상행동 의심 구간에 대해 사실 확인 및 필요한 조치를 요청하며, 관련 증빙 자료를 제출합니다.`,
    nextActions: ["원본 영상을 보존합니다.", "탐지 클립을 제출 자료에 첨부합니다.", "피해 물품/손해 내역이 있으면 별도 목록으로 정리합니다."],
  };
}

function reportJsonToMarkdown(report: IncidentReportJson, timeline: TimelineEntry[]) {
  const timelineText =
    timeline.length > 0
      ? timeline
          .map(
            (item) =>
              `- ${item.timeRange} · ${item.person} · 위험도 **${item.riskLevel}** (점수 ${item.anomalyScore} / 임계값 ${item.threshold}): ${item.finding}`
          )
          .join("\n")
      : "- 탐지된 이상행동 후보 구간이 없습니다.";

  const evidenceText = report.evidenceSummary.map((line) => `- ${line}`).join("\n");

  return `# ${report.title}

## 사건 정보
- 매장명: ${report.storeName}
- 매장 주소: ${report.storeAddress}
- 발생 추정 일시: ${report.incidentDateTime}
- 카메라 위치: ${report.cameraLocation}
- 의심 구간 유형: ${report.suspicionType}

## 사건 개요
${report.incidentSummary}

## 영상 분석 및 증거 요약
${evidenceText}

## 주요 탐지 구간
${timelineText}

위험도 라벨은 탐지 임계값 대비 이상 점수 비율로 산정됩니다. 점수가 임계값의 1.2배 이상이면 도난이 어느 정도 의심되고, 1.5배 이상이면 도난이 유력한 것으로 판단됩니다. 최종 판단은 반드시 원본 영상 확인 후 진행해 주세요.

## 첨부 권장 자료
${report.suggestedAttachments.map((item) => `- ${item}`).join("\n")}

## 서류 제출용 진술 초안
${report.submissionStatementDraft}

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
  events: AnomalyEventRow[],
  store: { businessName: string; businessAddress: string }
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다. root .env 또는 배포 환경 변수에 추가해 주세요.");
  }

  const fallback = buildFallbackReport(video, events, store);
  const payload = {
    store,
    video: {
      filename: video.filename,
      processedAt: video.processed_at,
      createdAt: video.created_at,
      durationSec: video.duration_sec,
      fps: video.fps,
      frameWidth: video.frame_width,
      frameHeight: video.frame_height,
      cameraLocation: video.camera_location,
    },
    anomalyEvents: events.map((event, i) => ({
      index: i,
      trackId: event.track_id,
      timeRange: `${formatSeconds(event.start_time_sec)}-${formatSeconds(event.end_time_sec)}`,
      anomalyScore: Number(event.anomaly_score.toFixed(3)),
      threshold: Number(event.threshold.toFixed(3)),
    })),
  };

  // 탐지 구간마다 뽑아둔 썸네일을 GPT가 실제로 보고 해석하도록 이미지로 첨부한다.
  const eventThumbnails = await Promise.all(
    events.map(async (event, i) => {
      if (!event.thumbnail_storage_path) return null;
      const { data } = await supabase.storage
        .from("clips")
        .createSignedUrl(event.thumbnail_storage_path, 600);
      return data?.signedUrl
        ? {
            label: `구간 ${i} (${formatSeconds(event.start_time_sec)}-${formatSeconds(event.end_time_sec)}) / person #${event.track_id}`,
            url: data.signedUrl,
          }
        : null;
    })
  );

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: `다음 매장 정보와 영상 분석 결과로 제출용 보고서 JSON을 작성해 주세요. timeline 배열은 반드시 아래 anomalyEvents 배열과 같은 개수, 같은 순서로 작성하고 각 항목의 finding에는 해당 구간에서 관찰되는 행동만 서술하세요 (시간/점수는 이미 알고 있으니 finding에 반복하지 마세요). 이어서 각 탐지 구간의 스냅샷 이미지를 보여드릴 테니, 점수만 보고 판단하지 말고 이미지 속 사람의 행동/자세/주변 상황을 직접 관찰해서 finding과 evidenceSummary에 반영해 주세요.\n${JSON.stringify(payload, null, 2)}`,
    },
  ];
  for (const thumb of eventThumbnails) {
    if (!thumb) continue;
    userContent.push({ type: "input_text", text: `[${thumb.label} 스냅샷]` });
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
          content: `너는 한국어 CCTV/이상행동 분석 보고서를 작성하는 보조자다. 무인매장 점주가 보험사 등 서류 제출용으로 사용할 사실 중심 문서 초안을 작성한다.
- 경찰, 신고, 수사 등 경찰 관련 표현은 절대 사용하지 않는다 (title 포함).
- 함께 제공되는 탐지 구간 스냅샷 이미지를 직접 관찰해서 사람의 행동/자세/주변 물건 등 시각적 근거를 반영하고, 이미지만으로 단정할 수 없는 부분은 한계로 명시한다.
- 탐지 결과를 범죄 확정처럼 단정하지 말고, AI 탐지 후보와 확인 필요 사항을 분리한다.
- evidenceSummary는 반드시 개조식(불릿) 배열로 작성하고, 각 항목의 핵심 행동 서술 부분은 **굵게** 표시해서 나이대가 있는 점주도 빠르게 훑어볼 수 있게 한다.
- suspicionType은 "결제 부재", "은닉 제스처", "입·출고 불일치", "기타" 중 가장 가까운 하나만 고른다.
- timeRange, anomalyScore 같은 수치/시간 정보는 절대 생성하지 않는다 (시스템이 별도로 채운다). finding에는 시간이나 점수를 다시 적지 않는다.
- 물결표(~)는 사용하지 않는다.`,
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
            required: [
              "title",
              "storeName",
              "storeAddress",
              "incidentDateTime",
              "cameraLocation",
              "suspicionType",
              "incidentSummary",
              "evidenceSummary",
              "timeline",
              "suggestedAttachments",
              "limitations",
              "submissionStatementDraft",
              "nextActions",
            ],
            properties: {
              title: { type: "string" },
              storeName: { type: "string" },
              storeAddress: { type: "string" },
              incidentDateTime: { type: "string" },
              cameraLocation: { type: "string" },
              suspicionType: { type: "string", enum: [...SUSPICION_TYPES] },
              incidentSummary: { type: "string" },
              evidenceSummary: { type: "array", items: { type: "string" } },
              timeline: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["finding"],
                  properties: {
                    finding: { type: "string" },
                  },
                },
              },
              suggestedAttachments: { type: "array", items: { type: "string" } },
              limitations: { type: "array", items: { type: "string" } },
              submissionStatementDraft: { type: "string" },
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
  const timeline = buildTimeline(events, reportJson.timeline);
  return {
    reportJson,
    markdown: reportJsonToMarkdown(reportJson, timeline),
  };
}

export async function createTextReport(formData: FormData) {
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

  if (!PLAN_INFO[getUserPlan(user)].canGenerateReports) {
    redirect(`/dashboard/videos/${videoId}?error=${encodeURIComponent("보고서 생성은 Premium 플랜에서만 가능합니다.")}`);
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

  const store = getStoreMetadata(user);
  const reportDate = new Date().toISOString().slice(0, 10);
  const title = `${store.businessName} CCTV 이상행동 분석 보고서`;
  const { data: reportResult, error } = await (supabase.from("ai_reports") as any)
    .insert({
      video_id: video.id,
      user_id: user.id,
      report_date: reportDate,
      title,
      status: "generating",
      report_type: "text",
      report_json: {},
      report_markdown: null,
      ai_model: REPORT_MODEL,
      error_message: null,
      updated_at: new Date().toISOString(),
      generated_at: null,
    })
    .select("*")
    .single();
  const report = reportResult as AiReportRow | null;

  if (error || !report) {
    redirect(`/dashboard/videos/${videoId}?error=${encodeURIComponent(error?.message ?? "보고서 생성 요청 실패")}`);
  }

  try {
    const generated = await generateReportWithOpenAI(supabase, video, events ?? [], store);
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

export async function createPhotoReport(formData: FormData) {
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

  if (!PLAN_INFO[getUserPlan(user)].canGenerateReports) {
    redirect(`/dashboard/videos/${videoId}?error=${encodeURIComponent("보고서 생성은 Premium 플랜에서만 가능합니다.")}`);
  }

  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .single<VideoRow>();

  if (!video || video.status !== "done") {
    redirect(`/dashboard/videos/${videoId}`);
  }

  const { count } = await supabase
    .from("anomaly_events")
    .select("id", { count: "exact", head: true })
    .eq("video_id", videoId);

  const store = getStoreMetadata(user);
  const reportDate = new Date().toISOString().slice(0, 10);
  const title = `${store.businessName} 사진 근거 자료 보고서`;

  const { data: reportResult, error } = await (supabase.from("ai_reports") as any)
    .insert({
      video_id: video.id,
      user_id: user.id,
      report_date: reportDate,
      title,
      status: "done",
      report_type: "photo",
      report_json: { eventCount: count ?? 0 },
      report_markdown: null,
      ai_model: null,
      error_message: null,
      updated_at: new Date().toISOString(),
      generated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  const report = reportResult as AiReportRow | null;

  if (error || !report) {
    redirect(`/dashboard/videos/${videoId}?error=${encodeURIComponent(error?.message ?? "보고서 생성 요청 실패")}`);
  }

  revalidatePath("/dashboard/reports");
  redirect(`/dashboard/reports/${report!.id}`);
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
