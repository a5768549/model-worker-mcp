import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

async function credentialFromStore() {
  if (process.platform !== "win32") return null;
  try {
    const file = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "CodexModelWorker", "credentials.json");
    const stored = JSON.parse(await fs.readFile(file, "utf8"))[process.env.MODEL_WORKER_CREDENTIAL || "worker-primary"];
    if (!stored) return null;
    return execFileSync("powershell.exe", ["-NoProfile", "-Command", "$s=ConvertTo-SecureString $env:MW_ENC; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}"], { encoding: "utf8", env: { ...process.env, MW_ENC: stored } }).trim();
  } catch { return null; }
}

export async function complete({ task, model, files, validation, forbidden, signal }) {
  const base = (process.env.MODEL_WORKER_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const key = process.env.MODEL_WORKER_API_KEY || await credentialFromStore();
  if (!key) throw new Error("MODEL_WORKER_API_KEY is not set. Run npm run credentials:set or set the user environment variable.");
  const prompt = [
    "You are a bounded coding worker. Return ONLY a unified diff that can be applied with `git apply`.",
    "Do not include explanations or markdown fences. Modify only the declared write paths.",
    `Task:\n${task}`,
    `Allowed write paths:\n${files.writePaths.join("\n") || "(none)"}`,
    `Forbidden:\n${forbidden.join("\n") || "(none)"}`,
    `Validation command (do not run it yourself): ${validation || "none"}`,
    "Files:\n" + files.contents.map((f) => `--- ${f.path}\n${f.content}`).join("\n")
  ].join("\n\n");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: model || process.env.MODEL_WORKER_MODEL || "qwen3.7-plus", temperature: 0.1, messages: [{ role: "user", content: prompt }] }),
    signal
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 1000);
    const error = new Error(`Provider returned ${response.status}: ${body}`);
    error.provider_status = response.status;
    error.provider_body = body;
    throw error;
  }
  const json = await response.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("Provider response did not contain message content");
  return { diff: text.replace(/^```(?:diff)?\s*/i, "").replace(/\s*```\s*$/i, ""), usage: json.usage || null };
}
