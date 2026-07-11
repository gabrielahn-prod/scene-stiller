import type { User } from "@supabase/supabase-js";

export type PlanTier = "pro" | "premium";

export const PLAN_INFO: Record<
  PlanTier,
  { label: string; retentionDays: number; canGenerateReports: boolean }
> = {
  pro: { label: "Pro", retentionDays: 7, canGenerateReports: false },
  premium: { label: "Premium", retentionDays: 30, canGenerateReports: true },
};

export function getUserPlan(user: Pick<User, "user_metadata"> | null | undefined): PlanTier {
  return user?.user_metadata?.plan === "premium" ? "premium" : "pro";
}

export const PLAN_OPTIONS = [
  {
    value: "pro",
    label: "Pro",
    price: "월 1만 원 중반",
    features: ["영상 분석 (이상행동 탐지)", "클라우드 7일 보관"],
  },
  {
    value: "premium",
    label: "Premium",
    price: "월 3만 원 이상",
    features: ["영상 분석 (이상행동 탐지)", "AI 보고서 생성 (경찰/보험사 제출용)", "클라우드 30일 보관"],
  },
] as const;
