// 발표용 데모 계정 시드 스크립트: pro/premium 요금제 차이를 보여주기 위한 더미 데이터를 생성한다.
// 실행: node scripts/seed-demo-accounts.js
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const EMAIL_DOMAIN = "scene-stealer.app";
const DEMO_PASSWORD = "demo1234";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function daysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function riskLevel(score, threshold) {
  const ratio = threshold > 0 ? score / threshold : score;
  if (ratio >= 1.5) return "심각";
  if (ratio >= 1.2) return "경고";
  return "주의";
}

async function upsertUser({ identifier, plan, ownerName, ownerAge, storeCount, businessName, businessAddress }) {
  const email = `${identifier}@${EMAIL_DOMAIN}`;

  const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = existingList?.users.find((u) => u.email === email);

  const metadata = {
    login_id: identifier,
    owner_name: ownerName,
    owner_age: ownerAge,
    store_count: storeCount,
    business_name: businessName,
    business_address: businessAddress,
    plan,
  };

  let userId;
  if (existing) {
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD, user_metadata: metadata });
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    userId = created.user.id;
  }

  await admin.from("owner_profiles").upsert({
    user_id: userId,
    login_id: identifier,
    owner_name: ownerName,
    owner_age: ownerAge,
    store_count: storeCount,
    business_name: businessName,
    business_address: businessAddress,
    plan,
  });

  return userId;
}

async function clearExistingData(userId) {
  const { data: videos } = await admin.from("videos").select("id").eq("user_id", userId);
  const videoIds = (videos ?? []).map((v) => v.id);
  if (videoIds.length > 0) {
    await admin.from("anomaly_events").delete().in("video_id", videoIds);
    await admin.from("ai_reports").delete().in("video_id", videoIds);
    await admin.from("videos").delete().in("id", videoIds);
  }
}

async function seedVideo(userId, video) {
  const { data: inserted, error } = await admin
    .from("videos")
    .insert({
      user_id: userId,
      filename: video.filename,
      storage_path: `${userId}/demo/${video.filename}`,
      status: "done",
      progress: 100,
      duration_sec: video.durationSec,
      fps: 29.97,
      frame_width: 1920,
      frame_height: 1080,
      camera_location: video.cameraLocation ?? null,
      created_at: video.createdAt,
      processed_at: video.createdAt,
    })
    .select("id")
    .single();
  if (error) throw error;

  const videoId = inserted.id;

  if (video.events.length > 0) {
    const { error: eventsError } = await admin.from("anomaly_events").insert(
      video.events.map((ev) => ({
        video_id: videoId,
        user_id: userId,
        track_id: ev.trackId,
        start_frame: Math.round(ev.startSec * 29.97),
        end_frame: Math.round(ev.endSec * 29.97),
        start_time_sec: ev.startSec,
        end_time_sec: ev.endSec,
        anomaly_score: ev.score,
        threshold: ev.threshold,
        clip_storage_path: null,
        thumbnail_storage_path: null,
        created_at: video.createdAt,
      }))
    );
    if (eventsError) throw eventsError;
  }

  return videoId;
}

