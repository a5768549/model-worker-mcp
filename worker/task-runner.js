import fs from "node:fs/promises";
import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { repositoryRoot, relativeSafe, validatePaths } from "./path-guard.js";
import { complete } from "./provider-client.js";
import { routeTask } from "./router.js";
import { recordUsage } from "./usage-store.js";

const exec = promisify(execFile);
export const jobs = new Map();

function applyDiff(root, diff, checkOnly) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", root, "apply", ...(checkOnly ? ["--check"] : []), "--whitespace=nowarn", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `git apply failed with code ${code}`)));
    child.stdin.end(diff);
  });
}

function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }); }
function diffPaths(diff) {
  return [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm), ...diff.matchAll(/^--- a\/(.+)$/gm)]
    .map((match) => match[1]).filter((value) => value !== "/dev/null").map((value) => value.replace(/^\"|\"$/g, ""));
}

export async function startTask(input) {
  if (!input?.task || typeof input.task !== "string") throw new Error("task is required");
  const root = repositoryRoot(input.cwd || process.cwd());
  const routing = routeTask(input);
  if (routing.route === "guarded" && !input.allow_guarded) throw new Error(`${routing.reason} 如需明確授權，設定 allow_guarded: true 並指定 model。`);
  const readPaths = validatePaths(root, input.read_paths || []);
  const writePaths = validatePaths(root, input.write_paths || []);
  if (!writePaths.length) throw new Error("write_paths must contain at least one path");
  const contents = [];
  for (const p of readPaths) contents.push({ path: p, content: await fs.readFile(`${root}/${p}`, "utf8") });
  const id = `mw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = { id, status: "running", cwd: root, writePaths, model: input.model || routing.model, route: routing.route, startedAt: new Date().toISOString(), usage: null };
  jobs.set(id, job);
  const controller = new AbortController();
  job.cancel = () => controller.abort();
  run(job, { ...input, model: input.model || routing.model, readPaths, writePaths, contents }, controller).catch(async (error) => { job.status = error.name === "AbortError" ? "cancelled" : "failed"; job.error = error.message; job.error_type = error.name || "task_error"; job.provider_status = error.provider_status || null; job.finishedAt = new Date().toISOString(); await recordUsage(job); });
  return publicJob(job);
}

async function run(job, input, controller) {
  const result = await complete({ task: input.task, model: input.model, files: { contents: input.contents, writePaths: input.writePaths }, validation: input.validation, forbidden: input.forbidden || [], signal: controller.signal });
  const diff = result.diff;
  const proposedPaths = [...new Set(diffPaths(diff))];
  if (!proposedPaths.length) throw new Error("Provider returned an empty or invalid unified diff");
  if (proposedPaths.some((p) => !input.writePaths.includes(p))) throw new Error(`Provider proposed path outside write_paths: ${proposedPaths.join(", ")}`);
  await applyDiff(job.cwd, diff, true);
  await applyDiff(job.cwd, diff, false);
  let validationResult = null;
  if (input.validation) {
    try { validationResult = await exec("powershell.exe", ["-NoProfile", "-Command", input.validation], { cwd: job.cwd, timeout: (input.timeout_seconds || 300) * 1000, maxBuffer: 2 * 1024 * 1024 }); }
    catch (error) { validationResult = { stdout: error.stdout || "", stderr: error.stderr || error.message, code: error.code || 1 }; }
  }
  job.status = "completed"; job.diff = git(job.cwd, ["diff", "--", ...input.writePaths]); job.validation = validationResult; job.usage = result.usage; job.finishedAt = new Date().toISOString(); await recordUsage(job);
}

export function publicJob(job) { const { cancel, ...safe } = job; return safe; }
export function status(id) { const job = jobs.get(id); return job ? publicJob(job) : null; }
export function cancel(id) { const job = jobs.get(id); if (!job) return false; job.cancel?.(); return true; }
