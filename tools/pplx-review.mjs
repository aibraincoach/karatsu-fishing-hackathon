#!/usr/bin/env node
/**
 * PPLX review via Firefox WebDriver BiDi (canonical copy in this repository).
 * Single: PPLX_BIDI_WS=ws://127.0.0.1:9223/session node tools/pplx-review.mjs <GitHub PR URL> <head sha> <capture file>
 * Batch:  PPLX_BIDI_WS=ws://127.0.0.1:9223/session node tools/pplx-review.mjs --tabs <N> <PR URL>… --out <dir outside the repo>
 * Prerequisite: Firefox headless listening on PPLX_BIDI_WS with signed-in Perplexity profile.
 * Exit 0: success. Exit 2: timeout or error. Exit 3: DEVIATION (Searching the web). Exit 4: wrong model (request body or visible page/footer label). Exit 5: the open dropdown omits the model or does not retain its selection (text and screenshot captured). Exit 6: head SHA does not match the PR.
 * One 120-second wall-clock budget includes setup, submission, answer, diagnostics and cleanup.
 * The last five seconds are reserved for a failure capture and browser cleanup.
 * Each stage is logged immediately. The final response payload, not animated page text,
 * determines answer completion. Batch tabs share the run's deadline.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewBudget } from "./review-budget.mjs";
import { completedReview } from "./review-answer.mjs";

// 120 seconds in use (docs/review.md). PPLX_LIMIT_MS shortens it for the runner's own tests only (item 324:
// two tests waited the full 120 seconds inside every Cloudflare build).
const LIMIT_MS = Math.min(120_000, Math.max(100, Number(process.env.PPLX_LIMIT_MS) || 120_000));
const budget = reviewBudget(LIMIT_MS);
let diagnosing = false;
const tabsForCapture = [];
const diagnosticsWritten = new Set();
const POLL_MS = 1_000;
const WS_URL = process.env.PPLX_BIDI_WS || "ws://127.0.0.1:9222/session";
const CLOSE_TIMEOUT_MS = 5_000;
const HARD_EXIT_MS = 10_000;
const MODEL_WANT = "Gemini 3.8 Flash";
const MODEL_BUTTON_SCRIPT = `(document.querySelector('button[aria-label="Model"]') || [...document.querySelectorAll('button')].find((b) => /^(Gemini|GPT|Claude|Kimi|GLM|Grok|Nemotron|Best)/.test(b.getAttribute('aria-label') || '')))`;

const USAGE = `Usage:
  node tools/pplx-review.mjs <PR_URL> <head_sha> <capture_out>
  node tools/pplx-review.mjs --tabs <N> <PR URL>… --out <dir>`;

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { mode: "help" };
  }
  if (args[0] !== "--tabs") {
    const [prUrl, headAt, out] = args;
    if (prUrl && headAt && out) return { mode: "single", prUrl, headAt, out };
    return { mode: "help" };
  }
  const tabs = Number.parseInt(args[1], 10);
  if (!Number.isFinite(tabs) || tabs < 1) return { mode: "help" };
  const urls = [];
  let i = 2;
  while (i < args.length && args[i] !== "--out") {
    urls.push(args[i]);
    i += 1;
  }
  const outDir = args[i + 1];
  if (args[i] !== "--out" || !outDir || urls.length === 0) return { mode: "help" };
  if (urls.length !== tabs) {
    console.error(`--tabs ${tabs} requires exactly ${tabs} PR URL(s), got ${urls.length}`);
    process.exit(2);
  }
  return { mode: "batch", tabs, urls, outDir };
}

function parsePrUrl(url) {
  const m = String(url).match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: m[3] };
}

function prNumberFromUrl(url) {
  return parsePrUrl(url)?.number ?? null;
}

function captureBasename(prUrl) {
  const parsed = parsePrUrl(prUrl);
  return parsed ? `${parsed.owner}-${parsed.repo}-pr-${parsed.number}` : `pr-${prNumberFromUrl(prUrl)}`;
}

function headShaForUrl(prUrl) {
  if (!parsePrUrl(prUrl)) throw new Error(`not a GitHub PR URL: ${prUrl}`);
  return execFileSync("gh", ["pr", "view", prUrl, "--json", "headRefOid", "-q", ".headRefOid"], {
    encoding: "utf8",
    timeout: budget.timeout(15_000),
  }).trim();
}

class ReviewPreflightError extends Error {
  constructor(message, exitCode) {
    super(message);
    this.exitCode = exitCode;
  }
}

/** Reject stale expected SHAs without bypassing the caller's browser cleanup. */
function requireMatchingReviewHead(prUrl, expectedSha) {
  const parsed = parsePrUrl(prUrl);
  if (!parsed) throw new ReviewPreflightError(`not a GitHub PR URL: ${prUrl}`, 2);
  let headNow;
  try {
    headNow = headShaForUrl(prUrl);
  } catch (e) {
    throw new ReviewPreflightError(`gh pr view failed: ${e.message ?? e}`, 2);
  }
  const expected = (expectedSha ?? headNow).trim().toLowerCase();
  if (headNow.toLowerCase() !== expected) {
    throw new ReviewPreflightError("head SHA does not match PR; refresh head and retry", 6);
  }
}

