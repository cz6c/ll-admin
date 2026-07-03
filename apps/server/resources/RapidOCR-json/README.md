# RapidOCR-json 部署说明

工资条 OCR 依赖 [RapidOCR-json](https://github.com/hiroi-sora/RapidOCR-json) 可执行文件，请按平台下载并放置到本目录：

| 平台 | 文件名 |
|------|--------|
| Windows | `RapidOCR-json.exe` |
| Linux x64 | `RapidOCR-json` |

下载后确保可执行权限（Linux: `chmod +x RapidOCR-json`）。

配置项见 `src/config/dev.yml` 中的 `ocr.executable`。
