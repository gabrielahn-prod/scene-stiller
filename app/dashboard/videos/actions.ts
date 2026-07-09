"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AnomalyEventRow, VideoRow } from "@/lib/types";

export async function deleteVideo(formData: FormData) {
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

  if (!video || video.user_id !== user.id) {
    redirect("/dashboard/videos");
  }

  const admin = createAdminClient();
  const { data: events } = await admin
    .from("anomaly_events")
    .select("*")
    .eq("video_id", video.id)
    .returns<AnomalyEventRow[]>();

  const videoPaths = video.storage_path ? [video.storage_path] : [];
  const clipPaths = (events ?? []).flatMap((event) =>
    [event.clip_storage_path, event.thumbnail_storage_path].filter(Boolean) as string[]
  );

  if (videoPaths.length > 0) {
    await admin.storage.from("videos").remove(videoPaths);
  }

  if (clipPaths.length > 0) {
    await admin.storage.from("clips").remove(clipPaths);
  }

  await admin.from("videos").delete().eq("id", video.id).eq("user_id", user.id);

  revalidatePath("/dashboard/videos");
  revalidatePath("/dashboard/reports");
  redirect("/dashboard/videos");
}
