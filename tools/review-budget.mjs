// One wall-clock budget, including diagnostics and browser cleanup.
export function reviewBudget(limitMs, log = console.error, now = Date.now) {
  const start = now();
  const reserve = Math.min(5000, limitMs / 10);
  let stage = "startup";
  return {
    get stage() {
      return stage;
    },
    get elapsed() {
      return now() - start;
    },
    remaining(diagnostics = false) {
      return Math.max(0, limitMs - (now() - start) - (diagnostics ? 0 : reserve));
    },
    mark(next) {
      stage = next;
      log(`[${((now() - start) / 1000).toFixed(3)}s] ${stage}`);
    },
    timeout(requested = limitMs, diagnostics = false) {
      const left = this.remaining(diagnostics);
      if (!left) throw new Error(`Deadline exceeded; stalled stage: ${stage}`);
      return Math.min(requested, left);
    },
  };
}
