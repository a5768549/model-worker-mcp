import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const storeDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "CodexModelWorker");
const storeFile = path.join(storeDir, "usage.json");
let queue = Promise.resolve();

export const pricing = {
  "qwen3.6-flash": { input: 0.72, output: 4.32, unit: "CNY per 1M tokens" },
  "qwen3.7-plus": { input: 1.20, output: 4.80, unit: "CNY per 1M tokens" },
  "glm-5.2": { input: 5.60, output: 19.60, unit: "CNY per 1M tokens" }
};
export const knownModels = ["qwen3.6-flash", "qwen3.7-plus", "glm-5.2", "deepseek-flash-0731"];

async function readEntries() {
  try { return JSON.parse(await fs.readFile(storeFile, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

function estimateCost(model, usage) {
  const rate = pricing[model];
  if (!rate) return null;
  return ((usage.prompt_tokens * rate.input) + (usage.completion_tokens * rate.output)) / 1_000_000;
}

function safeError(value) {
  return String(value || "").replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").replace(/sk-[A-Za-z0-9._-]+/g, "[redacted]").slice(0, 2000);
}

export function normalizeUsage(usage = {}) {
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: Number(usage.total_tokens ?? prompt + completion) || prompt + completion };
}

export async function recordUsage(entry) {
  queue = queue.then(async () => {
    await fs.mkdir(storeDir, { recursive: true });
    const usage = normalizeUsage(entry.usage);
    const record = { id: entry.id, started_at: entry.startedAt, finished_at: entry.finishedAt || new Date().toISOString(), model: entry.model || "unknown", route: entry.route || "unknown", status: entry.status, error: entry.error ? safeError(entry.error) : null, error_type: entry.error ? (entry.error_type || "task_error") : null, provider_status: entry.provider_status || null, usage, estimated_cost_cny: estimateCost(entry.model, usage) };
    const entries = await readEntries();
    entries.push(record);
    const temp = `${storeFile}.tmp-${process.pid}`;
    await fs.writeFile(temp, JSON.stringify(entries, null, 2), "utf8");
    await fs.rename(temp, storeFile);
  });
  return queue;
}

export async function summarize({ model, since, until } = {}) {
  const entries = await readEntries();
  const start = since ? new Date(since).getTime() : -Infinity;
  const end = until ? new Date(until).getTime() : Infinity;
  const selected = entries.filter((entry) => (!model || entry.model === model) && new Date(entry.finished_at).getTime() >= start && new Date(entry.finished_at).getTime() <= end);
  const byModel = {};
  for (const entry of selected) {
    const row = byModel[entry.model] ||= { tasks: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_cny: 0 };
    row.tasks += 1; row.prompt_tokens += entry.usage.prompt_tokens; row.completion_tokens += entry.usage.completion_tokens; row.total_tokens += entry.usage.total_tokens; row.estimated_cost_cny += entry.estimated_cost_cny || 0;
  }
  const totals = Object.values(byModel).reduce((sum, row) => ({ tasks: sum.tasks + row.tasks, prompt_tokens: sum.prompt_tokens + row.prompt_tokens, completion_tokens: sum.completion_tokens + row.completion_tokens, total_tokens: sum.total_tokens + row.total_tokens, estimated_cost_cny: sum.estimated_cost_cny + row.estimated_cost_cny }), { tasks: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_cny: 0 });
  return { store: storeFile, filters: { model: model || null, since: since || null, until: until || null }, known_models: knownModels, totals, failed_tasks: selected.filter((entry) => entry.status === "failed").length, recent_errors: selected.filter((entry) => entry.error).slice(-20).map((entry) => ({ id: entry.id, finished_at: entry.finished_at, model: entry.model, status: entry.status, error_type: entry.error_type, provider_status: entry.provider_status, error: entry.error })), by_model: byModel, pricing, pricing_note: "deepseek-flash-0731 已可使用，但尚未提供價格，因此該模型的 estimated_cost_cny 會是 null。" };
}
