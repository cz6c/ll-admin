<script setup lang="ts">
import startImg from "@/assets/images/map/start.png";
import endImg from "@/assets/images/map/end.png";
import carImg from "@/assets/images/map/car.png";
import AMapLoader from "@amap/amap-jsapi-loader";
window._AMapSecurityConfig = {
  securityJsCode: "7513b68945f8cd5d80e9f2a447e8a5cb"
};

defineOptions({
  name: "AMap"
});

const wrapRef = ref<HTMLDivElement | null>(null);

/**
 * @description: 初始化地图
 */
async function initMap() {
  const wrapEl = unref(wrapRef);
  if (!wrapEl) return;
  AMapLoader.load({
    key: "58661ea5b0ac9dfba2c3d58c7418d508", // 申请好的Web端开发者Key，首次调用 load 时必填
    version: "2.0" // 指定要加载的 JSAPI 的版本，缺省时默认为 1.4.15
  })
    .then(AMap => {
      const map = new AMap.Map(wrapEl, {
        // 设置地图容器id
        // viewMode: '3D', //是否为3D地图模式
        zoom: 4 //初始化地图级别 一般12
        // center: [105.602725, 37.076636] //初始化地图中心点位置 不设置默认是北京
        // mapStyle: 'amap://styles/whitesmoke' // 设置地图样式 远山黛
      });
      console.log(map);
      setDriving(AMap, map);
    })
    .catch(e => {
      console.error(e); //加载错误提示
    });
}

/**
 * @description: 路线规划
 * @param {*} AMap
 * @param {*} map
 */
function setDriving(
  AMap: {
    plugin: (arg0: string, arg1: () => void) => void;
    Driving: new (arg0: {
      // 驾车路线规划策略，AMap.DrivingPolicy.LEAST_TIME是最快捷模式
      policy: any;
      map: any; //AMap.Map对象,
      showTraffic: boolean; // 设置是否显示实时路况信息，默认设置为true。 显示绿色代表畅通，黄色代表轻微拥堵，红色代表比较拥堵，灰色表示无路况信息。
      hideMarkers: boolean;
    }) => any;
    DrivingPolicy: { LEAST_TIME: any };
    Icon: new (arg0: { size: any; image: string; imageSize: any }) => any;
    Size: new (arg0: number, arg1: number) => any;
    Marker: new (arg0: { position: number[]; icon: any; offset: any }) => any;
    Pixel: new (arg0: number, arg1: number) => any;
  },
  map: {
    add: (arg0: any) => void;
    setFitView: (arg0: any[], arg1: boolean, arg2: number[], arg3: number) => void;
  }
) {
  // 加载路线规划插件
  AMap.plugin("AMap.Driving", function () {
    // 初始化路线规划对象
    // https://lbs.amap.com/api/javascript-api-v2/documentation#driving
    const driving = new AMap.Driving({
      // 驾车路线规划策略，AMap.DrivingPolicy.LEAST_TIME是最快捷模式
      policy: AMap.DrivingPolicy.LEAST_TIME,
      map: map, //AMap.Map对象,
      showTraffic: true, // 设置是否显示实时路况信息，默认设置为true。 显示绿色代表畅通，黄色代表轻微拥堵，红色代表比较拥堵，灰色表示无路况信息。
      hideMarkers: true //设置隐藏路径规划的起始点图标 设置为true
    });

    // 创建标记函数
    const getMarker = (point: number[], image: string, width = 35, height = 40) => {
      const icon = new AMap.Icon({
        size: new AMap.Size(width, height),
        image,
        imageSize: new AMap.Size(width, height)
      });
      const marker = new AMap.Marker({
        position: point,
        icon: icon,
        offset: new AMap.Pixel(-width / 2, -height) // AMap.Pixel 像素坐标，确定地图上的一个像素点。
      });
      return marker;
    };
    let startLngLat = [116.322033, 39.894912]; // 起始的经纬度
    const startMarker = getMarker(startLngLat, startImg);
    map.add(startMarker);
    let endLngLat = [114.057939, 22.543527]; // 结束的经纬度
    const endMarker = getMarker(endLngLat, endImg);
    map.add(endMarker);
    // startLngLat:起始坐标
    // endLngLat:终点坐标
    // {waypoints:[]}: 路途中的经纬度坐标
    // function (status, result){} 规划好的回调函数
    driving.search(
      startLngLat,
      endLngLat,
      {
        waypoints: [
          [117.201509, 39.085318],
          [117.120128, 36.652069],
          [113.658097, 34.745795],
          [114.304569, 30.593354],
          [112.938882, 28.228304],
          [113.015517, 25.770117]
        ]
      },
      function (status: string, result: object) {
        console.log(status, result);
        // 未出错时，result即是对应的路线规划方案
        // 运输位置 使用标点
        const curr = [113.015517, 25.770117];
        const currMarker = getMarker(curr, carImg, 100, 80);
        map.add(currMarker);
        // 3s后定位到中心进行缩放
        setTimeout(() => {
          map.setFitView(
            [currMarker], // 覆盖物数组
            false, // 动画过渡到制定位置
            [60, 60, 60, 60], // 周围边距，上、下、左、右
            10 // 最大 zoom 级别
          );
        }, 3000);
      }
    );
  });
}

onMounted(() => {
  initMap();
});
</script>

<template>
  <div ref="wrapRef" class="amap-page" />
</template>

<style lang="scss" scoped>
.amap-page {
  width: 100%;
  height: 100%;
}
</style>
