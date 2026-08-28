/**
 * 相册视频播放路径解析
 * 职责：按需调用 Rust 将 HEVC 转 H.264 代理，供 `<video>` / LivePhotoPlayer 使用
 */
import { ensureAlbumPlayback } from "@/api/album";
import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauri } from "@/utils/tauri";

/**
 * 解析可在 WebView 播放的视频 src（HEVC 会先转码）
 * @param sourcePath 源文件绝对路径；空则清空
 */
export function useAlbumPlaybackSrc(sourcePath: Ref<string | undefined>) {
  const playbackPath = ref("");
  const loading = ref(false);
  const error = ref<string | null>(null);
  let requestId = 0;

  const playbackSrc = computed(() => {
    if (!playbackPath.value) return "";
    return convertFileSrc(playbackPath.value);
  });

  watch(
    sourcePath,
    async path => {
      requestId += 1;
      const currentId = requestId;

      if (!path?.trim()) {
        playbackPath.value = "";
        loading.value = false;
        error.value = null;
        return;
      }

      loading.value = true;
      error.value = null;

      try {
        if (isTauri()) {
          playbackPath.value = await ensureAlbumPlayback(path);
        } else {
          playbackPath.value = path;
        }
      } catch (e: unknown) {
        if (currentId !== requestId) return;
        error.value = typeof e === "string" ? e : "视频播放准备失败";
        playbackPath.value = "";
      } finally {
        if (currentId === requestId) {
          loading.value = false;
        }
      }
    },
    { immediate: true }
  );

  return { playbackSrc, playbackPath, loading, error };
}