const parsed = parseArgs(process.argv);
if (parsed.mode === "help") {
  console.error(USAGE);
  const isHelpFlag = process.argv.includes("--help") || process.argv.includes("-h");
  process.exit(isHelpFlag ? 0 : 2);
}

let id = 0;
const pending = new Map();
let ws;
let sessionOpen = false;
const openTabContexts = new Set();

function send(method, params = {}, timeoutMs = 10_000) {
  const timeout = budget.timeout(diagnosing ? Math.min(timeoutMs, 2000) : timeoutMs, diagnosing);
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(msgId);
      reject(new Error(`timeout ${method}; stalled stage: ${budget.stage}`));
    }, timeout);
    pending.set(msgId, { resolve, reject, timer });
    try {
      ws.send(JSON.stringify({ id: msgId, method, params }));
    } catch (error) {
      clearTimeout(timer);
      pending.delete(msgId);
      reject(error);
    }
  });
}

function onMessage(raw) {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    if (msg.type === "error") reject(new Error(JSON.stringify(msg)));
    else resolve(msg.result);
  }
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, budget.timeout(ms)));
}

async function evalScript(context, expression) {
  const r = await send("script.callFunction", {
    functionDeclaration: `function() { return (${expression}); }`,
    target: { context },
    awaitPromise: true,
    arguments: [],
  });
  return r?.result?.value ?? r?.value;
}

async function pointerClick(context, elementExpression) {
  const raw = await evalScript(
    context,
    `(function(){const e=(${elementExpression});if(!e)return '';const r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)return '';return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})})()`,
  );
  if (!raw) return false;
  const p = JSON.parse(raw);
  await send("input.performActions", {
    context,
    actions: [
      {
        type: "pointer",
        id: "mouse1",
        parameters: { pointerType: "mouse" },
        actions: [
          { type: "pointerMove", x: p.x, y: p.y },
          { type: "pointerDown", button: 0 },
          { type: "pointerUp", button: 0 },
        ],
      },
    ],
  });
  return true;
}

async function closeTabContext(context) {
  if (!context || !ws || ws.readyState !== 1) return;
  openTabContexts.delete(context);
  try {
    await send("browsingContext.close", { context }, CLOSE_TIMEOUT_MS);
  } catch {
    /* ignore */
  }
}

async function endSession() {
  if (!sessionOpen || !ws || ws.readyState !== 1) return;
  sessionOpen = false;
  try {
    await send("session.end", {}, CLOSE_TIMEOUT_MS);
  } catch {
    /* ignore */
  }
}

