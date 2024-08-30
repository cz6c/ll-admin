import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base';

// comment: '菜单权限表',
@Entity('sys_menu')
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

  //是否为外链（0是 1否）
  @Column({ type: 'char', name: 'is_frame', default: '1', comment: '是否为外链' })
  public isFrame: string;

  //是否缓存（0是 1否）
  @Column({ type: 'char', name: 'is_cache', default: '0', comment: '是否缓存' })
  public isCache: string;

  //是否显示（0是 1否）
  @Column({ type: 'char', name: 'visible', default: '0', comment: '是否显示' })
  public visible: string;

  @Column({ type: 'varchar', name: 'icon', length: 100, default: '', comment: '菜单图标' })
  public icon: string;

  @Column({ type: 'varchar', name: 'perm', length: 50, comment: '功能权限标识' })
  public perm: string;

  //菜单类型（M菜单 F按钮）
  @Column({ type: 'char', name: 'menu_type', length: 1, default: 'M', comment: '菜单类型' })
  public menuType: string;
}
