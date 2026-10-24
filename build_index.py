#!/usr/bin/env python3
"""Generate index.html with embedded sample_data.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
data = json.loads((ROOT / "sample_data.json").read_text(encoding="utf-8"))
bundle_json = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")

JS = r"""
const LIVE_SECONDS = null;

const BASELINE = {
  days: 6,
  people: 41,
  company: 18,
  hours: 98,
  urchins: 3850,
  bags: 24,
};

const BUNDLE = JSON.parse(document.getElementById("sample-bundle").textContent);
const SAMPLES = BUNDLE.samples.map((s) => ({
  id: s.id,
  label: s.label,
  memo: s.memo,
  expected: s.result,
}));

const SYSTEM_PROMPT = `You extract structured data from a fisher's voice memo about seaweed bed restoration (removing gangaze sea urchins, placing seed-seaweed bags) and write sponsor reports.
Return ONLY valid JSON (no markdown fences) with this shape:
{"date":string|null,"place":string|null,"people":{"coop":number|null,"company":number|null,"other":number|null},"hours":number|null,"urchins_removed":number|null,"seed_bags":number|null,"sea_changes":[string,...],"needs_check":[string,...],"report_ja":string,"report_en":string}
Rules:
- Never invent numbers not stated in the memo; use null and explain in needs_check.
- Mark estimates when words like 「くらい」「思う」「ごろ」 appear.
- Omit talk unrelated to the work (weather, lunch, etc.) from reports; note in needs_check if needed.
- Reports: 3–5 short, simple sentences each in report_ja (Japanese) and report_en (English).`;

const $ = (id) => document.getElementById(id);
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : n);

let selectedId = 1;
let usedFallback = false;

function initSamples() {
  const wrap = $("sample-btns");
  SAMPLES.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `見本${"①②③"[s.id - 1]}`;
    btn.title = s.label;
    btn.dataset.id = String(s.id);
    btn.addEventListener("click", () => selectSample(s.id));
    wrap.appendChild(btn);
  });
  selectSample(1);
}

function selectSample(id) {
  selectedId = id;
  const sample = SAMPLES.find((s) => s.id === id);
  $("memo").value = sample ? sample.memo : "";
  document.querySelectorAll("#sample-btns button").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.id) === id);
  });
  resetOutput();
}

function resetOutput() {
  $("fields-wrap").classList.add("hidden");
  $("fields-table").querySelector("tbody").innerHTML = "";
  $("reports").classList.add("hidden");
  $("report-ja").textContent = "";
  $("report-en").textContent = "";
  $("fallback-label").classList.remove("show");
  usedFallback = false;
  setCards(BASELINE);
  renderSeconds(null, false);
}

function setCards(totals) {
  $("card-days").textContent = fmt(totals.days);
  $("card-people").textContent = fmt(totals.people);
  $("card-company").textContent = `うち会社 / company: ${totals.company}`;
  $("card-urchins").textContent = fmt(totals.urchins);
  $("card-bags").textContent = fmt(totals.bags);
}

function notStated(v) {
  return v === null || v === undefined || v === "" ? "未確認 / not stated" : v;
}