async function shutdownAll(code) {
  clearTimeout(deadlineTimer);
  const hardExit = setTimeout(
    () => {
      console.error(`hard exit after ${HARD_EXIT_MS / 1000}s: tab close or session end hung`);
      process.exit(code);
    },
    Math.min(HARD_EXIT_MS, budget.remaining(true)),
  );
  for (const context of [...openTabContexts]) {
    await closeTabContext(context);
  }
  await endSession();
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  clearTimeout(hardExit);
  process.exit(code);
}

function writeCapture(outPath, header, body) {
  writeFileSync(outPath, `${header}\n\n${body}`);
}

function makeTabState({ context, prUrl, headAt, outPath }) {
  const prompt = `code review ${prUrl}`;
  const tab = {
    context,
    tabOpenedAt: Date.now(),
    prUrl,
    headAt,
    outPath,
    prompt,
    enterAt: 0,
    timeLeft() {
      return budget.remaining();
    },
    sinceTabOpen() {
      return ((Date.now() - this.tabOpenedAt) / 1000).toFixed(1);
    },
  };
  tabsForCapture.push(tab);
  return tab;
}

function submissionExpired(tab) {
  if (tab.timeLeft() > 0) return false;
  recordFailure(tab, {
    code: 2,
    message: `PPLX timeout before submission: ${tab.sinceTabOpen()}s since tab open`,
    header: `Head at submission: ${tab.headAt}\nElapsed since tab open: ${tab.sinceTabOpen()}s\n`,
    text: "",
  });
  tab.resultCode = 2;
  return true;
}

async function waitAskInput(tab) {
  budget.mark(`${tab.prUrl}: await prompt input`);
  let askReady = false;
  while (!askReady && tab.timeLeft() > 0) {
    await pause(100);
    askReady = await evalScript(tab.context, `!!document.querySelector('#ask-input')`);
  }
  return askReady;
}

const MODEL_MENU_SCRIPT = `[...document.querySelectorAll('[role="menu"]')].find(e => e.getAttribute('data-state') === 'open' && e.querySelector('[role="menuitemradio"]'))`;
const MODEL_ITEM_SCRIPT = `(${MODEL_MENU_SCRIPT})?.querySelectorAll('[role="menuitemradio"]')`;
const MODEL_CHOICE_SCRIPT = `[...((${MODEL_ITEM_SCRIPT}) || [])].find(e => (e.innerText || '').trim().split('\\n')[0] === ${JSON.stringify(MODEL_WANT)})`;

async function modelMenuState(tab) {
  const raw = await evalScript(
    tab.context,
    `(function(){
    const menu = (${MODEL_MENU_SCRIPT});
    const choice = (${MODEL_CHOICE_SCRIPT});
    const button = (${MODEL_BUTTON_SCRIPT});
    return JSON.stringify({open:!!menu, text:menu?.innerText || '', listed:!!choice,
      buttonLabel:button?.innerText.trim() || button?.getAttribute('aria-label') || '',
      selected:choice?.getAttribute('aria-checked') === 'true'});
  })()`,
  );
  return JSON.parse(raw);
}

async function modelSelectionFailure(tab, message, code, state) {
  const screenshot = `${tab.outPath}.model-selection.png`;
  let evidence;
  try {
    const shot = await send("browsingContext.captureScreenshot", { context: tab.context, origin: "viewport" }, 5000);
    writeFileSync(screenshot, Buffer.from(shot.data, "base64"));
    evidence = `Dropdown screenshot: ${screenshot}`;
  } catch (error) {
    evidence = `Dropdown screenshot unavailable: ${String(error)}`;
  }
  return {
    ok: false,
    code,
    message,
    text: `${message}\nModel requested: ${MODEL_WANT}\n${evidence}\nFull dropdown text:\n${state.text}`,
  };
}

