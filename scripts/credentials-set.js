import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const name = process.argv[2] || "worker-primary";
const prompt = spawn("powershell.exe", ["-NoProfile", "-Command", "$s=Read-Host 'API key' -AsSecureString; $s | ConvertFrom-SecureString"], { stdio: ["inherit", "pipe", "inherit"] });
let output = ""; prompt.stdout.on("data", (chunk) => { output += chunk; });
prompt.on("close", async (code) => {
  if (code !== 0 || !output.trim()) process.exit(code || 1);
  const dir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "CodexModelWorker");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "credentials.json"), JSON.stringify({ [name]: output.trim() }, null, 2), { encoding: "utf8", mode: 0o600 });
  console.log(`Stored encrypted credential '${name}' in ${dir}`);
});