function renderTable(data) {
  const p = data.people || {};
  const rows = [
    ["日付 / Date", notStated(data.date)],
    ["場所 / Place", notStated(data.place)],
    ["人数（漁協）/ Co-op", notStated(p.coop)],
    ["人数（会社）/ Company", notStated(p.company)],
    ["人数（その他）/ Other", notStated(p.other)],
    ["時間 / Hours", notStated(data.hours)],
    ["ガンガゼ / Urchins removed", notStated(data.urchins_removed)],
    ["母藻袋 / Seed bags", notStated(data.seed_bags)],
    [
      "海の変化 / Sea changes",
      (data.sea_changes && data.sea_changes.length)
        ? data.sea_changes.join("\n")
        : "未確認 / not stated",
    ],
    [
      "要確認 / Needs check",
      (data.needs_check && data.needs_check.length)
        ? data.needs_check.join("\n")
        : "未確認 / not stated",
    ],
  ];
  const tbody = $("fields-table").querySelector("tbody");
  tbody.innerHTML = rows
    .map(
      ([k, v]) =>
        `<tr><th>${k}</th><td>${String(v).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("");
  $("fields-wrap").classList.remove("hidden");
}

function applyTotalsFromResult(data) {
  const p = data.people || {};
  const peopleAdd =
    (p.coop ?? 0) + (p.company ?? 0) + (p.other ?? 0);
  setCards({
    days: BASELINE.days + 1,
    people: BASELINE.people + peopleAdd,
    company: BASELINE.company + (p.company ?? 0),
    urchins: BASELINE.urchins + (data.urchins_removed ?? 0),
    bags: BASELINE.bags + (data.seed_bags ?? 0),
  });
}

function renderReports(data) {
  $("report-ja").textContent = data.report_ja || "";
  $("report-en").textContent = data.report_en || "";
  $("reports").classList.remove("hidden");
}

function renderSeconds(elapsedSec, isLive) {
  let jaSec;
  let enSec;
  if (isLive && elapsedSec != null) {
    const s = (Math.round(elapsedSec * 10) / 10).toFixed(1);
    jaSec = `${s}秒`;
    enSec = `${s} sec`;
  } else if (LIVE_SECONDS != null) {
    jaSec = `${LIVE_SECONDS}秒`;
    enSec = `${LIVE_SECONDS} sec`;
  } else {
    jaSec = "＿＿秒（測定前）";
    enSec = "__ sec (not measured yet)";
  }
  $("seconds-line").innerHTML =
    `このアプリで：${jaSec} / With this app: ${enSec}<br>` +
    `<span style="font-size:.8rem;color:#666">` +
    `（今かかっている時間は、次に漁協で確かめます / We will check the current time with a co-op next）` +
    `</span>`;
}

function parseModelJson(text) {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(t);
}

async function callClaude(apiKey, memo) {
  const body = {
    model: "claude-sonnet-5-5",
    max_tokens: 3000,
    thinking: { type: "between_tools" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: memo }],
  };
  let res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 400) {
    const errText = await res.text();
    if (/thinking/i.test(errText)) {
      delete body.thinking;
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } else {
      throw new Error(errText);
    }
  }
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  if (json.stop_reason === "max_tokens") throw new Error("max_tokens");
  const textBlock = (json.content || []).find((b) => b.type === "text");
  if (!textBlock || !textBlock.text) throw new Error("no text");
  return parseModelJson(textBlock.text);
}

function useFallback(reason) {
  const sample = SAMPLES.find((s) => s.id === selectedId);
  $("fallback-label").classList.add("show");
  usedFallback = true;
  if (!sample || !sample.expected) {
    $("fields-wrap").classList.add("hidden");
    $("reports").classList.add("hidden");
    setCards(BASELINE);
    renderSeconds(null, false);
    return;
  }
  const data = sample.expected;
  renderTable(data);
  applyTotalsFromResult(data);
  renderReports(data);
  renderSeconds(null, false);
}

async function onCreate() {
  resetOutput();
  const memo = $("memo").value.trim();
  const apiKey = $("api-key").value.trim();
  $("create-btn").disabled = true;
  $("spinner").classList.add("show");
  const t0 = performance.now();

  try {
    if (!apiKey) throw new Error("empty key");
    const data = await callClaude(apiKey, memo);
    const elapsed = (performance.now() - t0) / 1000;
    renderTable(data);
    applyTotalsFromResult(data);
    renderReports(data);
    renderSeconds(elapsed, true);
  } catch {
    useFallback("error");
  } finally {
    $("spinner").classList.remove("show");
    $("create-btn").disabled = false;
  }
}

document.getElementById("create-btn").addEventListener("click", onCreate);
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const el = $(btn.dataset.target);
    try {
      await navigator.clipboard.writeText(el.textContent);
      btn.textContent = "Copied / コピー済";
      setTimeout(() => {
        btn.textContent = "Copy / コピー";
      }, 1500);
    } catch {
      btn.textContent = "Copy failed";
    }
  });
});

initSamples();
"""

HTML_HEAD = r"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>海の森レポート / Sea Forest Report</title>
  <style>
    :root { --accent: #189DE0; --border: #d8e8f0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; background: #fff; color: #222; line-height: 1.5; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 1rem; }
    header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: 1rem; }
    header h1 { margin: 0; font-size: 1.25rem; color: var(--accent); }
    .api-key label { font-size: .75rem; display: block; }
    .api-key input { width: min(220px, 100%); padding: .35rem .5rem; border: 1px solid var(--border); border-radius: 4px; }
    .banner { background: #e8f6fc; border: 1px solid var(--accent); color: #0a5578; padding: .5rem .75rem; border-radius: 6px; font-size: .9rem; margin-bottom: 1rem; }
    section { margin-bottom: 1.5rem; }
    section h2 { font-size: 1rem; margin: 0 0 .5rem; border-left: 4px solid var(--accent); padding-left: .5rem; }
    .sample-btns { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .5rem; }
    .sample-btns button { border: 1px solid var(--accent); background: #fff; color: var(--accent); padding: .4rem .75rem; border-radius: 4px; cursor: pointer; font-size: .85rem; }
    .sample-btns button.active { background: var(--accent); color: #fff; }
    textarea { width: 100%; min-height: 120px; padding: .75rem; border: 1px solid var(--border); border-radius: 6px; font-size: .95rem; resize: vertical; }
    .primary { margin-top: .75rem; background: var(--accent); color: #fff; border: none; padding: .6rem 1.2rem; border-radius: 6px; font-size: 1rem; cursor: pointer; }
    .primary:disabled { opacity: .6; cursor: wait; }
    .claude-line { font-size: .95rem; margin-bottom: .5rem; }
    .spinner { width: 28px; height: 28px; border: 3px solid #e0e0e0; border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; margin: .5rem 0; display: none; }
    .spinner.show { display: block; }
    @keyframes spin { to { transform: rotate(360deg); } }
    table { width: 100%; border-collapse: collapse; font-size: .85rem; margin-top: .5rem; }
    th, td { border: 1px solid var(--border); padding: .4rem .5rem; text-align: left; vertical-align: top; }
    th { background: #f4fafd; width: 38%; }
    .output-area { position: relative; }
    .fallback-label { position: absolute; top: 0; right: 0; background: #fff3cd; border: 1px solid #e6c200; font-size: .75rem; padding: .25rem .5rem; border-radius: 4px; display: none; z-index: 2; }
    .fallback-label.show { display: block; }
    .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem; margin: 1rem 0; }
    @media (min-width: 640px) { .cards { grid-template-columns: repeat(4, 1fr); } }
    .card { border: 1px solid var(--border); border-radius: 8px; padding: .75rem; text-align: center; }
    .card .num { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
    .card .sub { font-size: .75rem; color: #666; margin-top: .25rem; }
    .card .label { font-size: .8rem; }
    .baseline-note { font-size: .75rem; color: #666; margin-bottom: .5rem; }
    .addressee { font-weight: 600; margin: 1rem 0 .5rem; }
    .reports { display: grid; gap: 1rem; }
    @media (min-width: 720px) { .reports { grid-template-columns: 1fr 1fr; } }
    .report-box { border: 1px solid var(--border); border-radius: 8px; padding: .75rem; }
    .report-box h3 { margin: 0 0 .5rem; font-size: .9rem; }
    .report-text { white-space: pre-wrap; font-size: .9rem; min-height: 4rem; }
    .copy-btn { margin-top: .5rem; font-size: .8rem; border: 1px solid var(--accent); background: #fff; color: var(--accent); padding: .25rem .6rem; border-radius: 4px; cursor: pointer; }
    .seconds-line { margin: 1rem 0; padding: .75rem; background: #f8fcfe; border-radius: 6px; font-size: .9rem; }
    footer { font-size: .75rem; color: #666; border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 1.5rem; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>海の森レポート / Sea Forest Report</h1>
      <div class="api-key">
        <label for="api-key">API key / APIキー</label>
        <input id="api-key" type="password" autocomplete="off" placeholder="sk-ant-…">
      </div>
    </header>

    <div class="banner" id="banner-input">見本データ（架空の数字）/ Sample data (not real numbers)</div>

    <section id="input-section">
      <h2>入れる / Input</h2>
      <div class="sample-btns" id="sample-btns"></div>
      <textarea id="memo" placeholder="音声メモの文字起こし / Voice memo transcript"></textarea>
      <button type="button" class="primary" id="create-btn">レポートを作る / Create report</button>
    </section>

    <section id="claude-section">
      <h2>Claudeがしていること / What Claude does</h2>
      <p class="claude-line">話した内容から 場所・人数・時間・作業の量・海の変化 を取り出し、会社向けの報告を書いています</p>
      <div class="spinner" id="spinner" aria-hidden="true"></div>
      <div id="fields-wrap" class="hidden">
        <table id="fields-table"><tbody></tbody></table>
      </div>
    </section>

    <div class="banner" id="banner-output">見本データ（架空の数字）/ Sample data (not real numbers)</div>

    <section id="output-section" class="output-area">
      <h2>出てくる / Output</h2>
      <div class="fallback-label" id="fallback-label">予備データ表示中 / fallback data</div>
      <p class="baseline-note">累計の起点 / Baseline: 6 days · 41 people (18 company) · 98 h · 3,850 urchins · 24 bags</p>
      <div class="cards" id="cards">
        <div class="card"><div class="label">活動日数 / Days</div><div class="num" id="card-days">6</div></div>
        <div class="card"><div class="label">参加者 / Participants</div><div class="num" id="card-people">41</div><div class="sub" id="card-company">うち会社 / company: 18</div></div>
        <div class="card"><div class="label">ガンガゼ / Urchins</div><div class="num" id="card-urchins">3,850</div></div>
        <div class="card"><div class="label">母藻袋 / Seed bags</div><div class="num" id="card-bags">24</div></div>
      </div>
      <p class="addressee">玄界ブルー電機株式会社 御中（架空）</p>
      <div class="reports hidden" id="reports">
        <div class="report-box">
          <h3>会社向け報告（日本語）/ Report (JA)</h3>
          <div class="report-text" id="report-ja"></div>
          <button type="button" class="copy-btn" data-target="report-ja">Copy / コピー</button>
        </div>
        <div class="report-box">
          <h3>Report (English) / 英語</h3>
          <div class="report-text" id="report-en"></div>
          <button type="button" class="copy-btn" data-target="report-en">Copy / コピー</button>
        </div>
      </div>
      <div class="seconds-line" id="seconds-line"></div>
    </section>

    <footer>見本データ（架空）です。藻場 1,286→612ha、漁業者 1,062→668人は唐津市の公開資料</footer>
  </div>

  <script type="application/json" id="sample-bundle">"""

HTML_TAIL = """</script>
  <script>
""" + JS + """
  </script>
</body>
</html>
"""

(ROOT / "index.html").write_text(HTML_HEAD + bundle_json + HTML_TAIL, encoding="utf-8")
print("Wrote index.html")
