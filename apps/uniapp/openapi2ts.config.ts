import { resolve } from 'node:path'

export default [
  {
    schemaPath: resolve(__dirname, '../server/swagger.json'),
    serversPath: resolve(__dirname, './temp_openapi'),
    requestLibPath: `import { request } from "@/utils/http";import type { CustomRequestOptions } from "@/interceptors/request";`,
    requestOptionsType: 'CustomRequestOptions',
    declareType: 'interface',
  },
]
