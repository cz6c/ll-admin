import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { join } from "node:path";

// 项目路径配置
const PROJECT_PATHS = {
  admin: "./apps/admin/temp_openapi",
  // uniapp: path.resolve(__dirname, "../uniapp/src/service/types"),
  // electron: path.resolve(__dirname, "../electron/src/core/api/types"),
};

// 1. 转换为 TypeScript 类型
console.log("📦 转换为 TypeScript 类型...");
execSync(`npx openapi-typescript ./apps/server/swagger.json -o ./temp.d.ts`);

// 2. 读取生成的内容
const generatedTypes = fs.readFileSync("./temp.d.ts", "utf-8");

// 3. 分发到各前端项目
Object.entries(PROJECT_PATHS).forEach(([name, targetPath]) => {
  console.log(`📤 分发到 ${name} 项目...`);

  // 确保目标目录存在
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  // 添加项目特定注释
  const header = `/**\n * 自动生成类型 - 来自后端 DTO\n * 生成时间: ${new Date().toISOString()}\n */\n\n`;

  // 写入文件
  fs.writeFileSync(join(targetPath, "api-types.d.ts"), header + generatedTypes);
});

// 4. 清理临时文件
fs.unlinkSync("./temp.d.ts");
console.log("✅ 类型生成完成！");
