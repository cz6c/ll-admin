import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { TaskService } from './task.service';
import { RedisLockService } from '../redis/redis-lock.service';
import { TaskEntity } from './entities/task.entity';
import { Logger } from '@nestjs/common';
import { TaskTypeEnum } from '@/common/enum/dict';

// 处理 tasks 队列中作业的工作进程(消费者)
@Processor('tasks')
export class TaskProcessor {
  private readonly logger = new Logger(TaskProcessor.name);
  constructor(
    private readonly taskService: TaskService,
    private readonly lockService: RedisLockService,
  ) {}

  // execute-task 任务处理器
  @Process('execute-task')
  async handleTask(job: Job<{ taskId: number }>) {
    const lockKey = `task_lock_${job.data.taskId}`;

    // 获取分布式锁
    const lock = await this.lockService.acquireLock(lockKey, 30000);
    if (!lock) return;

    const task = await this.taskService.getTask(job.data.taskId);
    try {
      const startTime = Date.now();
      await this.taskService.markTaskExecuting(task.taskId);
      await this.executeTaskLogic(task);
      // 如果是循环任务，更新下次执行时间
      if (task.taskType === TaskTypeEnum.LOOP) {
        await this.taskService.updateExecuteAt(task);
      } else {
        await this.taskService.markTaskCompleted(task.taskId);
      }
      this.logger.log(`任务 ${task.taskId} 执行耗时: ${Date.now() - startTime}ms`);
    } catch (error) {
      this.taskService.markTaskFailed(task.taskId, error);
    } finally {
      await this.lockService.releaseLock(lockKey);
    }
  }

  private async executeTaskLogic(task: TaskEntity) {
    // 实际业务逻辑执行
    this.logger.log(`执行任务 ${task.taskId}: ${task.taskName}`);
    // ...执行逻辑...
    // 模拟耗时操作
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
