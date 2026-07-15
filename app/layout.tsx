import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "씨네꼼 상영실 예약",
  description: "씨네꼼 대상영실·소상영실 예약 현황을 한눈에 보고 예약 글을 작성합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
