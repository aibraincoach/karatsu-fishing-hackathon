import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

let repoRoot = path.dirname(fileURLToPath(import.meta.url));
if (!existsSync(path.join(repoRoot, "index.html"))) {
  repoRoot = "/home/opc/Projects/karatsu-fishing-hackathon";
}
const shotsDir = path.join(repoRoot, "screenshots");
mkdirSync(shotsDir, { recursive: true });

const PORT = 8766;
const server = spawn("python3", ["-m", "http.server", String(PORT)], {
  cwd: repoRoot,
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.click('#sample-btns button[data-id="1"]');
  await page.click("#create-btn");
  await page.waitForSelector("#fallback-label.show", { timeout: 5000 });
  await page.waitForSelector("#fields-wrap:not(.hidden)", { timeout: 5000 });
  await page.waitForSelector("#reports:not(.hidden)", { timeout: 5000 });

  const cards = {
    days: await page.textContent("#card-days"),
    people: await page.textContent("#card-people"),
    urchins: await page.textContent("#card-urchins"),
    bags: await page.textContent("#card-bags"),
  };
  const expected = { days: "7", people: "51", urchins: "4,470", bags: "28" };
  for (const [k, v] of Object.entries(expected)) {
    if (cards[k]?.trim() !== v) {
      console.error(`Card ${k}: expected ${v}, got ${cards[k]}`);
      process.exit(1);
    }
  }
  const seconds = await page.textContent("#seconds-line");
  if (!seconds.includes("測定前") && !seconds.includes("not measured")) {
    console.error("Seconds line missing pre-measurement text on fallback");
    process.exit(1);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: path.join(shotsDir, "sea-forest-report-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(shotsDir, "sea-forest-report-390px.png"),
    fullPage: true,
  });

  console.log("Browser check OK");
  console.log("screenshots:", shotsDir);
} finally {
  await browser.close();
  server.kill();
}
