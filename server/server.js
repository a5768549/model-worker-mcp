import readline from "node:readline";
import { startTask, status, cancel } from "../worker/task-runner.js";
import { routeTask } from "../worker/router.js";
import { summarize } from "../worker/usage-store.js";

const tools = [
  { name: "route_code_task", description: "Classify a coding task by risk and automatically delegate safe work to the discounted model tier.", inputSchema: { type: "object", required: ["task", "cwd", "read_paths", "write_paths"], properties: { task: { type: "string" }, cwd: { type: "string" }, read_paths: { type: "array", items: { type: "string" } }, write_paths: { type: "array", items: { type: "string" } }, forbidden: { type: "array", items: { type: "string" } }, validation: { type: "string" }, timeout_seconds: { type: "number" }, model: { type: "string", enum: ["qwen3.6-flash", "qwen3.7-plus", "glm-5.2", "deepseek-flash-0731"] } } } },
  { name: "delegate_code_task", description: "Run a bounded coding task through the configured provider.", inputSchema: { type: "object", required: ["task", "cwd", "read_paths", "write_paths"], properties: { task: { type: "string" }, cwd: { type: "string" }, read_paths: { type: "array", items: { type: "string" } }, write_paths: { type: "array", items: { type: "string" } }, forbidden: { type: "array", items: { type: "string" } }, validation: { type: "string" }, model: { type: "string", enum: ["qwen3.6-flash", "qwen3.7-plus", "glm-5.2", "deepseek-flash-0731"] }, timeout_seconds: { type: "number" } } } },
  { name: "get_task_status", description: "Get status, diff and validation output for a delegated task.", inputSchema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" } } } },
  { name: "cancel_task", description: "Cancel a running delegated task.", inputSchema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" } } } }
  ,{ name: "get_usage_summary", description: "Get persisted token usage and estimated CNY cost, optionally filtered by model or time range.", inputSchema: { type: "object", properties: { model: { type: "string" }, since: { type: "string", description: "ISO-8601 timestamp" }, until: { type: "string", description: "ISO-8601 timestamp" } } } }
];

function reply(id, result, error) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) }) + "\n"); }
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let req; try { req = JSON.parse(line); } catch { return; }
  try {
    if (req.method === "initialize") reply(req.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "model-worker", version: "0.1.0" } });
    else if (req.method === "notifications/initialized") return;
    else if (req.method === "tools/list") reply(req.id, { tools });
    else if (req.method === "tools/call") {
      const { name, arguments: args = {} } = req.params || {};
      let value;
      if (name === "route_code_task") {
        const routing = routeTask(args);
        value = routing.autoDelegate ? { routing: args.model ? { ...routing, model: args.model, reason: "使用者明確指定模型。" } : routing, task: await startTask({ ...args, model: args.model || routing.model }) } : { routing };
      }
      else if (name === "delegate_code_task") value = await startTask(args);
      else if (name === "get_task_status") value = status(args.task_id) || { error: "Unknown task_id" };
      else if (name === "cancel_task") value = { cancelled: cancel(args.task_id) };
      else if (name === "get_usage_summary") value = await summarize(args);
      else throw new Error(`Unknown tool: ${name}`);
      reply(req.id, { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
    } else if (req.id !== undefined) reply(req.id, null, { code: -32601, message: `Method not found: ${req.method}` });
  } catch (error) { reply(req.id, null, { code: -32000, message: error.message }); }
});
