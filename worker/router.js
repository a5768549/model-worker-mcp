const guardedPatterns = [
  /auth|登入|登录|permission|權限|权限|credential|secret|密鑰|密钥|token/i,
  /payment|billing|付款|支付|訂閱|订阅/i,
  /migration|migrate|database|資料庫|数据库|schema/i,
  /deploy|deployment|production|正式環境|正式环境|release/i,
  /api\s*(contract|breaking)|lockfile|pnpm-lock|package-lock|yarn\.lock/i
];
const fastPatterns = [/css|style|文案|文案|copy|readme|documentation|docs|format|格式|單檔|单文件/i];
const deepseekPatterns = [/bug|修復|修复|修正|fix|test|測試|测试|function|函式|函数|backend|後端|后端|service|controller|api handler|邏輯|逻辑/i];
const reviewPatterns = [/review|audit|審查|审查|檢查|检查|security|安全/i];

export function routeTask(input) {
  const text = [input.task || "", ...(input.read_paths || []), ...(input.write_paths || [])].join(" ");
  const writeCount = (input.write_paths || []).length;
  const matchedGuard = guardedPatterns.find((pattern) => pattern.test(text));
  if (matchedGuard) return { route: "guarded", model: null, autoDelegate: false, reason: "任務涉及高風險領域，留給主代理審查與處理。" };
  const matchedReview = reviewPatterns.find((pattern) => pattern.test(text));
  if (matchedReview) return { route: "review", model: "glm-5.2", autoDelegate: true, reason: "任務是審查或安全檢查，使用 GLM 作第二意見。" };
  const matchedDeepseek = deepseekPatterns.find((pattern) => pattern.test(text));
  if (writeCount <= 3 && matchedDeepseek) return { route: "implementation", model: "deepseek-flash-0731", autoDelegate: true, reason: "中低風險程式邏輯、bug 或測試任務，使用 DeepSeek Flash。" };
  const matchedFast = fastPatterns.find((pattern) => pattern.test(text));
  if (writeCount <= 1 && (matchedFast || text.length < 180)) return { route: "fast", model: "qwen3.6-flash", autoDelegate: true, reason: "單檔或低複雜度任務，使用快速模型。" };
  return { route: "standard", model: "qwen3.7-plus", autoDelegate: true, reason: "一般 coding 任務，使用優惠主力模型。" };
}
