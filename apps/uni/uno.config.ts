import type { Preset } from 'unocss'

// https://www.npmjs.com/package/@uni-helper/unocss-preset-uni
import { presetUni } from '@uni-helper/unocss-preset-uni'
// @see https://unocss.dev/presets/legacy-compat
import { presetLegacyCompat } from '@unocss/preset-legacy-compat'
import {
  defineConfig,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUni({
      attributify: false,
    }),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    // TODO: check 是否会有别的影响
    // 处理低端安卓机的样式问题
    // 将颜色函数 (rgb()和hsl()) 从空格分隔转换为逗号分隔，更好的兼容性app端，example：
    // `rgb(255 0 0)` -> `rgb(255, 0, 0)`
    // `rgba(255 0 0 / 0.5)` -> `rgba(255, 0, 0, 0.5)`
    presetLegacyCompat({
      commaStyleColorFunction: true,
      legacyColorSpace: true, // by QQ4群-量子蔷薇
      // @菲鸽 unocss 配置中，建议在 presetLegacyCompat 中添加 legacyColorSpace: true，以去除生成的颜色样式中的 in oklch 关键字，现在发现有些渐变色生成不符合预期
    }) as Preset,
  ],
  transformers: [
    // 启用指令功能：主要用于支持 @apply、@screen 和 theme() 等 CSS 指令
    transformerDirectives(),
    // 启用 () 分组功能
    // 支持css class组合，eg: `<div class="hover:(bg-gray-400 font-medium) font-(light mono)">测试 unocss</div>`
    transformerVariantGroup(),
  ],
  shortcuts: [
    {
      'center': 'flex justify-center items-center',
      'page-shell': 'min-h-screen bg-page',
      'page-shell-white': 'min-h-screen bg-white',
      'flex-actions': 'flex gap-24rpx',
      'card-rounded': 'rounded-24rpx overflow-hidden bg-white shadow-sm',
      'border': 'border-solid border-1',
      'border-b': 'border-solid border-0 border-b',
      'border-t': 'border-solid border-0 border-t',
      'border-l': 'border-solid border-0 border-l',
      'border-r': 'border-solid border-0 border-r',
      'border-y': 'border-solid border-0 border-y',
      'border-x': 'border-solid border-0 border-x',
    },
  ],
  // 动态图标需要在这里配置，或者写在vue页面中注释掉
  safelist: [
    'i-carbon-code',
    'i-carbon-home',
    'i-carbon-user',
    'i-carbon-ibm-watson-language-translator',
    'i-carbon-menu',
    'i-carbon-money',
    'i-carbon-time',
    'i-carbon-tools',
    'i-carbon-chevron-right',
    'i-carbon-view',
    'i-carbon-calculator',
    'i-carbon-arrow-up-right',
    'i-carbon-arrow-down-right',
    'i-carbon-information',
    'i-carbon-chevron-down',
    'i-carbon-chevron-up',
    'i-carbon-checkmark-filled',
    'i-carbon-warning-filled',
  ],
  rules: [
    [
      'p-safe',
      {
        padding:
          'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      },
    ],
    ['pt-safe', { 'padding-top': 'env(safe-area-inset-top)' }],
    ['pb-safe', { 'padding-bottom': 'env(safe-area-inset-bottom)' }],
  ],
  theme: {
    colors: {
      /** 主题色，用法如: text-primary */
      primary: 'var(--wot-primary-6,#1688ff)',
      /** 语义色，与 wot-ui success/warning/danger 对齐 */
      success: 'var(--wot-success-main)',
      warning: 'var(--wot-warning-main)',
      danger: 'var(--wot-danger-main)',
      page: '#f5f5f5',
    },
    fontSize: {
      /** 提供更小号的字体，用法如：text-2xs */
      '2xs': ['20rpx', '28rpx'],
      '3xs': ['18rpx', '26rpx'],
    },
  },
  // windows 系统会报错：[plugin:unocss:transformers:pre] Cannot overwrite a zero-length range - use append Left or prependRight instead.
  // 去掉下面的就正常了
  // content: {
  //   /**
  //    * 解决小程序报错 `./app.wxss(78:2814): unexpected unexpected at pos 5198`
  //    * 为什么同时使用include和exclude？虽然看起来多余，但同时配置两者是一种常见的 `防御性编程` 做法。
  //      1. 结构变化保障 : 如果未来项目结构发生变化，某些排除目录可能被移动到包含路径下，exclude配置可以确保它们仍被排除
  //      2. 明确性 : 明确列出要排除的目录使配置意图更加清晰
  //      3. 性能优化 : 避免处理不必要的文件，提高构建性能
  //      4. 防止冲突 : 排除第三方库和构建输出目录，避免潜在的CSS冲突
  //    */
  //   pipeline: {
  //     exclude: [
  //       'node_modules/**/*',
  //       'public/**/*',
  //       'dist/**/*',
  //     ],
  //     include: [
  //       './src/**/*',
  //     ],
  //   },
  // },
})
