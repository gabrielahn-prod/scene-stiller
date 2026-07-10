export type VideoStatus = "uploaded" | "processing" | "done" | "failed";

export interface VideoRow {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  status: VideoStatus;
  progress: number;
  error_message: string | null;
  duration_sec: number | null;
  fps: number | null;
  frame_width: number | null;
  frame_height: number | null;
  created_at: string;
  processed_at: string | null;
}

export interface AnomalyEventRow {
  id: string;
  video_id: string;
  user_id: string;
  track_id: number;
  start_frame: number;
  end_frame: number;
  start_time_sec: number;
  end_time_sec: number;
  anomaly_score: number;
  threshold: number;
  clip_storage_path: string | null;
  thumbnail_storage_path: string | null;
  created_at: string;
}

export interface OwnerProfileRow {
  user_id: string;
  login_id: string;
  owner_name: string;
  owner_age: number;
  store_count: number;
  business_name: string;
  plan: "pro" | "premium";
}

export type AiReportStatus = "queued" | "generating" | "done" | "failed";

export interface AiReportRow {
  id: string;
  video_id: string;
  user_id: string;
  report_date: string;
  title: string;
  status: AiReportStatus;
  report_json: Record<string, unknown>;
  report_markdown: string | null;
  ai_model: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  generated_at: string | null;
}