async function waitForModelUi(tab, predicate) {
  while (tab.timeLeft() > 0) {
    if (await predicate()) return true;
    await pause(100);
  }
  return false;
}

async function openModelMenu(tab) {
  budget.mark(`${tab.prUrl}: open model dropdown`);
  for (let attempt = 0; attempt < 2; attempt++) {
    if ((await modelMenuState(tab)).open) break;
    if (!(await waitForModelUi(tab, () => pointerClick(tab.context, MODEL_BUTTON_SCRIPT)))) return false;
    const until = Date.now() + Math.min(1000, tab.timeLeft());
    while (Date.now() < until) {
      if ((await modelMenuState(tab)).open) break;
      await pause(100);
    }
    if ((await modelMenuState(tab)).open) break;
    if (attempt === 0) budget.mark(`${tab.prUrl}: dropdown did not open; retry click once`);
  }
  if (!(await modelMenuState(tab)).open) throw new Error("Model dropdown did not open after two clicks");
  // Options can hydrate after the menu opens; do not mistake a transient Sonar menu for absence.
  return waitForModelUi(tab, async () => {
    const state = await modelMenuState(tab);
    return state.open && state.text && (state.listed || (state.buttonLabel && state.text.includes(state.buttonLabel)));
  });
}

async function closeModelMenu(tab) {
  return waitForModelUi(tab, async () => {
    if (!(await modelMenuState(tab)).open) return true;
    await send("input.performActions", {
      context: tab.context,
      actions: [
        {
          type: "key",
          id: "model-menu",
          actions: [
            { type: "keyDown", value: "\uE00C" },
            { type: "keyUp", value: "\uE00C" },
          ],
        },
      ],
    });
    return !(await modelMenuState(tab)).open;
  });
}

async function ensureModel(tab) {
  const incLabel = await evalScript(
    tab.context,
    `(document.querySelector('[aria-label*="ncognito"]')||{}).getAttribute?.('aria-label')||''`,
  );
  if (String(incLabel).startsWith("Use")) {
    await pointerClick(tab.context, `document.querySelector('[aria-label*="ncognito"]')`);
  }
  if (!(await openModelMenu(tab))) {
    return modelSelectionFailure(
      tab,
      "MODEL CONTROL NOT READY before submission deadline; not quota evidence",
      2,
      await modelMenuState(tab),
    );
  }
  let state = await modelMenuState(tab);
  if (!state.listed) return modelSelectionFailure(tab, `MODEL NOT LISTED: ${MODEL_WANT}`, 5, state);
  budget.mark(`${tab.prUrl}: select ${MODEL_WANT}`);
  if (!(await pointerClick(tab.context, MODEL_CHOICE_SCRIPT))) {
    return modelSelectionFailure(tab, "MODEL CONTROL DISAPPEARED; selection remains unconfirmed", 2, state);
  }
  // Close explicitly even if choosing a model leaves a submenu open. Then inspect a fresh dropdown.
  if (!(await closeModelMenu(tab)) || !(await openModelMenu(tab))) {
    return modelSelectionFailure(
      tab,
      "MODEL CONTROL NOT READY for confirmation; not quota evidence",
      2,
      await modelMenuState(tab),
    );
  }
  state = await modelMenuState(tab);
  if (!state.listed || !state.selected) {
    return modelSelectionFailure(
      tab,
      state.listed ? `MODEL CHOICE DID NOT PERSIST: ${MODEL_WANT}` : `MODEL NOT LISTED: ${MODEL_WANT}`,
      5,
      state,
    );
  }
  budget.mark(`${tab.prUrl}: model selection confirmed`);
  console.log(`Model dropdown confirmed after reopening: ${MODEL_WANT}; aria-checked=true`);
  if (!(await closeModelMenu(tab))) {
    return modelSelectionFailure(tab, "MODEL MENU DID NOT CLOSE before submission deadline", 2, state);
  }
  return { ok: true };
}

