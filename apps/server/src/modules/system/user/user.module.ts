import { Module, Global } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { UserService } from "./user.service";
import { UserController } from "./user.controller";
import { UserEntity } from "./entities/user.entity";
import { SysUserWithPostEntity } from "./entities/user-post.entity";
import { SysUserWithRoleEntity } from "./entities/user-role.entity";
import { SysRoleEntity } from "../role/entities/role.entity";
import { SysPostEntity } from "../post/entities/post.entity";

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, SysRoleEntity, SysPostEntity, SysUserWithPostEntity, SysUserWithRoleEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get("jwt.secretkey")
      }),
      inject: [ConfigService]
    })
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule {}
