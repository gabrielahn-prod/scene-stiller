import { signIn, signUp } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
}) {
  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>nonMarket 이상행동 탐지 데모</h1>
      <p style={{ color: "#9aa4bf", fontSize: 14, marginBottom: 24 }}>
        로그인 후 본인이 업로드한 영상의 이상행동 탐지 보고서를 확인할 수 있습니다.
      </p>

      <form className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, color: "#9aa4bf" }}>
          이메일
          <input type="email" name="email" required style={{ marginTop: 6 }} />
        </label>
        <label style={{ fontSize: 13, color: "#9aa4bf" }}>
          비밀번호
          <input type="password" name="password" required minLength={6} style={{ marginTop: 6 }} />
        </label>

        {searchParams.error && (
          <p style={{ color: "#ff6b6b", fontSize: 13 }}>{searchParams.error}</p>
        )}
        {searchParams.notice && (
          <p style={{ color: "#3ddc84", fontSize: 13 }}>{searchParams.notice}</p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn" formAction={signIn} style={{ flex: 1 }}>
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
