// uno.config.ts
import { defineConfig, presetWind3, presetAttributify, presetIcons } from "unocss";

export default defineConfig({
  content: {
    pipeline: {
      exclude: ["node_modules", "dist", ".git", ".husky", ".vscode", "public", "build"]
    }
  },
  presets: [
    presetWind3(),
    // 支持css class属性化
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle"
      }
    })
  ],
  rules: [
    [/^bc-(.+)$/, ([, color]) => ({ "border-color": `#${color}` })],
    ["card-shadow", { "box-shadow": "0 1px 2px -2px #00000029, 0 3px 6px #0000001f, 0 5px 12px 4px #00000017" }],
    [/^flex-(.+)$/, ([, num]) => ({ flex: `0 0 ${num}` })]
  ],
  shortcuts: {
    "wh-full": "w-full h-full",
    "flex-center": "flex justify-center items-center",
    "flex-col-center": "flex-center flex-col",
    "flex-x-center": "flex justify-center",
    "flex-y-center": "flex items-center",
    "b-flex-col": "flex flex-col",
    "flex-col-stretch": "b-flex-col items-stretch",
    "flex-1-hidden": "flex-1 overflow-hidden",
    "absolute-lt": "absolute left-0 top-0",
    "absolute-lb": "absolute left-0 bottom-0",
    "absolute-rt": "absolute right-0 top-0",
    "absolute-rb": "absolute right-0 bottom-0",
    "absolute-tl": "absolute-lt",
    "absolute-tr": "absolute-rt",
    "absolute-bl": "absolute-lb",
    "absolute-br": "absolute-rb",
    "absolute-center": "absolute-lt flex-center wh-full",
    "fixed-lt": "fixed left-0 top-0",
    "fixed-lb": "fixed left-0 bottom-0",
    "fixed-rt": "fixed right-0 top-0",
    "fixed-rb": "fixed right-0 bottom-0",
    "fixed-tl": "fixed-lt",
    "fixed-tr": "fixed-rt",
    "fixed-bl": "fixed-lb",
    "fixed-br": "fixed-rb",
    "fixed-center": "fixed left-0 top-0 flex-center wh-full",
    "nowrap-hidden": "whitespace-nowrap overflow-hidden",
    "ellipsis-text": "nowrap-hidden text-ellipsis",
    "transition-base": "transition-all duration-300 ease-in-out"
  },
  theme: {
    colors: {
      primary: "var(--primary-color)"
    }
  }
});
