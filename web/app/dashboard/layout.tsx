import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

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

  return (
    <div>
      <header
        style={{
          borderBottom: "1px solid #e2e8f0",
          background: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
        }}
      >
        <nav style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link href="/dashboard/videos" style={{ fontWeight: 700 }}>
            Scene Stealer
          </Link>
          <Link href="/dashboard/videos" style={{ fontSize: 14, color: "#64748b" }}>
            내 영상
          </Link>
          <Link href="/dashboard/upload" style={{ fontSize: 14, color: "#64748b" }}>
            업로드
          </Link>
        </nav>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
