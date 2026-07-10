import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { getUserPlan, PLAN_INFO } from "@/lib/plan";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loginId =
    typeof user?.user_metadata?.login_id === "string"
      ? user.user_metadata.login_id
      : user?.email?.split("@")[0];
  const ownerName =
    typeof user?.user_metadata?.owner_name === "string" ? user.user_metadata.owner_name : null;
  const plan = getUserPlan(user);
  const planInfo = PLAN_INFO[plan];

  return (
    <div>
      <header
        style={{
          borderBottom: "1px solid #e2e8f0",
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 24px",
          flexWrap: "wrap",
        }}
      >
        <nav style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/dashboard/videos"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 800,
              fontSize: 17,
              letterSpacing: "-0.02em",
              color: "#3654e0",
              textDecoration: "none",
            }}
          >
            <Image src="/logo.png" alt="Scene Stealer" width={28} height={28} />
            Scene Stealer
          </Link>
          <Link href="/dashboard/upload" style={{ fontSize: 15, fontWeight: 500, color: "#334155" }}>
            업로드
          </Link>
          <Link href="/dashboard/videos" style={{ fontSize: 15, fontWeight: 500, color: "#334155" }}>
            내영상
          </Link>
          <Link href="/dashboard/reports" style={{ fontSize: 15, fontWeight: 500, color: "#334155" }}>
            내보고서
          </Link>
        </nav>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span
            className="status-badge"
            style={{
              background: plan === "premium" ? "#dbeafe" : "#e2e8f0",
              color: plan === "premium" ? "#1d4ed8" : "#475569",
            }}
            title={`영상 ${planInfo.retentionDays}일간 클라우드 보관`}
          >
            {planInfo.label}
          </span>
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {ownerName ? `${ownerName} 사장님` : loginId}
          </span>
          <form action={signOut}>
            <button className="btn btn-secondary" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <main className="container">{children}</main>
    </div>
  );
}
