import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const TITLE = "씨네꼼 상영실 예약";
// Search engines (Google): keyword-rich, authoritative snippet description.
const SEARCH_DESC = "서울대 영화공동체 씨네꼼 상영실 예약 현황 조회 · 예약글 작성";
// Share cards (KakaoTalk, Slack): punchy text without repeating '씨네꼼' directly below the title.
const CARD_DESC = "대상영실·소상영실 예약 현황을 한눈에";

export const metadata: Metadata = {
  // metadataBase is what turns app/opengraph-image.png into the absolute URL scrapers require —
  // without it Next emits a relative path and KakaoTalk, Slack and X all show the link bare.
  metadataBase: new URL("https://cinecom.club"),
  title: TITLE,
  description: SEARCH_DESC,
  // The link gets shared into KakaoTalk far more than it gets typed. og:image is picked up
  // automatically from app/opengraph-image.png (regenerate with `node scripts/og.mjs`).
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "씨네꼼", // the club; TITLE is the page — identical values printed the same line twice
    title: TITLE,
    description: CARD_DESC,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: CARD_DESC },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: TITLE,
  url: "https://cinecom.club",
  description: SEARCH_DESC,
  applicationCategory: "UtilityApplication",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
