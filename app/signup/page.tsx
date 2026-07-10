import Image from "next/image";
import Link from "next/link";
import { signUp } from "@/app/login/actions";

const PLAN_OPTIONS = [
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
            요금제 선택
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {PLAN_OPTIONS.map((plan, i) => (
              <label
                key={plan.value}
                style={{
                  display: "block",
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  padding: 12,
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#0f172a",
                }}
              >
                <input
                  type="radio"
                  name="plan"
                  value={plan.value}
                  defaultChecked={i === 0}
                  required
                  style={{ marginRight: 6 }}
                />
                <span style={{ fontWeight: 700 }}>{plan.label}</span>
                <div style={{ color: "#64748b", fontSize: 12, margin: "4px 0 8px" }}>{plan.price}</div>
                <ul style={{ margin: 0, paddingLeft: 16, color: "#475569", fontSize: 12, lineHeight: 1.6 }}>
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </label>
            ))}
          </div>
        </div>

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
          <label style={{ fontSize: 13, color: "#64748b" }}>
            매장 주소 (선택)
            <input
              type="text"
              name="businessAddress"
              placeholder="예: 서울시 마포구 와우산로 94"
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
