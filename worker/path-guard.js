import path from "node:path";
import { execFileSync } from "node:child_process";

const blocked = new Set([".env", ".env.local", ".git", "credentials.json"]);

export function repositoryRoot(cwd) {
  const resolved = path.resolve(cwd);
  try {
    return execFileSync("git", ["-C", resolved, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(`cwd is not a Git repository: ${resolved}`);
  }
}

export function relativeSafe(root, input) {
  const absolute = path.resolve(root, input);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Path is outside repository: ${input}`);
  const parts = relative.split(path.sep);
  if (parts.some((part) => blocked.has(part) || part.startsWith(".env"))) throw new Error(`Sensitive path is not allowed: ${input}`);
  return { absolute, relative: relative.split(path.sep).join("/") };
}

export function validatePaths(root, paths = []) {
  return paths.map((item) => relativeSafe(root, item).relative);
}
