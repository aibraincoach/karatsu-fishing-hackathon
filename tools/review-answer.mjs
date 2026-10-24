// Perplexity sends the complete answer before the UI finishes animating it.
// Accept the completed text replacement, never a chunk or an intermediate final flag.
export function completedReview(event) {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  let value;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (value.text_completed !== true) return null;
  const answers = [];
  for (const block of value.blocks || []) {
    if (block.intended_usage !== "workflow_root") continue;
    const patches = block.diff_block?.patches || [];
    for (const patch of patches) {
      const path = patch.path?.match(/^(\/steps\/\d+)\/items\/\d+\/payload\/text_payload\/text$/);
      if (!path || patch.op !== "replace" || typeof patch.value !== "string" || !patch.value.trim()) continue;
      const payload = patch.path.slice(0, -4);
      const stopped = patches.some((p) => p.path === `${payload}is_streaming` && p.value === false);
      const completed = patches.some((p) => p.path === `${path[1]}/status` && p.value === "WORKFLOW_COMPLETED");
      if (stopped && completed) answers.push(patch.value);
    }
  }
  return answers.length
    ? {
        text: answers.join("\n\n"),
        model: value.display_model,
        proof: "text_completed=true; WORKFLOW_COMPLETED; is_streaming=false",
      }
    : null;
}
