import type { Metadata } from "next";
import "./globals.css";

const TITLE = "씨네꼼 상영실 예약";
const DESC = "대상영실·소상영실 예약 현황을 한눈에 보고, 빈 시간에 바로 예약글을 작성하세요.";

export const metadata: Metadata = {
  // metadataBase is what turns app/opengraph-image.png into the absolute URL scrapers require —
  // without it Next emits a relative path and KakaoTalk, Slack and X all show the link bare.
  metadataBase: new URL("https://cinecom.chaepark.com"),
  title: TITLE,
  description: DESC,
  // The link gets shared into KakaoTalk far more than it gets typed. og:image is picked up
  // automatically from app/opengraph-image.png (regenerate with `node scripts/og.mjs`).
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: TITLE,
    title: TITLE,
    description: DESC,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
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
