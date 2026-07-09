import Link from "next/link";
import { signIn } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
}) {
  return (
    <div className="container" style={{ maxWidth: 460 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Scene Stealer 이상행동 탐지 데모</h1>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
        아이디와 비밀번호로 로그인해 업로드한 영상의 이상행동 탐지 보고서를 확인할 수 있습니다.
      </p>

      <form className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, color: "#64748b" }}>
          아이디
          <input
            type="text"
            name="identifier"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-z0-9._-]+"
            autoComplete="username"
            placeholder="예: scenestealer01"
            style={{ marginTop: 6 }}
          />
        </label>
        <label style={{ fontSize: 13, color: "#64748b" }}>
          비밀번호
          <input
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="current-password"
            style={{ marginTop: 6 }}
          />
        </label>

        {searchParams.error && (
          <p style={{ color: "#dc2626", fontSize: 13 }}>{searchParams.error}</p>
        )}
        {searchParams.notice && (
          <p style={{ color: "#15803d", fontSize: 13 }}>{searchParams.notice}</p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn" formAction={signIn} style={{ flex: 1 }}>
            로그인
          </button>
          <Link
            className="btn btn-secondary"
            href="/signup"
            style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
          >
            회원가입
          </Link>
        </div>
      </form>
    </div>
  );
}
