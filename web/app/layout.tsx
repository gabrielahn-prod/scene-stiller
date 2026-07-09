import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "nonMarket · 이상행동 탐지 데모",
  description: "영상 업로드 → 포즈 추출 → 이상행동 클립 → 유저별 보고서",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
