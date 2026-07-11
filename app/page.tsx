import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLAN_OPTIONS } from "@/lib/plan";

const FEATURES = [
  {
    title: "업로드만 하면 자동 분석",
    desc: "매장 CCTV 영상을 올리면 포즈 추출부터 이상행동 구간 탐지까지 사람 손 없이 자동으로 처리됩니다.",
  },
  {
    title: "내 영상만 안전하게",
    desc: "로그인한 사장님은 본인이 올린 영상과 보고서만 조회할 수 있도록 계정별로 완전히 격리됩니다.",
  },
  {
    title: "제출용 보고서까지 생성",
    desc: "Premium 플랜은 탐지된 이상행동을 경찰·보험사에 바로 제출할 수 있는 보고서로 정리해줍니다.",
  },
];

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard/videos");
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Image src="/logo.png" alt="Scene Stealer" width={28} height={28} />
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", color: "#3654e0" }}>
            Scene Stealer
          </span>
        </div>
        <Link
          className="btn btn-secondary"
          href="/login"
          style={{ textDecoration: "none" }}
        >
          로그인
        </Link>
      </header>

      <div className="container">
        <section style={{ textAlign: "center", padding: "48px 0 40px" }}>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              margin: "0 0 16px",
              lineHeight: 1.3,
            }}
          >
            매장 CCTV 영상 하나로,
            <br />
            이상행동을 자동으로 잡아냅니다
          </h1>
          <p style={{ fontSize: 16, color: "#64748b", maxWidth: 520, margin: "0 auto 28px" }}>
            영상을 업로드하면 AI가 포즈를 분석해 이상행동 클립을 자동으로 찾아드려요.
            사장님은 결과만 확인하시면 됩니다.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Link className="btn" href="/signup" style={{ textDecoration: "none", padding: "12px 24px", fontSize: 15 }}>
              무료로 시작하기
            </Link>
            <Link
              className="btn btn-secondary"
              href="/login"
              style={{ textDecoration: "none", padding: "12px 24px", fontSize: 15 }}
            >
              로그인
            </Link>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 40,
          }}
        >
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, textAlign: "center", margin: "0 0 16px" }}>요금제</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              maxWidth: 520,
              margin: "0 auto",
            }}
          >
            {PLAN_OPTIONS.map((plan) => (
              <div key={plan.value} className="card">
                <div style={{ fontWeight: 700, fontSize: 15 }}>{plan.label}</div>
                <div style={{ color: "#64748b", fontSize: 12, margin: "4px 0 10px" }}>{plan.price}</div>
                <ul style={{ margin: 0, paddingLeft: 16, color: "#475569", fontSize: 12, lineHeight: 1.6 }}>
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
