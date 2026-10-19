# Model Worker MCP

本機、受限範圍的 coding worker MCP。它只接受明確的 `cwd`、`read_paths`、`write_paths`，將 provider 回傳的 unified diff 在套用前驗證，並可執行指定驗證命令。

## 設定

1. 在使用者環境變數設定 `MODEL_WORKER_API_KEY`，或執行 `npm run credentials:set -- worker-primary`（Windows DPAPI 加密儲存）。
2. 設定 `MODEL_WORKER_BASE_URL`（任何 OpenAI-compatible `/chat/completions` endpoint，預設為阿里雲百煉 `https://dashscope.aliyuncs.com/compatible-mode/v1`；若使用百煉專屬 workspace，改成自己的 workspace endpoint）與 `MODEL_WORKER_MODEL`。預設主力是 `qwen3.7-plus`；單檔小修改可切換為 `qwen3.6-flash`。`deepseek-flash-0731` 會自動用於中低風險程式邏輯、bug 修復、測試與後端小功能，也支援手動指定。模型名稱與價格表在 `worker/router.js`、`worker/usage-store.js`，換 provider 時一併調整。
3. `.mcp.json` 以相對路徑啟動 `server/server.js`；若你的 MCP client 不支援 `cwd`，把 `args` 改成此目錄的絕對路徑。

需求：Node.js 18 以上、Git（diff 以 `git apply` 套用，`cwd` 必須是 Git repository）；驗證命令與 credential 加密目前透過 Windows PowerShell 執行。

## 本機測試

```powershell
node server/server.js
```

MCP 工具：`route_code_task`、`delegate_code_task`、`get_task_status`、`cancel_task`、`get_usage_summary`。優先呼叫 `route_code_task`：CSS／文案／文件等低複雜度任務走 `qwen3.6-flash`；中低風險程式邏輯、bug 修復、測試與後端小功能走 `deepseek-flash-0731`；一般或跨檔 coding 走 `qwen3.7-plus`；審查走 `glm-5.2`。涉及 auth、payment、secret、migration、database、部署或正式環境時只回傳 `guarded`，不會自動委派。每個任務的 token、估算費用與失敗錯誤摘要會持久化到 `%LOCALAPPDATA%\CodexModelWorker\usage.json`，可用 `get_usage_summary` 查詢。DeepSeek 價格尚未填入，因此其費用會標為未知，不會猜算。錯誤內容會遮罩 `Bearer` 與 `sk-` 字串，API key 不會出現在設定檔、任務參數、diff 或 log 中。

## License

[MIT](LICENSE)
