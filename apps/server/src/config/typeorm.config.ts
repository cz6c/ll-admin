import { DataSource } from "typeorm";
import configuration from "./index";
const config = configuration();

const AppDataSource = new DataSource({
  type: "mysql",
  ...config.db.mysql,
  entities: ["dist/**/*.entity.js"],
  migrations: ["dist/migrations/*.js"],
  cli: {
    migrationsDir: "src/migrations" // 迁移文件存放目录
  }
});

export default AppDataSource;
