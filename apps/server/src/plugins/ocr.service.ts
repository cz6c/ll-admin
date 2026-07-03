import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync } from "fs";
import { resolve } from "path";
import {
  detectLayout,
  extractPlainText,
  formatForLlm,
  OcrCell,
  OcrLayoutType,
  parseOcrCells
} from "./utils/ocr-layout";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const OCR = require("rapidocrjson");

interface OcrResponse {
  code?: number;
  data?: unknown;
  message?: string;
}

/** OCR 识别结果：text 供 LLM 消费，cells 保留坐标供业务扩展，raw 为引擎原始响应 */
export interface OcrRecognizeResult {
  text: string;
  cells: OcrCell[];
  layout: OcrLayoutType;
  raw: unknown;
}

/** RapidOCR-json 通用封装，配置见 config 中 ocr.* */
@Injectable()
export class OcrService implements OnModuleDestroy {
  private ocr: InstanceType<typeof OCR> | null = null;
  private initPromise: Promise<void> | null = null;
  private recognizeQueue: Promise<unknown> = Promise.resolve();
  private readonly serverRoot: string;

  constructor(private readonly config: ConfigService) {
    this.serverRoot = resolve(__dirname, "../..");
  }

  async onModuleDestroy() {
    await this.terminate();
  }

  private getExecutablePaths() {
    const configured = this.config.get<string>("ocr.executable");
    const defaultName = process.platform === "win32" ? "RapidOCR-json.exe" : "RapidOCR-json";
    const executable = configured ? resolve(this.serverRoot, configured) : resolve(this.serverRoot, "resources/RapidOCR-json", defaultName);
    const cwd = resolve(executable, "..");
    return { executable, cwd };
  }

  private getOcrOptions(imagePath: string): Record<string, unknown> {
    const options = this.config.get<Record<string, unknown>>("ocr.options") || {};
    return {
      image_path: imagePath,
      maxSideLen: 2048,
      padding: 50,
      ...options
    };
  }

  /** 懒加载 OCR 子进程，并发请求共享同一次 initPromise */
  private async ensureReady(): Promise<void> {
    if (this.ocr) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolveInit, reject) => {
      const { executable, cwd } = this.getExecutablePaths();

      if (!existsSync(executable)) {
        this.initPromise = null;
        reject(new Error("ocr_executable_missing"));
        return;
      }

      const instance = new OCR(executable, [], { cwd }, false);

      instance.once("init", () => {
        this.ocr = instance;
        resolveInit();
      });
      instance.once("error", () => {
        this.initPromise = null;
        reject(new Error("ocr_init_failed"));
      });
      instance.once("exit", (code: number) => {
        if (!this.ocr) {
          this.initPromise = null;
          reject(new Error(`ocr_exit_${code}`));
        }
      });
    });

    return this.initPromise;
  }

  private async runRecognize(imagePath: string): Promise<OcrRecognizeResult> {
    await this.ensureReady();

    if (!this.ocr) {
      throw new Error("ocr_not_ready");
    }

    const response = (await this.ocr.flush(this.getOcrOptions(imagePath))) as OcrResponse;

    if (response?.code !== 100) {
      throw new Error("ocr_recognize_failed");
    }

    const cells = parseOcrCells(response.data);
    const layout = detectLayout(cells);
    const structuredText = formatForLlm(cells, layout);
    const plainText = extractPlainText(response.data);

    // 双通道：结构化排版 + 纯文本兜底，提升多样版式可读性
    const text =
      structuredText && plainText && structuredText !== plainText
        ? `${structuredText}\n\n【纯文本兜底】\n${plainText}`
        : structuredText || plainText;

    return { text, cells, layout, raw: response.data };
  }

  /** 串行化 flush，避免单实例子进程并发竞态 */
  async recognize(imagePath: string): Promise<OcrRecognizeResult> {
    const task = this.recognizeQueue.then(() => this.runRecognize(imagePath));
    this.recognizeQueue = task.catch(() => undefined);
    return task;
  }

  private async terminate() {
    if (this.ocr) {
      await this.ocr.terminate();
      this.ocr = null;
      this.initPromise = null;
    }
  }
}
