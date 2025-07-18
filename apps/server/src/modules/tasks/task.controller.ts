import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { TaskService } from "./task.service";
import { CreateTaskDto } from "./dto";
import { ResultData } from "@/common/utils/result";
import { ApiBody, ApiOperation } from "@nestjs/swagger";
import { ApiResult } from "@/common/decorator";

@Controller("tasks")
export class TaskController {
  constructor(private readonly tasksService: TaskService) {}

  @ApiOperation({ summary: "任务-创建" })
  @ApiBody({ type: CreateTaskDto })
  @ApiResult()
  @Post()
  async createTask(@Body() createTaskDto: CreateTaskDto) {
    await this.tasksService.createTask(createTaskDto);
    return ResultData.ok();
  }

  @ApiOperation({ summary: "任务-取消" })
  @ApiResult()
  @Get("/delete:id")
  async cancelTask(@Param("id") id: string) {
    await this.tasksService.cancelTask(+id);
    return ResultData.ok();
  }
}