async function seedTextReport(userId, video, videoId, opts) {
  const timelineText = video.events
    .map(
      (ev) =>
        `- ${formatSeconds(ev.startSec)}-${formatSeconds(ev.endSec)} · person #${ev.trackId} · 위험도 **${riskLevel(
          ev.score,
          ev.threshold
        )}** (점수 ${ev.score.toFixed(3)} / 임계값 ${ev.threshold.toFixed(3)}): ${ev.finding}`
    )
    .join("\n");

  const markdown = `# ${opts.title}

## 사건 정보
- 매장명: ${opts.storeName}
- 매장 주소: ${opts.storeAddress}
- 발생 추정 일시: ${video.createdAt.slice(0, 10)} (영상 업로드일 기준)
- 카메라 위치: ${video.cameraLocation ?? "미등록"}
- 의심 구간 유형: ${opts.suspicionType}

## 사건 개요
${opts.incidentSummary}

## 영상 분석 및 증거 요약
${opts.evidenceSummary.map((line) => `- ${line}`).join("\n")}

## 주요 탐지 구간
${timelineText || "- 탐지된 이상행동 후보 구간이 없습니다."}

위험도 라벨은 탐지 임계값 대비 이상 점수 비율로 산정됩니다. 점수가 임계값의 1.2배 이상이면 도난이 어느 정도 의심되고, 1.5배 이상이면 도난이 유력한 것으로 판단됩니다. 최종 판단은 반드시 원본 영상 확인 후 진행해 주세요.

## 첨부 권장 자료
- 원본 영상 파일
- 이상행동 탐지 클립
- 썸네일 이미지
- 본 보고서

## 서류 제출용 진술 초안
${opts.submissionStatementDraft}

## 한계 및 유의사항
- 본 문서는 AI 기반 영상 분석 결과를 바탕으로 한 제출용 초안입니다.
- 범죄 사실, 고의성, 손해액은 담당 기관 또는 보험사의 추가 확인이 필요합니다.

## 다음 조치
- 원본 영상을 보존합니다.
- 탐지 클립을 제출 자료에 첨부합니다.
- 피해 물품/손해 내역이 있으면 별도 목록으로 정리합니다.
`;

  const date = video.createdAt.slice(0, 10);
  const { error } = await admin.from("ai_reports").insert({
    video_id: videoId,
    user_id: userId,
    report_date: date,
    title: opts.title,
    status: "done",
    report_type: "text",
    report_json: { suspicionType: opts.suspicionType },
    report_markdown: markdown,
    ai_model: "gpt-5.4-mini",
    generated_at: date + "T11:00:00.000Z",
    updated_at: date + "T11:00:00.000Z",
  });
  if (error) throw error;
}

async function seedPhotoReport(userId, video, videoId, title) {
  const date = video.createdAt.slice(0, 10);
  const { error } = await admin.from("ai_reports").insert({
    video_id: videoId,
    user_id: userId,
    report_date: date,
    title,
    status: "done",
    report_type: "photo",
    report_json: { eventCount: video.events.length },
    report_markdown: null,
    ai_model: null,
    generated_at: date + "T11:05:00.000Z",
    updated_at: date + "T11:05:00.000Z",
  });
  if (error) throw error;
}

