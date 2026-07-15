// Dev-only: measure layout overflow + capture screenshots at phone widths.
// Usage: node scripts/measure.mjs [url]
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3000";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
try {
  for (const width of [390, 440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: "networkidle0" });

    const report = await page.evaluate((vw) => {
      const doc = document.documentElement;
      const offenders = [];
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width > vw + 1 || r.right > vw + 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 30),
            text: (el.textContent || "").trim().slice(0, 18),
            w: Math.round(r.width),
            left: Math.round(r.left),
            right: Math.round(r.right),
          });
        }
      }
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        overflowing: doc.scrollWidth > doc.clientWidth,
        offenders: offenders.slice(0, 8),
      };
    }, width);

    console.log(`\n=== ${width}px ===`);
    console.log(`doc scrollWidth ${report.scrollWidth} vs clientWidth ${report.clientWidth} → overflow: ${report.overflowing}`);
    for (const o of report.offenders) {
      console.log(`  <${o.tag}> w=${o.w} left=${o.left} right=${o.right} "${o.text}"`);
    }
    await page.screenshot({ path: `/tmp/board-${width}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
