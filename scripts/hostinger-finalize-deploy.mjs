import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const tmpDir = path.join(root, "tmp");
const restartFile = path.join(tmpDir, "restart.txt");
const buildIdFile = path.join(root, ".next", "BUILD_ID");

let buildId = "unknown";
try {
  buildId = (await readFile(buildIdFile, "utf8")).trim() || buildId;
} catch {
  // A missing build id means Next did not complete; keep the restart marker readable.
}

await mkdir(tmpDir, { recursive: true });
await writeFile(
  restartFile,
  [
    `restart=${new Date().toISOString()}`,
    `buildId=${buildId}`,
    "reason=postbuild",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`Hostinger restart marker updated at ${path.relative(root, restartFile)}`);