async function installFetchHook(tab) {
  budget.mark(`${tab.prUrl}: install response completion hook`);
  await evalScript(
    tab.context,
    `(function(){
    const completedReview = ${completedReview.toString()};
    window.__asks = [];
    window.__reviewResponse = {started:false, complete:false, terminal:'', answer:'', model:'', error:''};
    const orig = window.fetch;
    window.fetch = function(...args) {
      const u = String(args[0]?.url || args[0]);
      const review = u.includes('perplexity_ask');
      if (review && args[1]?.body) window.__asks.push(String(args[1].body));
      const p = orig.apply(this, args);
      if (review) {
        const responseState = {started:true, complete:false, terminal:'', answer:'', model:'', error:''};
        window.__reviewResponse = responseState;
        p.then(async response => {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const reader = response.clone().body.getReader();
          let bytes = 0;
          let buffer = '';
          const decoder = new TextDecoder();
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.length;
            buffer += decoder.decode(chunk.value, {stream:true}).replace(/\\r/g, '');
            let boundary;
            while ((boundary = buffer.indexOf('\\n\\n')) >= 0) {
              const event = buffer.slice(0,boundary);

              buffer = buffer.slice(boundary+2);
              const answer = completedReview(event);
              if (answer) {
                responseState.answer = answer.text;
                responseState.model = answer.model;
                responseState.terminal = answer.proof;
                responseState.complete = true;
              }
            }
          }
          if (!bytes) throw new Error('Empty response stream');
          if (!responseState.complete) throw new Error('Response closed without a completed answer payload');
        }).catch(error => { if (!responseState.complete) responseState.error = String(error); });
      }
      return p;
    };
    return true;
  })()`,
  );
}

async function typePrompt(tab) {
  budget.mark(`${tab.prUrl}: type exact review prompt`);
  await evalScript(
    tab.context,
    `(function(){
      const el = document.querySelector('#ask-input');
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, ${JSON.stringify(tab.prompt)});
      return true;
    })()`,
  );
  const boxText = await evalScript(
    tab.context,
    `(document.querySelector('#ask-input').innerText || document.querySelector('#ask-input').textContent || '').trim()`,
  );
  if (boxText !== tab.prompt) {
    return { ok: false, code: 2, message: `box mismatch: ${JSON.stringify(boxText)}` };
  }
  return { ok: true };
}

async function pressEnter(tab) {
  budget.mark(`${tab.prUrl}: submit review`);
  if (submissionExpired(tab)) return false;
  await send("browsingContext.activate", { context: tab.context });
  // Activation is asynchronous: recheck immediately before dispatching the Enter action.
  if (submissionExpired(tab)) return false;
  tab.enterAt = Date.now();
  await send("input.performActions", {
    context: tab.context,
    actions: [
      {
        type: "key",
        id: "k1",
        actions: [
          { type: "keyDown", value: "\uE007" },
          { type: "keyUp", value: "\uE007" },
        ],
      },
    ],
  });
  tab.submitted = true;
  return true;
}

