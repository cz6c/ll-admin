import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DeptService } from "./dept.service";
import { DeptController } from "./dept.controller";
import { SysDeptEntity } from "./entities/dept.entity";
import { SysRoleWithDeptEntity } from "../role/entities/role-dept.entity";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SysDeptEntity, SysRoleWithDeptEntity])],
  controllers: [DeptController],
  providers: [DeptService],
  exports: [DeptService]
})
export class DeptModule {}
