import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";
const binDir = path.join(process.cwd(), "node_modules", ".bin");
const env = {
  ...process.env,
  RAYON_NUM_THREADS: process.env.RAYON_NUM_THREADS || "1",
  UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || "1",
  NEXT_PRIVATE_MAX_WORKER_THREADS: process.env.NEXT_PRIVATE_MAX_WORKER_THREADS || "1",
};

if (!isWindows && existsSync(binDir)) {
  for (const entry of readdirSync(binDir)) {
    try {
      chmodSync(path.join(binDir, entry), 0o755);
    } catch {
      // Keep going; the command runner below will report any remaining executable issue.
    }
  }
}

function bin(name) {
  return path.join(binDir, isWindows ? `${name}.cmd` : name);
}

function run(label, command, args) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: isWindows,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("prisma generate", bin("prisma"), ["generate"]);
run("next build", bin("next"), ["build"]);
