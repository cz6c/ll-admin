/**
 * @llcz/common 发版前的 semver 升版
 * 职责：按 patch|minor|major 抬高本包 package.json 的 version
 * 适用：release 流程；仅升版用 bump，已升过版只 publish 用 pack
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, "..", "package.json");
const dryRun = process.argv.includes("--dry-run");
const BUMP_TYPES = new Set(["patch", "minor", "major"]);

/**
 * @param {string} version
 * @param {"patch" | "minor" | "major"} type
 * @returns {string}
 */
function bumpSemver(version, type) {
  const parts = String(version)
    .trim()
    .split(".")
    .map(part => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n) || n < 0)) {
    throw new Error(`非法 semver（期望 x.y.z）: ${version}`);
  }

  let [major, minor, patch] = parts;
  switch (type) {
    case "major":
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case "minor":
      minor += 1;
      patch = 0;
      break;
    default:
      patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

/**
 * 从 argv 解析升版类型；pnpm 可能传入多余的 `--`
 * @returns {"patch" | "minor" | "major"}
 */
function resolveBumpType() {
  const found = process.argv.find(arg => BUMP_TYPES.has(arg));
  return found ?? "patch";
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const current = packageJson.version;
  if (!current) {
    throw new Error("package.json 缺少 version");
  }

  const type = resolveBumpType();
  const next = bumpSemver(current, type);

  packageJson.version = next;
  console.log(`[bumpVersion] (${type}) ${current} → ${next}`);
  if (dryRun) {
    console.log("[bumpVersion] dry-run，未写入文件");
    return;
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

main();