async function pollAnswer(tab) {
  budget.mark(`${tab.prUrl}: await response stream completion`);
  let text = "";
  let terminal = "";
  let responseModel = "";
  while (tab.timeLeft() > 0) {
    const raw = await evalScript(
      tab.context,
      `JSON.stringify({response:window.__reviewResponse, text:(document.querySelector('main')||{}).innerText||''})`,
    );
    const state = JSON.parse(raw);
    text = state.text;
    tab.lastText = text;
    if (state.response?.error) throw new Error(`Response stream failed: ${state.response.error}`);
    if (state.response?.complete) {
      text = state.response.answer;
      responseModel = state.response.model;
      terminal = state.response.terminal;
      break;
    }
    await pause(POLL_MS);
  }
  budget.timeout();
  budget.mark(`${tab.prUrl}: verify completed answer and model proof`);
  const elapsedSinceEnter = ((Date.now() - tab.enterAt) / 1000).toFixed(1);
  const asks = await evalScript(tab.context, `JSON.stringify(window.__asks||[])`);
  let modelPref = "";
  try {
    for (const body of JSON.parse(asks || "[]")) {
      const m = body.match(/"model_preference":"([^"]+)"/);
      if (m) modelPref = m[1];
    }
  } catch {
    /* ignore */
  }

  const header = `Head at submission: ${tab.headAt}\nCompletion proof: ${terminal}\nModel proof: model_preference = ${modelPref || "MISSING"}\nElapsed since Enter: ${elapsedSinceEnter}s\nElapsed since tab open: ${tab.sinceTabOpen()}s\nPrompt submitted: ${tab.prompt}`;

  if (text.includes("Searching the web")) {
    return { ok: false, code: 3, message: "DEVIATION: Searching the web", header, text };
  }
  if (responseModel !== "gemini38flash") {
    return { ok: false, code: 4, message: `WRONG RESPONSE MODEL: ${responseModel}`, header, text };
  }
  if (modelPref !== "gemini38flash") {
    return { ok: false, code: 4, message: "WRONG MODEL", header, text };
  }
  // Item 336: the request body says what was asked for; the page says what answered. Both must say Gemini 3.8 Flash.
  const pageModel = await pageModelLabel(tab, text);
  const headerWithPage = `${header}\nModel on page: ${pageModel || "MISSING"}`;
  if (pageModel !== MODEL_WANT) {
    return { ok: false, code: 4, message: `WRONG MODEL ON PAGE: ${pageModel || "none"}`, header: headerWithPage, text };
  }
  return { ok: true, header: headerWithPage, text };
}

/**
 * The model label Perplexity shows after the answer. Read from the model button's aria-label first (the
 * same control ensureModel selected); when that is empty, from the last non-empty line of the answer text,
 * which in captures of 2026-10-17 is the label under the Ask a follow-up box ("Gemini 3.8 Flash").
 */
