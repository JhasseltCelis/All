// Usage: node render.cjs <html> <outdir> stills t1,t2,...  |  node render.cjs <html> <outdir> all <duration> <fps>
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const path = require("path");
(async () => {
  const [html, outDir, mode, a, b] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto("file://" + path.resolve(html), { waitUntil: "networkidle" });
  await page.evaluate(() => window.ready);
  const shoot = async (t, file) => {
    await page.evaluate(t => window.render(t), t);
    await page.screenshot({ path: path.join(outDir, file), type: "jpeg", quality: 95 });
  };
  if (mode === "stills") {
    for (const t of a.split(",").map(Number)) await shoot(t, `still-${t.toFixed(2)}.jpg`);
  } else {
    const dur = Number(a), fps = Number(b), n = Math.round(dur * fps);
    for (let i = 0; i < n; i++) await shoot(i / fps, `f${String(i).padStart(5, "0")}.jpg`);
  }
  await browser.close();
})();
