import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base';
import { MenuTypeEnum, YesNoEnum } from '@/common/enum/dict';

@Entity('sys_menu', { comment: '菜单权限表' })
export class SysMenuEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'menu_id', comment: '菜单ID' })
  public menuId: number;

  @Column({ type: 'varchar', name: 'menu_name', length: 50, comment: '菜单名称' })
  public menuName: string;

  @Column({ type: 'int', name: 'parent_id', comment: '父菜单ID' })
  public parentId: number;

  @Column({ type: 'int', name: 'order_num', default: 0, comment: '显示顺序' })
  public orderNum: number;

  @Column({ type: 'varchar', name: 'path', length: 200, default: '', comment: '路由地址' })
  public path: string;

  @Column({ type: 'varchar', name: 'component', length: 255, nullable: true, comment: '组件路径' })
  public component: string;

  @Column({ type: 'varchar', name: 'name', length: 50, default: '', comment: '组件name' })
  public name: string;

  @Column({ type: 'varchar', name: 'active_menu', length: 255, default: '', comment: '高亮菜单' })
  public activeMenu: string;

  //是否为外链
  @Column({ type: 'enum', enum: YesNoEnum, default: YesNoEnum.NO, name: 'is_frame', comment: '是否为外链' })
  public isFrame: YesNoEnum;

  //是否缓存
  @Column({ type: 'enum', enum: YesNoEnum, default: YesNoEnum.YES, name: 'is_cache', comment: '是否缓存' })
  public isCache: YesNoEnum;

  //是否显示
  @Column({ type: 'enum', enum: YesNoEnum, default: YesNoEnum.YES, name: 'visible', comment: '是否显示' })
  public visible: YesNoEnum;

  @Column({ type: 'varchar', name: 'icon', length: 100, default: '', comment: '菜单图标' })
  public icon: string;

  @Column({ type: 'varchar', name: 'perm', length: 50, comment: '功能权限标识' })
  public perm: string;

  //菜单类型（M菜单 F按钮）
  @Column({ type: 'enum', enum: MenuTypeEnum, default: MenuTypeEnum.M, name: 'menu_type', comment: '菜单类型' })
  public menuType: MenuTypeEnum;

  @Column({ type: 'varchar', name: 'remark', length: 500, default: '', comment: '备注' })
  public remark: string;
}
