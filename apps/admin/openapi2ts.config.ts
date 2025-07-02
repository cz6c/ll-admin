import { resolve } from "node:path";

export default [
  {
    schemaPath: resolve(__dirname, "../server/swagger.json"),
    serversPath: resolve(__dirname, "./temp_openapi"),
    requestLibPath: `import { request } from "@/utils/request";import type { AxiosRequestConfig } from "axios";`,
    requestOptionsType: "AxiosRequestConfig"
  }
];
