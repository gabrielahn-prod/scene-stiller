"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<"idle" | "uploading" | "creating" | "done" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function getSafeStorageFilename(input: File) {
    const extension = input.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
    return extension ? `source.${extension}` : "source";
  }

  async function handleUpload() {
    if (!file) return;
    setErrorMsg(null);
    setProgress("uploading");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErrorMsg("로그인이 필요합니다.");
      setProgress("error");
      return;
    }

    // 워커가 나중에 이 video row를 만들어야 storage_path 규칙(user_id/video_id/filename)을
    // 지킬 수 있으므로, video row를 먼저 만들고 그 id로 storage 경로를 정한다.
    setProgress("creating");
    const { data: videoRow, error: insertError } = await supabase
      .from("videos")
      .insert({ user_id: user.id, filename: file.name, storage_path: "", status: "uploaded" })
      .select()
      .single();

    if (insertError || !videoRow) {
      setErrorMsg(insertError?.message ?? "영상 레코드 생성 실패");
      setProgress("error");
      return;
    }

    const storagePath = `${user.id}/${videoRow.id}/${getSafeStorageFilename(file)}`;

    setProgress("uploading");
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(storagePath, file, { upsert: false });

    if (uploadError) {
      setErrorMsg(uploadError.message);
      setProgress("error");
      return;
    }

    const { error: updateError } = await supabase
      .from("videos")
      .update({ storage_path: storagePath })
      .eq("id", videoRow.id);

    if (updateError) {
      setErrorMsg(updateError.message);
      setProgress("error");
      return;
    }

    // 이 시점부터 worker/worker.py가 status='uploaded'인 이 row를 폴링으로 집어가서
    // 분석을 시작한다 (루트 README.md 참고).
    setProgress("done");
    router.push(`/dashboard/videos/${videoRow.id}`);
    router.refresh();
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button
        className="btn"
        disabled={!file || progress === "uploading" || progress === "creating"}
        onClick={handleUpload}
      >
        {progress === "uploading"
          ? "업로드 중..."
          : progress === "creating"
          ? "레코드 생성 중..."
          : "업로드 시작"}
      </button>
      {errorMsg && <p style={{ color: "#dc2626", fontSize: 13 }}>{errorMsg}</p>}
      <p style={{ color: "#64748b", fontSize: 13 }}>
        업로드가 끝나면 백엔드 워커가 자동으로 픽업해 포즈 추출 → 이상행동 탐지를 진행합니다.
        처리 상태는 영상 상세 페이지에서 확인할 수 있습니다.
      </p>
    </div>
  );
}
