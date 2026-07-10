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
