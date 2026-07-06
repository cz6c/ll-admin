import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { extname, join, resolve } from "path";
import { parseOcrCells } from "../utils/ocr-layout";
import type { OcrProvider, OcrProviderRecognizeResult } from "./ocr-provider.interface";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const OCR = require("rapidocrjson");

interface OcrResponse {
  code?: number;
  data?: unknown;
  message?: string;
}

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp"
};

/** RapidOCR-json 本地子进程实现 */
@Injectable()
export class RapidOcrProvider implements OcrProvider, OnModuleDestroy {
  readonly name = "local" as const;

  private ocr: InstanceType<typeof OCR> | null = null;
  private initPromise: Promise<void> | null = null;
  private recognizeQueue: Promise<unknown> = Promise.resolve();
  private readonly serverRoot: string;

  constructor(private readonly config: ConfigService) {
    this.serverRoot = resolve(__dirname, "../../..");
  }

  async onModuleDestroy() {
    await this.terminate();
  }

  async recognize(buffer: Buffer, mimeType = "image/jpeg"): Promise<OcrProviderRecognizeResult> {
    const ext = MIME_EXT[mimeType] || ".jpg";
    const workDir = await mkdtemp(join(tmpdir(), "rapid-ocr-"));
    const imagePath = join(workDir, `input${ext}`);

    try {
      await writeFile(imagePath, buffer);
      const task = this.recognizeQueue.then(() => this.runRecognize(imagePath));
      this.recognizeQueue = task.catch(() => undefined);
      return await task;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
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

  private async runRecognize(imagePath: string): Promise<OcrProviderRecognizeResult> {
    await this.ensureReady();

    if (!this.ocr) {
      throw new Error("ocr_not_ready");
    }

    const response = (await this.ocr.flush(this.getOcrOptions(imagePath))) as OcrResponse;

    if (response?.code !== 100) {
      throw new Error("ocr_recognize_failed");
    }

    return {
      cells: parseOcrCells(response.data),
      raw: response.data
    };
  }

  private async terminate() {
    if (this.ocr) {
      await this.ocr.terminate();
      this.ocr = null;
      this.initPromise = null;
    }
  }
}
