import { IsString, Length, IsOptional } from "class-validator";
import { ApiProperty, PickType } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  userName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(5, 20)
  password: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string; // 验证码

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  uuid?: string; // 验证码唯一标识
}

export class RegisterDto extends PickType(LoginDto, ["userName", "password"] as const) {}

export class TokenVo {
  @ApiProperty({ description: "token" })
  public token: string;
}

export class CaptchaImageVo {
  @ApiProperty({ description: "是否开启验证码" })
  public captchaEnabled: boolean;

  @ApiProperty({ description: "验证码" })
  public img: string;

  @ApiProperty({ description: "验证码唯一标识" })
  public uuid: string;
}

export class RouteMeta {
  @ApiProperty({ description: "菜单名称" })
  title: string;

  @ApiProperty({ description: "菜单图标" })
  icon: string;

  @ApiProperty({ description: "当路由设置了该属性，则会高亮相对应的侧边栏" })
  activeMenu: string;

  @ApiProperty({ description: "是否忽略KeepAlive缓存" })
  noCache: boolean;

  @ApiProperty({ description: "是否外链" })
  link: string;

  @ApiProperty({ description: "页面功能权限", type: [String] })
  perms: string[];
}

export class RoutersVo {
  @ApiProperty({ description: "路由地址" })
  path: string;

  @ApiProperty({ description: "路由名字（必须保持唯一）" })
  name: string;

  @ApiProperty({ description: "是否隐藏该菜单" })
  hidden: boolean;

  @ApiProperty({ description: "路由元信息", type: RouteMeta })
  meta: RouteMeta;

  @ApiProperty({
    description: "路由重定向  当设置 noRedirect 的时候该路由在面包屑导航中不可被点击"
  })
  redirect: string;

  @ApiProperty({ description: "按需加载需要展示的页面" })
  component: string;

  @ApiProperty({ description: "子路由配置项", type: [RoutersVo] })
  children: RoutersVo[];
}

export class DictVo {
  @ApiProperty({ description: "字典值" })
  public dictValue: string;

  @ApiProperty({ description: "字典名称" })
  public dictLabel: string;
}
