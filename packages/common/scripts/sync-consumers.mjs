import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_NAME = "@llcz/common";
const DEP_KEYS = ["dependencies", "devDependencies"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const commonDir = join(__dirname, "..");
const rootDir = join(commonDir, "../..");
const dryRun = process.argv.includes("--dry-run");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function listConsumerPackageJsons() {
  const appsDir = join(rootDir, "apps");
  const entries = await fs.readdir(appsDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join(appsDir, entry.name, "package.json");
    try {
      await fs.access(pkgPath);
      files.push(pkgPath);
    } catch {
      // skip apps without package.json
    }
  }

  return files;
}

function syncPackageJson(pkg, version) {
  const next = `^${version}`;
  const changes = [];

  for (const key of DEP_KEYS) {
    const deps = pkg[key];
    if (!deps || !(PKG_NAME in deps)) continue;
    const prev = deps[PKG_NAME];
    if (prev === next) continue;
    deps[PKG_NAME] = next;
    changes.push({ key, prev, next });
  }

  return changes;
}

async function main() {
  const commonPkg = await readJson(join(commonDir, "package.json"));
  const version = commonPkg.version;

  if (!version) {
    console.error(`[sync-consumers] ${PKG_NAME} package.json 缺少 version`);
    process.exit(1);
  }

  console.log(`[sync-consumers] ${PKG_NAME}@${version}${dryRun ? " (dry-run)" : ""}`);

  const consumerFiles = await listConsumerPackageJsons();
  let changedCount = 0;

  for (const pkgPath of consumerFiles) {
    const pkg = await readJson(pkgPath);
    const changes = syncPackageJson(pkg, version);
    if (changes.length === 0) continue;

    changedCount += 1;
    const rel = relative(rootDir, pkgPath).replace(/\\/g, "/");
    for (const { key, prev, next } of changes) {
      console.log(`  ${rel} [${key}] ${prev} -> ${next}`);
    }

    if (!dryRun) {
      await writeJson(pkgPath, pkg);
    }
  }

  if (changedCount === 0) {
    console.log("[sync-consumers] 消费方已是最新版本，跳过");
    return;
  }

  if (dryRun) {
    console.log(`[sync-consumers] dry-run：将更新 ${changedCount} 个 package.json，未写入、未执行 pnpm install`);
    return;
  }

  console.log("[sync-consumers] 正在根目录执行 pnpm install ...");
  const result = spawnSync("pnpm", ["install"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    console.error("[sync-consumers] pnpm install 失败");
    process.exit(result.status ?? 1);
  }

  console.log("[sync-consumers] 完成");
}

main().catch((error) => {
  console.error("[sync-consumers]", error);
  process.exit(1);
});
