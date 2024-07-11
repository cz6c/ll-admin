declare global {
  const __APP_INFO__: {
    pkg: {
      name: string;
      version: string;
      dependencies: Recordable<string>;
      devDependencies: Recordable<string>;
    };
    lastBuildTime: string;
  };

  type Recordable<T = any> = Record<string, T>;
  type ReadonlyRecordable<T = any> = {
    readonly [key: string]: T;
  };
  type TimeoutHandle = ReturnType<typeof setTimeout>;
  type IntervalHandle = ReturnType<typeof setInterval>;

  interface ImportMetaEnv extends ViteEnv {
    __: unknown;
  }

  interface ViteEnv {
    VITE_NODE_ENV: "development" | "test" | "production";
    VITE_APP_TITLE: string;
    VITE_PORT: number;
    VITE_PUBLIC_PATH: string;
    VITE_BASE_URL: string;
    VITE_PROXY: [string, string][];
    VITE_USE_COMPRESS: boolean;
    VITE_USE_REPORT: boolean;
  }

  interface Window {
    _AMapSecurityConfig: {
      securityJsCode: string;
    };
  }

  function parseInt(s: string | number, radix?: number): number;

  function parseFloat(string: string | number): number;
}

export {};
