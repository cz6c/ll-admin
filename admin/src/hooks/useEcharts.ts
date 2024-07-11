import type { EChartsOption } from "echarts";
import * as echarts from "echarts";
import type { Ref } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { unref, nextTick, computed, ref } from "vue";

export function useEcharts(elRef: Ref<HTMLDivElement>, theme: "light" | "dark" | "default" = "default") {
  let chartInstance: echarts.ECharts | null = null;
  const cacheOptions = ref<EChartsOption>({});
  const resizeFn: Fn = useDebounceFn(() => {
    chartInstance?.resize({
      animation: {
        duration: 300,
        easing: "quadraticIn",
      },
    });
  }, 200);

  const getOptions = computed(() => {
    return {
      backgroundColor: "transparent",
      ...cacheOptions.value,
    } as EChartsOption;
  });

  function initCharts(t = theme) {
    const el = unref(elRef);
    if (!el || !unref(el)) {
      return;
    }
    chartInstance = echarts.init(el, t);
  }

  function setOptions(options: EChartsOption, clear = true) {
    cacheOptions.value = options;
    return new Promise(resolve => {
      if (unref(elRef)?.offsetHeight === 0) {
        setTimeout(() => {
          setOptions(unref(getOptions));
          resolve(null);
        }, 30);
      }
      nextTick(() => {
        setTimeout(() => {
          clear && chartInstance?.clear();
          chartInstance?.setOption(unref(getOptions));
          resolve(null);
        }, 30);
      });
    });
  }

  onMounted(() => {
    initCharts();
    window.addEventListener("resize", resizeFn);
  });

  onUnmounted(() => {
    if (!chartInstance) return;
    window.removeEventListener("resize", resizeFn);
    chartInstance.dispose();
    chartInstance = null;
  });

  return {
    setOptions,
    echarts,
  };
}
