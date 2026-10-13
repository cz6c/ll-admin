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
    "flex-1-hidden": "flex-1 overflow-hidden",
    "nowrap-hidden": "whitespace-nowrap overflow-hidden",
    "ellipsis-text": "nowrap-hidden text-ellipsis",
    "transition-base": "transition-opacity duration-200 ease-out",
  },
  theme: {
    colors: {
      primary: "var(--color-primary)"
    }
  }
});