async function pageModelLabel(tab, text) {
  const fromButton = String(
    (await evalScript(
      tab.context,
      `((${MODEL_BUTTON_SCRIPT}) || { getAttribute: () => '' }).getAttribute('aria-label') || ''`,
    )) || "",
  ).trim();
  if (fromButton) return fromButton;
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

function recordFailure(tab, result) {
  const header = (result.header || `Head at submission: ${tab.headAt}\n`) + `\nStage: ${budget.stage}\n`;
  writeCapture(tab.outPath, header, result.text || result.message || "");
  console.error(`${tab.prUrl}: ${result.message}`);
}

async function connectBiDi() {
  budget.mark("connect Firefox BiDi");
  ws = new WebSocket(WS_URL);
  await new Promise((res, rej) => {
    ws.addEventListener("open", () => res(), { once: true });
    ws.addEventListener("error", (e) => rej(e), { once: true });
  });
  ws.addEventListener("message", (ev) => onMessage(ev.data));
  budget.mark("create Firefox session");
  await send("session.new", { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
  sessionOpen = true;
}

async function openTab() {
  budget.mark("open Perplexity tab");
  const { context } = await send("browsingContext.create", { type: "tab" });
  openTabContexts.add(context);
  budget.mark("navigate Perplexity");
  await send("browsingContext.navigate", { context, url: "https://www.perplexity.ai/", wait: "none" });
  return context;
}

async function runSingleReview(tab) {
  await send("browsingContext.activate", { context: tab.context });
  if (!(await waitAskInput(tab))) {
    recordFailure(tab, {
      code: 2,
      message: `no #ask-input within ${tab.sinceTabOpen()}s of tab open`,
      header: `Head at submission: ${tab.headAt}\n`,
      text: "",
    });
    return 2;
  }

  let model = await ensureModel(tab);
  if (!model.ok) {
    recordFailure(tab, { ...model, header: `Head at submission: ${tab.headAt}\n` });
    return model.code;
  }

  await installFetchHook(tab);
  const typed = await typePrompt(tab);
  if (!typed.ok) {
    recordFailure(tab, { ...typed, header: `Head at submission: ${tab.headAt}\n`, text: "" });
    return typed.code;
  }

  if (!(await pressEnter(tab))) return 2;
  const answer = await pollAnswer(tab);
  if (!answer.ok) {
    recordFailure(tab, answer);
    return answer.code;
  }

  writeCapture(tab.outPath, answer.header, answer.text);
  console.log(answer.header);
  return 0;
}

async function runSingleMode({ prUrl, headAt, out }) {
  try {
    budget.mark("verify PR head");
    requireMatchingReviewHead(prUrl, headAt);
    await connectBiDi();
    const context = await openTab();
    const tab = makeTabState({ context, prUrl, headAt, outPath: out });
    const code = await runSingleReview(tab);
    await closeTabContext(context);
    await shutdownAll(code);
  } catch (e) {
    const code = e instanceof ReviewPreflightError ? e.exitCode : 2;
    console.error(`Stalled stage: ${budget.stage}; ${String(e)}`);
    try {
      const header = `Head at submission: ${headAt || "unknown"}\n`;
      await captureDiagnostics(out, header, e);
    } catch (captureError) {
      console.error(`capture write failed: ${captureError}`);
    } finally {
      await shutdownAll(code);
    }
  }
}

async function runBatchMode({ urls, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const tabs = [];
  let typingLock = Promise.resolve();

  const withTypingLock = (fn) => {
    const run = typingLock.then(fn);
    typingLock = run.catch(() => {});
    return run;
  };

  try {
    for (const prUrl of urls) {
      const num = prNumberFromUrl(prUrl);
      if (!num) {
        console.error(`not a GitHub PR URL: ${prUrl}`);
        await shutdownAll(2);
        return;
      }
      const headAt = headShaForUrl(prUrl);
      budget.mark("verify PR head");
      requireMatchingReviewHead(prUrl, headAt);
    }
    await connectBiDi();
    for (const prUrl of urls) {
      const headAt = headShaForUrl(prUrl);
      budget.mark("verify PR head");
      requireMatchingReviewHead(prUrl, headAt);
      const outPath = join(outDir, `${captureBasename(prUrl)}.txt`);

      await withTypingLock(async () => {
        const context = await openTab();
        const tab = makeTabState({ context, prUrl, headAt, outPath });
        tabs.push(tab);

        if (!(await waitAskInput(tab))) {
          recordFailure(tab, {
            code: 2,
            message: `no #ask-input within ${tab.sinceTabOpen()}s of tab open`,
            header: `Head at submission: ${tab.headAt}\n`,
            text: "",
          });
          tab.resultCode = 2;
          return;
        }
        if (submissionExpired(tab)) return;
        await send("browsingContext.activate", { context: tab.context });
        let model = await ensureModel(tab);
        if (!model.ok) {
          recordFailure(tab, { ...model, header: `Head at submission: ${tab.headAt}\n` });
          tab.resultCode = model.code;
          return;
        }
        await installFetchHook(tab);
        const typed = await typePrompt(tab);
        if (!typed.ok) {
          recordFailure(tab, { ...typed, header: `Head at submission: ${tab.headAt}\n`, text: "" });
          tab.resultCode = typed.code;
          return;
        }
        if (submissionExpired(tab)) return;
        await pressEnter(tab);
      });
    }

    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.resultCode != null || !tab.submitted) return;
        const answer = await pollAnswer(tab);
        if (!answer.ok) {
          recordFailure(tab, answer);
          tab.resultCode = answer.code;
          return;
        }
        writeCapture(tab.outPath, answer.header, answer.text);
        console.log(`${tab.prUrl}:\n${answer.header}`);
        tab.resultCode = 0;
      }),
    );

    for (const tab of tabs) {
      if (tab.resultCode == null) {
        recordFailure(tab, {
          code: 2,
          message: "review not submitted",
          header: `Head at submission: ${tab.headAt}\n`,
          text: "",
        });
        tab.resultCode = 2;
      }
    }

    const exitCode = tabs.reduce((worst, tab) => Math.max(worst, tab.resultCode ?? 2), 0);
    await shutdownAll(exitCode);
  } catch (e) {
    console.error(`Stalled stage: ${budget.stage}; ${String(e)}`);
    await captureAll(e);
    await shutdownAll(e instanceof ReviewPreflightError ? e.exitCode : 2);
  }
}