async function main() {
  console.log("Pro 데모 계정 생성 중...");
  const proUserId = await upsertUser({
    identifier: "demo_pro",
    plan: "pro",
    ownerName: "김프로",
    ownerAge: 41,
    storeCount: 1,
    businessName: "프로떡볶이 홍대점",
    businessAddress: "서울시 마포구 와우산로 100",
  });
  await clearExistingData(proUserId);

  const proVideos = [
    {
      filename: "매장_CCTV_0708.mp4",
      durationSec: 132.6,
      createdAt: daysAgo(2),
      cameraLocation: "카운터 상단",
      events: [
        { trackId: 1, startSec: 12, endSec: 26, score: 0.71, threshold: 0.6 },
        { trackId: 2, startSec: 58, endSec: 70, score: 0.66, threshold: 0.6 },
      ],
    },
    {
      filename: "심야_대기_0705.mp4",
      durationSec: 96.1,
      createdAt: daysAgo(5),
      cameraLocation: "출입구",
      events: [{ trackId: 1, startSec: 5, endSec: 20, score: 0.78, threshold: 0.6 }],
    },
  ];
  for (const v of proVideos) {
    await seedVideo(proUserId, v);
  }
  console.log(
    `Pro 계정 완료 (아이디: demo_pro / 비밀번호: ${DEMO_PASSWORD}) - 영상 ${proVideos.length}개, 보고서 0개 (Pro는 보고서 미제공)`
  );

  console.log("Premium 데모 계정 생성 중...");
  const premiumUserId = await upsertUser({
    identifier: "demo_premium",
    plan: "premium",
    ownerName: "박프리미엄",
    ownerAge: 47,
    storeCount: 3,
    businessName: "프리미엄마트 강남점",
    businessAddress: "서울시 강남구 테헤란로 231",
  });
  await clearExistingData(premiumUserId);

  const v1 = {
    filename: "강남점_CCTV_0710.mp4",
    durationSec: 118.4,
    createdAt: daysAgo(1),
    cameraLocation: "진열대 3열",
    events: [
      {
        trackId: 1,
        startSec: 42,
        endSec: 58,
        score: 0.812,
        threshold: 0.6,
        finding: "**진열대 앞에서 상품을 반복적으로 만지다 사각지대로 이동하는 행동**이 확인되었습니다.",
      },
      {
        trackId: 2,
        startSec: 80,
        endSec: 95,
        score: 0.734,
        threshold: 0.6,
        finding: "**계산대 근처에서 결제 없이 비정상적으로 긴 체류**가 확인되었습니다.",
      },
    ],
  };
  const v2 = {
    filename: "야간_창고_0703.mp4",
    durationSec: 210.9,
    createdAt: daysAgo(7),
    cameraLocation: "창고 입구",
    events: [
      {
        trackId: 1,
        startSec: 15,
        endSec: 33,
        score: 0.69,
        threshold: 0.6,
        finding: "**창고 출입 기록 없이 물품을 옮기는 동작**이 포착되었습니다.",
      },
    ],
  };
  const v3 = {
    filename: "주말_매장_0628.mp4",
    durationSec: 145.2,
    createdAt: daysAgo(12),
    cameraLocation: "출입구",
    events: [],
  };

  const v1Id = await seedVideo(premiumUserId, v1);
  const v2Id = await seedVideo(premiumUserId, v2);
  const v3Id = await seedVideo(premiumUserId, v3);

  const store = { storeName: "프리미엄마트 강남점", storeAddress: "서울시 강남구 테헤란로 231" };

  await seedTextReport(premiumUserId, v1, v1Id, {
    ...store,
    title: "프리미엄마트 강남점 CCTV 이상행동 분석 보고서",
    suspicionType: "결제 부재",
    incidentSummary: `업로드 영상 ${v1.filename}에 대한 이상행동 탐지 결과, ${v1.events.length}개의 이상행동 후보 구간이 확인되었습니다.`,
    evidenceSummary: [
      "**진열대 앞에서 상품을 반복적으로 만지다 사각지대로 이동하는 행동**이 감지되었습니다.",
      "**계산대 근처에서 결제 없이 비정상적으로 긴 체류**가 감지되었습니다.",
      `영상 길이 ${v1.durationSec}초, 해상도 1920x1080, FPS 29.97 기준으로 분석되었습니다.`,
    ],
    submissionStatementDraft: `프리미엄마트 강남점에서 ${v1.filename} 영상 분석 중 확인된 이상행동 의심 구간에 대해 사실 확인 및 필요한 조치를 요청하며, 관련 증빙 자료를 제출합니다.`,
  });
  await seedPhotoReport(premiumUserId, v1, v1Id, "프리미엄마트 강남점 사진 근거 자료 보고서");

  await seedTextReport(premiumUserId, v2, v2Id, {
    ...store,
    title: "프리미엄마트 강남점 CCTV 이상행동 분석 보고서",
    suspicionType: "입·출고 불일치",
    incidentSummary: `업로드 영상 ${v2.filename}에 대한 이상행동 탐지 결과, ${v2.events.length}개의 이상행동 후보 구간이 확인되었습니다.`,
    evidenceSummary: [
      "**창고 출입 기록 없이 물품을 옮기는 동작**이 포착되었습니다.",
      `영상 길이 ${v2.durationSec}초, 해상도 1920x1080, FPS 29.97 기준으로 분석되었습니다.`,
    ],
    submissionStatementDraft: `프리미엄마트 강남점에서 ${v2.filename} 영상 분석 중 확인된 이상행동 의심 구간에 대해 사실 확인 및 필요한 조치를 요청하며, 관련 증빙 자료를 제출합니다.`,
  });

  console.log(
    `Premium 계정 완료 (아이디: demo_premium / 비밀번호: ${DEMO_PASSWORD}) - 영상 3개, 텍스트 보고서 2개, 사진 근거 보고서 1개`
  );

  console.log("\n시드 완료.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
