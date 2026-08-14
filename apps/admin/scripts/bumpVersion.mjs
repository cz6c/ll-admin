/**
 * CS 正式打包前的版本号 patch +1
 * 职责：以 tauri.conf.json 为准升 patch，并同步到 package.json
 * 适用：仅 cs:build；同版本重打用 cs:build:rebuild，不要调用本脚本
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const tauriConfPath = path.join(adminRoot, "src-tauri", "tauri.conf.json");
const packageJsonPath = path.join(adminRoot, "package.json");
const dryRun = process.argv.includes("--dry-run");

/**
 * 语义化版本 patch +1（x.y.z → x.y.(z+1)）
 * @param {string} version
 * @returns {string}
 */
function bumpPatch(version) {
  const parts = String(version)
    .trim()
    .split(".")
    .map(part => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n) || n < 0)) {
    throw new Error(`非法 semver（期望 x.y.z）: ${version}`);
  }
  parts[2] += 1;
  return parts.join(".");
}

function main() {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  const current = tauriConf.version;
  if (!current) {
    throw new Error("tauri.conf.json 缺少 version");
  }

  // package.json 若与 tauri 不一致，仍以 tauri 为准升版，避免两处各涨一次
  if (packageJson.version && packageJson.version !== current) {
    console.warn(
      `[bumpVersion] package.json(${packageJson.version}) 与 tauri.conf.json(${current}) 不一致，以 tauri 为准`
    );
  }

  const next = bumpPatch(current);
  tauriConf.version = next;
  packageJson.version = next;

  console.log(`[bumpVersion] ${current} → ${next}`);
  if (dryRun) {
    console.log("[bumpVersion] dry-run，未写入文件");
    return;
  }

  fs.writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`, "utf8");
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

main();
