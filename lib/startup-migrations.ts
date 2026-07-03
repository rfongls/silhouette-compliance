import { execFileSync } from "node:child_process";

let attempted = false;

export function runStartupMigrations() {
  if (attempted || process.env.RUN_MIGRATIONS_ON_STARTUP !== "true") return;
  attempted = true;
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
}