async function captureDiagnostics(out, header, error, tab = tabsForCapture.find((t) => t.outPath === out)) {
  diagnosing = true;
  let text = tab?.lastText || "Page text unavailable: no responsive tab";
  let shotNote = "Screenshot unavailable: no responsive tab";
  const context = tab?.context || [...openTabContexts][0];
  if (context && ws?.readyState === 1) {
    await Promise.allSettled([
      evalScript(context, `(document.querySelector('main') || document.body)?.innerText || ''`).then((value) => {
        text = value;
      }),
      send("browsingContext.captureScreenshot", { context, origin: "viewport" }, 2000)
        .then((shot) => {
          const path = `${out}.deadline.png`;
          writeFileSync(path, Buffer.from(shot.data, "base64"));
          shotNote = `Screenshot: ${path}`;
        })
        .catch((e) => {
          shotNote = `Screenshot unavailable: ${e}`;
        }),
    ]);
  }
  try {
    writeCapture(
      out,
      `${header}\nStalled stage: ${budget.stage}\nElapsed: ${(budget.elapsed / 1000).toFixed(3)}s\n${shotNote}`,
      `${error}\n\n${text}`,
    );
    diagnosticsWritten.add(out);
  } catch (e) {
    console.error(`capture write failed: ${e}`);
  }
}

async function captureAll(error) {
  const targets =
    parsed.mode === "single"
      ? [{ outPath: parsed.out, headAt: parsed.headAt }]
      : parsed.urls.map(
          (prUrl) =>
            tabsForCapture.find((t) => t.prUrl === prUrl) || {
              outPath: join(parsed.outDir, `${captureBasename(prUrl)}.txt`),
              headAt: "not read",
            },
        );
  await Promise.allSettled(
    targets.map((tab) => captureDiagnostics(tab.outPath, `Head at submission: ${tab.headAt}`, error)),
  );
}

const deadlineTimer = setTimeout(async () => {
  const error = `Deadline exceeded; stalled stage: ${budget.stage}`;
  console.error(error);
  await captureAll(error);
  await shutdownAll(2);
}, budget.remaining());
// Even an unresponsive browser must not prevent a named, non-zero exit at the cap.
setTimeout(() => {
  console.error(`Deadline exceeded; stalled stage: ${budget.stage}`);
  const targets =
    parsed.mode === "single"
      ? [parsed.out]
      : parsed.urls.map((url) => join(parsed.outDir, `${captureBasename(url)}.txt`));
  for (const out of targets) {
    if (diagnosticsWritten.has(out)) continue;
    try {
      writeCapture(
        out,
        `Stalled stage: ${budget.stage}`,
        `Deadline exceeded; diagnostics did not finish.\n${tabsForCapture.find((t) => t.outPath === out)?.lastText || "Page text unavailable"}\nScreenshot unavailable: browser did not respond before deadline`,
      );
    } catch (e) {
      console.error(`capture write failed: ${e}`);
    }
  }
  process.exit(2);
}, budget.remaining(true));
budget.mark("start review");
if (parsed.mode === "single") {
  runSingleMode(parsed);
} else {
  runBatchMode(parsed);
}
