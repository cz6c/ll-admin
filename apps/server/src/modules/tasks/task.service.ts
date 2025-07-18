import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThanOrEqual } from "typeorm";
import { TaskEntity } from "./entities/task.entity";
import CronExpressionParser from "cron-parser";
import { TaskStatusEnum, TaskTypeEnum } from "@/common/enum/dict";
import { CreateTaskDto } from "./dto";
import { RedisLockService } from "../redis/redis-lock.service";
import { SchedulerRegistry } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bullmq";
import { CronJob } from "cron";

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepository: Repository<TaskEntity>,
    private readonly lockService: RedisLockService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectQueue("tasks") private readonly taskQueue: Queue // 注入 tasks 任务队列（生产者）
  ) {}

  // 初始化加载未完成任务
  async onModuleInit() {
    const pendingTask = await this.findPendingTask();
    pendingTask.forEach(task => this.scheduleTask(task));
  }

  // 动态添加任务到调度器
  scheduleTask(task: TaskEntity) {
    const jobName = `job_${task.taskName}`;

    // 存在相同的任务先删除
    if (this.schedulerRegistry.doesExist("cron", jobName)) {
      this.schedulerRegistry.deleteCronJob(jobName);
    }

    const cronTime = task.taskType === TaskTypeEnum.LOOP ? task.cronExpression : task.executeAt;
    // 注册任务
    const job = new CronJob(cronTime, async () => {
      // // 往 tasks 任务队列 增加 execute-task 任务
      await this.taskQueue.add("execute-task", { taskId: task.taskId });
    });
    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
  }

  // 从队列中移除待处理任务
  async removeTask(task: TaskEntity) {
    const jobName = `job_${task.taskName}`;
    this.schedulerRegistry.deleteCronJob(jobName);
    const jobs = await this.taskQueue.getJobs(["waiting", "delayed"]);
    for (const job of jobs) {
      if (job.data.taskId === task.taskId) {
        await job.remove();
      }
    }
  }

  // 删除任务
  public deleteCron(name: string) {
    this.schedulerRegistry.getCronJob(name) && this.schedulerRegistry.deleteCronJob(name);
  }
  // 暂停CronJob
  public async stopCronJob(name: string) {
    await this.schedulerRegistry.getCronJob(name)?.stop();
  }
  // 启动CronJob
  public startCronJob(name: string) {
    this.schedulerRegistry.getCronJob(name)?.start();
  }

  /**
   * 创建新任务
   */
  async createTask(createTaskDto: CreateTaskDto): Promise<TaskEntity> {
    const task = this.taskRepository.create({
      ...createTaskDto,
      taskStatus: TaskStatusEnum.PENDING
    });

    await this.taskRepository.save(task);
    this.logger.log(`创建任务成功 ID: ${task.taskId}`);

    // 添加任务到调度器
    this.scheduleTask(task);

    return task;
  }

  /**
   * 获取所有待处理任务（供调度器初始化使用）
   * 每次调度器启动时，只需加载时间轮当前覆盖的时间段（即未来5分钟）
   * 超出当前时间轮范围的任务，会在后续时间轮周期中加载
   */
  async findPendingTask(): Promise<TaskEntity[]> {
    return this.taskRepository.find({
      where: {
        taskStatus: TaskStatusEnum.PENDING,
        executeAt: LessThanOrEqual(new Date(Date.now() + 300000)) // 未来5分钟之前未完成的任务  executeAt <= now + 5分钟
      },
      order: { executeAt: "ASC" }
    });
  }

  /**
   * 更新下次执行时间
   */
  async updateExecuteAt(task: TaskEntity): Promise<void> {
    const nextExecution = CronExpressionParser.parse(task.cronExpression).next().toDate();
    await this.taskRepository.update(task.taskId, {
      executeAt: nextExecution,
      taskStatus: TaskStatusEnum.PENDING
    });
  }

  /**
   * 标记任务执行
   */
  async markTaskExecuting(taskId: number): Promise<void> {
    await this.taskRepository.update(taskId, {
      taskStatus: TaskStatusEnum.EXECUTING
    });
    this.logger.log(`任务 ${taskId} 开始执行`);
  }

  /**
   * 标记任务完成
   */
  async markTaskCompleted(taskId: number): Promise<void> {
    await this.taskRepository.update(taskId, {
      taskStatus: TaskStatusEnum.COMPLET
    });
    this.logger.log(`任务 ${taskId} 完成`);
  }

  /**
   * 标记任务失败
   */
  async markTaskFailed(taskId: number, error: string): Promise<void> {
    const task = await this.getTask(taskId);

    if (task.retries >= task.maxRetries) {
      await this.taskRepository.update(taskId, {
        taskStatus: TaskStatusEnum.FAIL,
        remark: error
      });
      this.logger.error(`任务 ${taskId} 最终失败: ${error}`);
    } else {
      await this.taskRepository.update(taskId, {
        taskStatus: TaskStatusEnum.PENDING,
        remark: task.remark + "---" + error
      });
      this.scheduleTask(task);
      this.logger.warn(`任务 ${taskId} 失败将重试: ${error}`);
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: number): Promise<void> {
    const lockKey = `task_cancel:${taskId}`;
    const lock = await this.lockService.acquireLock(lockKey, 5000);
    if (!lock) true;

    try {
      const task = await this.getTask(taskId);

      if (task.taskStatus === TaskStatusEnum.EXECUTING) {
        throw new Error("执行中的任务无法取消");
      }

      await this.taskRepository.update(taskId, {
        taskStatus: TaskStatusEnum.FAIL,
        remark: "任务已取消"
      });

      // 从队列中移除待处理任务
      await this.removeTask(task);
    } finally {
      await this.lockService.releaseLock(lockKey);
    }
  }

  /**
   * 获取任务详情
   */
  async getTask(taskId: number): Promise<TaskEntity> {
    const task = await this.taskRepository.findOneBy({ taskId });
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }
    return task;
  }
}
