import Image from "next/image";
import Link from "next/link";
import { signUp } from "@/app/login/actions";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
}) {
  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Image src="/logo.png" alt="Scene Stealer" width={36} height={36} />
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: "#3654e0", margin: 0 }}>
          Scene Stealer 회원가입
        </h1>
      </div>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
        사장님 정보와 아이디를 등록하면 바로 영상 분석 서비스를 사용할 수 있습니다.
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
            autoComplete="new-password"
            style={{ marginTop: 6 }}
          />
        </label>

        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            marginTop: 4,
            paddingTop: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <p style={{ color: "#0f172a", fontSize: 14, fontWeight: 700, margin: 0 }}>
            사장님 정보
          </p>
          <label style={{ fontSize: 13, color: "#64748b" }}>
            사장님 이름
            <input
              type="text"
              name="ownerName"
              required
              autoComplete="name"
              style={{ marginTop: 6 }}
            />
          </label>
          <label style={{ fontSize: 13, color: "#64748b" }}>
            나이
            <input type="number" name="ownerAge" required min={1} max={120} style={{ marginTop: 6 }} />
          </label>
          <label style={{ fontSize: 13, color: "#64748b" }}>
            매장 수
            <input type="number" name="storeCount" required min={1} max={999} style={{ marginTop: 6 }} />
          </label>
          <label style={{ fontSize: 13, color: "#64748b" }}>
            어떤 매장(사업자 이름)
            <input
              type="text"
              name="businessName"
              required
              placeholder="예: 홍길동 분식 강남점"
              style={{ marginTop: 6 }}
            />
          </label>
        </div>

        {searchParams.error && (
          <p style={{ color: "#dc2626", fontSize: 13 }}>{searchParams.error}</p>
        )}
        {searchParams.notice && (
          <p style={{ color: "#15803d", fontSize: 13 }}>{searchParams.notice}</p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn" formAction={signUp} style={{ flex: 1 }}>
            가입하기
          </button>
          <Link
            className="btn btn-secondary"
            href="/login"
            style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
          >
            로그인으로
          </Link>
        </div>
      </form>
    </div>
  );
}
