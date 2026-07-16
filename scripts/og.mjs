// Renders app/opengraph-image.png — the card KakaoTalk/Slack/X show when the link is shared.
//
// Rendered in a real browser rather than drawn with an image library so it uses the same
// Pretendard, the same tokens and the same mark as the app: a share card that doesn't look like
// the thing it links to is just a second brand to maintain. Re-run after changing the logo or
// palette: `node scripts/og.mjs`
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";

const mark = readFileSync("public/cinecom-mark.png").toString("base64");

// The mark and three words, on the app's own background. No subtitle: every card renders
// og:description as text directly beneath the image, so a line inside it only says the same thing
// twice — at a size nobody reads in a chat thread. And no yellow bar: brand for its own sake,
// competing with the one thing the card has to carry.
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 30px;
    background: #f0eee9;
    font-family: "Pretendard Variable", Pretendard, sans-serif;
  }
  img { width: 460px; display: block; }
  h1 { font-size: 96px; font-weight: 700; letter-spacing: -0.03em; color: #1a1a1a; line-height: 1; }
</style></head>
<body>
  <img src="data:image/png;base64,${mark}" alt="">
  <h1>상영실 예약</h1>
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
