import { signIn, signUp } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
}) {
  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>nonMarket 이상행동 탐지 데모</h1>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
        아이디와 비밀번호로 가입하고 본인이 업로드한 영상의 이상행동 탐지 보고서를 확인할 수 있습니다.
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
            placeholder="예: nonmarket01"
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
            회원가입 정보
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
          <button className="btn" formAction={signIn} formNoValidate style={{ flex: 1 }}>
            로그인
          </button>
          <button className="btn btn-secondary" formAction={signUp} style={{ flex: 1 }}>
            회원가입
          </button>
        </div>
      </form>
    </div>
  );
}
