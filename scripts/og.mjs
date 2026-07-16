// Renders app/opengraph-image.png — the card KakaoTalk/Slack/X show when the link is shared.
//
// Rendered in a real browser rather than drawn with an image library so it uses the same
// Pretendard, the same tokens and the same mark as the app: a share card that doesn't look like
// the thing it links to is just a second brand to maintain. Re-run after changing the logo or
// palette: `node scripts/og.mjs`
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";

const mark = readFileSync("public/cinecom-mark.png").toString("base64");

// The mark alone, on the app's own background.
//
// No Korean in the image. Every card renders og:title and og:description as text right beneath it,
// so "상영실 예약" here made it the third printing of the same phrase (image + og:title +
// og:site_name). It also forced a type pairing that doesn't exist: the wordmark is a typewriter
// face and the app is set in Pretendard, a geometric sans — a century apart, and it showed. A
// Korean serif (Nanum Myeongjo pairs the best of the four I rendered) would have made the
// repetition prettier rather than absent, at the cost of a third family for one image.
//
// The image is never displayed without the title, so it doesn't have to carry the words. It
// carries the identity; the title carries the meaning.
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex;
    align-items: center; justify-content: center;
    background: #f0eee9;
  }
  img { width: 640px; display: block; }
</style></head>
<body><img src="data:image/png;base64,${mark}" alt=""></body></html>`;

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
