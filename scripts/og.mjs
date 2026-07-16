// Renders app/opengraph-image.png — the card KakaoTalk/Slack/X show when the link is shared.
//
// Rendered in a real browser rather than drawn with an image library so it uses the same
// Pretendard, the same tokens and the same mark as the app: a share card that doesn't look like
// the thing it links to is just a second brand to maintain. Re-run after changing the logo or
// palette: `node scripts/og.mjs`
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";

const mark = readFileSync("public/cinecom-mark.png").toString("base64");

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 34px;
    background: #f0eee9;
    font-family: "Pretendard Variable", Pretendard, sans-serif;
    /* The yellow only as a hairline of brand at the foot — a full yellow field would shout in a
       chat feed and look nothing like the app it opens. */
    border-bottom: 14px solid #eef700;
  }
  img { width: 460px; display: block; }
  h1 { font-size: 96px; font-weight: 700; letter-spacing: -0.03em; color: #1a1a1a; line-height: 1; }
  p  { font-size: 34px; font-weight: 500; color: rgba(0,0,0,.62); letter-spacing: -0.01em; }
</style></head>
<body>
  <img src="data:image/png;base64,${mark}" alt="">
  <h1>상영실 예약</h1>
  <p>대상영실 · 소상영실 예약 현황을 한눈에</p>
</body></html>`;

const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const p = await b.newPage();
// deviceScaleFactor 1: og:image wants exactly 1200x630. Retina-doubling it just makes a 2.4MP
// file that every scraper downscales anyway.
await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await p.setContent(html, { waitUntil: "networkidle0" });
await p.evaluate(() => document.fonts.ready); // never screenshot mid-font-swap
await p.screenshot({ path: "app/opengraph-image.png" });
await b.close();
console.log("wrote app/opengraph-image.png");
