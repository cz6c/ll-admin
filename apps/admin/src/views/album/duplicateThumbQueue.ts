/**
 * 重复清理缩略图生成限流
 * 职责：限制同时 invoke 生成/解码的数量，避免横滑进视口时 IPC 打满导致列表卡顿
 * 适用：DuplicateLazyThumb 可见后拉图
 */

/** 同时进行的缩略图解析上限（HEIC/视频生成偏重） */
const MAX_CONCURRENT = 2;

let active = 0;
const waiters: Array<() => void> = [];

/**
 * 将缩略图任务排入限流队列
 * @param task 实际 resolveDuplicateThumb 等异步工作
 */
export function enqueueDuplicateThumb<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          const next = waiters.shift();
          if (next) next();
        });
    };
    if (active < MAX_CONCURRENT) run();
    else waiters.push(run);
  });
}
