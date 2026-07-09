import { DataSource } from "typeorm";
import configuration from "./index";
import { buildMysqlTypeOrmOptions } from "./typeorm-options";

const config = configuration();

const AppDataSource = new DataSource(
  buildMysqlTypeOrmOptions(config.db.mysql, {
    entities: ["dist/**/*.entity.js"],
    migrations: ["dist/migrations/*.js"],
    cli: {
      migrationsDir: "src/migrations"
    }
  })
);

export default AppDataSource;
