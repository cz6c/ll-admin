-- ----------------------------
-- 1、部门表
-- ----------------------------
drop table if exists sys_dept;
create table sys_dept (
  dept_id           int             not null auto_increment    comment '部门id',
  parent_id         int             default 0                  comment '父部门id',
  ancestors         varchar(50)     default ''                 comment '祖级列表',
  dept_name         varchar(30)     default ''                 comment '部门名称',
  order_num         int(4)          default 0                  comment '显示顺序',
  leader            varchar(20)     default null               comment '负责人',
  phone             varchar(11)     default null               comment '联系电话',
  email             varchar(50)     default null               comment '邮箱',
  status            char(1)         default '0'                comment '部门状态（0正常 1停用）',
  del_flag          char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  create_by         varchar(64)     default ''                 comment '创建者',
  create_time 	    datetime                                   comment '创建时间',
  update_by         varchar(64)     default ''                 comment '更新者',
  update_time       datetime                                   comment '更新时间',
  remark            varchar(500)    default null               comment '备注',
  primary key (dept_id)
) engine=innodb auto_increment=200 comment = '部门表';

-- ----------------------------
-- 初始化-部门表数据
-- ----------------------------
insert into sys_dept values(100,  0,   '0',          'nest-admin科技',   0, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(101,  100, '0,100',      '深圳总公司', 1, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(102,  100, '0,100',      '长沙分公司', 2, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(103,  101, '0,100,101',  '研发部门',   1, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(104,  101, '0,100,101',  '市场部门',   2, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(105,  101, '0,100,101',  '测试部门',   3, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(106,  101, '0,100,101',  '财务部门',   4, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(107,  101, '0,100,101',  '运维部门',   5, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(108,  102, '0,100,102',  '市场部门',   1, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);
insert into sys_dept values(109,  102, '0,100,102',  '财务部门',   2, 'nest-admin', '15888888888', 'ry@qq.com', '0', '0', 'admin', sysdate(), '', null, null);


-- ----------------------------
-- 2、用户信息表
-- ----------------------------
drop table if exists sys_user;
create table sys_user (
  user_id           int             not null auto_increment    comment '用户ID',
  dept_id           int             default null               comment '部门ID',
  user_name         varchar(30)     not null                   comment '用户账号',
  nick_name         varchar(30)     not null                   comment '用户昵称',
  user_type         varchar(2)      default '00'               comment '用户类型（00系统用户）',
  email             varchar(50)     default ''                 comment '用户邮箱',
  phonenumber       varchar(11)     default ''                 comment '手机号码',
  sex               char(1)         default '0'                comment '用户性别（0男 1女 2未知）',
  avatar            varchar(100)    default ''                 comment '头像地址',
  password          varchar(200)    default ''                 comment '密码',
  status            char(1)         default '0'                comment '帐号状态（0正常 1停用）',
  del_flag          char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  login_ip          varchar(128)    default ''                 comment '最后登录IP',
  login_date        datetime                                   comment '最后登录时间',
  create_by         varchar(64)     default ''                 comment '创建者',
  create_time       datetime                                   comment '创建时间',
  update_by         varchar(64)     default ''                 comment '更新者',
  update_time       datetime                                   comment '更新时间',
  remark            varchar(500)    default null               comment '备注',
  primary key (user_id)
) engine=innodb auto_increment=100 comment = '用户信息表';

-- ----------------------------
-- 初始化-用户信息表数据
-- ----------------------------
insert into sys_user values(1,  103, 'admin', 'nest-admin', '00', 'ry@163.com', '15888888888', '1', '', '$2b$10$d4Z9Iq.v9J4pjX55I9mzRuPHsOMKLupOqxlb/UfbD9oYsYxd5ezeS', '0', '0', '127.0.0.1', sysdate(), 'admin', sysdate(), '', null, '管理员');
insert into sys_user values(2,  105, 'ry',    'nest-admin', '00', 'ry@qq.com',  '15666666666', '1', '', '$2b$10$d4Z9Iq.v9J4pjX55I9mzRuPHsOMKLupOqxlb/UfbD9oYsYxd5ezeS', '0', '0', '127.0.0.1', sysdate(), 'admin', sysdate(), '', null, '测试员');


-- ----------------------------
-- 3、岗位信息表
-- ----------------------------
drop table if exists sys_post;
create table sys_post
(
  post_id       int             not null auto_increment    comment '岗位ID',
  post_code     varchar(64)     not null                   comment '岗位编码',
  post_name     varchar(50)     not null                   comment '岗位名称',
  post_sort     int(4)          not null                   comment '显示顺序',
  status        char(1)         not null                   comment '状态（0正常 1停用）',
  create_by     varchar(64)     default ''                 comment '创建者',
  create_time   datetime                                   comment '创建时间',
  update_by     varchar(64)     default ''			       comment '更新者',
  update_time   datetime                                   comment '更新时间',
  remark        varchar(500)    default null               comment '备注',
  del_flag      char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  primary key (post_id)
) engine=innodb comment = '岗位信息表';

-- ----------------------------
-- 初始化-岗位信息表数据
-- ----------------------------
insert into sys_post values(1, 'ceo',  '董事长',    1, '0', 'admin', sysdate(), '', null, '', '0');
insert into sys_post values(2, 'se',   '项目经理',  2, '0', 'admin', sysdate(), '', null, '', '0');
insert into sys_post values(3, 'hr',   '人力资源',  3, '0', 'admin', sysdate(), '', null, '', '0');
insert into sys_post values(4, 'user', '普通员工',  4, '0', 'admin', sysdate(), '', null, '', '0');


-- ----------------------------
-- 4、角色信息表
-- ----------------------------
drop table if exists sys_role;
create table sys_role (
  role_id              int             not null auto_increment    comment '角色ID',
  role_name            varchar(30)     not null                   comment '角色名称',
  role_key             varchar(100)    not null                   comment '角色权限字符串',
  role_sort            int(4)          not null                   comment '显示顺序',
  data_scope           char(1)         default '1'                comment '数据范围（1：全部数据权限 2：自定数据权限 3：本部门数据权限 4：本部门及以下数据权限）',
  menu_check_strictly  tinyint(1)      default 1                  comment '菜单树选择项是否关联显示',
  dept_check_strictly  tinyint(1)      default 1                  comment '部门树选择项是否关联显示',
  status               char(1)         not null                   comment '角色状态（0正常 1停用）',
  del_flag             char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  create_by            varchar(64)     default ''                 comment '创建者',
  create_time          datetime                                   comment '创建时间',
  update_by            varchar(64)     default ''                 comment '更新者',
  update_time          datetime                                   comment '更新时间',
  remark               varchar(500)    default null               comment '备注',
  primary key (role_id)
) engine=innodb auto_increment=100 comment = '角色信息表';

-- ----------------------------
-- 初始化-角色信息表数据
-- ----------------------------
insert into sys_role values('1', '超级管理员',  'admin',  1, 1, 1, 1, '0', '0', 'admin', sysdate(), '', null, '超级管理员');
insert into sys_role values('2', '普通角色',    'common', 2, 2, 1, 1, '0', '0', 'admin', sysdate(), '', null, '普通角色');


-- ----------------------------
-- 5、菜单权限表
-- ----------------------------
drop table if exists sys_menu;
create table sys_menu (
  menu_id           int             not null auto_increment    comment '菜单ID',
  menu_name         varchar(50)     not null                   comment '菜单名称',
  parent_id         int             default 0                  comment '父菜单ID',
  order_num         int(4)          default 0                  comment '显示顺序',
  path              varchar(200)    default ''                 comment '路由地址',
  component         varchar(255)    default null               comment '组件路径',
  active_menu       varchar(255)    default null               comment '高亮菜单',
  is_frame          char(1)         default 1                  comment '是否为外链（0是 1否）',
  is_cache          char(1)         default 0                  comment '是否缓存（0缓存 1不缓存）',
  visible           char(1)         default '0'                comment '菜单状态（0显示 1隐藏）',
  status            char(1)         default '0'                comment '菜单状态（0正常 1停用）',
  icon              varchar(100)    default '#'                comment '菜单图标',
  create_by         varchar(64)     default ''                 comment '创建者',
  create_time       datetime                                   comment '创建时间',
  update_by         varchar(64)     default ''                 comment '更新者',
  update_time       datetime                                   comment '更新时间',
  remark            varchar(500)    default ''                 comment '备注',
  del_flag          char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  primary key (menu_id)
) engine=innodb auto_increment=2000 comment = '菜单权限表';

-- ----------------------------
-- 初始化-菜单信息表数据
-- ----------------------------

-- 一级菜单
INSERT INTO test.sys_menu (menu_id,menu_name,parent_id,order_num,`path`,component,active_menu,is_frame,is_cache,visible,status,icon,create_by,create_time,update_by,update_time,remark,del_flag,name,perm,menu_type) VALUES
	 (1,'系统管理',0,1,'system',NULL,'','1','0','0','0','system','admin','2024-08-10 11:32:59','','2024-08-26 14:11:30.925935','系统管理目录','0','System',NULL,'M'),
	 (2,'系统监控',0,2,'monitor',NULL,'','1','0','0','0','monitor','admin','2024-08-10 11:32:59','','2024-08-26 14:11:30.925935','系统监控目录','0','Monitor',NULL,'M'),
	 (3,'vue官网',0,4,'https://cn.vuejs.org',NULL,'','0','0','0','0','guide','admin','2024-08-10 11:32:59','','2024-09-29 16:55:45','nest-admin官网地址','0','',NULL,'M'),
-- 二级菜单
INSERT INTO test.sys_menu (menu_id,menu_name,parent_id,order_num,`path`,component,active_menu,is_frame,is_cache,visible,status,icon,create_by,create_time,update_by,update_time,remark,del_flag,name,perm,menu_type) VALUES
	 (100,'用户管理',1,1,'/system/user','system/user/index','','1','0','0','0','user','admin','2024-08-10 11:32:59','','2024-09-20 19:22:05.797452','用户管理菜单','0','User',NULL,'M'),
	 (2049,'个人中心',1,1,'/user/profile','system/user/profile/index','','1','0','1','0','#','','2024-09-29 17:27:13.747106','','2024-09-29 17:27:45',NULL,'0','Profile','','M');
	 (2010,'分配角色',1,1,'/system/user/authRole','system/user/authRole','/system/user','1','1','1','0','#','','2024-09-20 17:43:03.434104','','2024-09-20 19:24:40.101635',NULL,'0','AuthRole','','M'),
	 (101,'角色管理',1,2,'/system/role','system/role/index','','1','0','0','0','peoples','admin','2024-08-10 11:32:59','','2024-09-20 19:22:05.802410','角色管理菜单','0','Role',NULL,'M'),
	 (2011,'分配用户',1,2,'/system/role/authUser','system/role/authUser','/system/role','1','0','1','0','#','','2024-09-26 16:11:46.165263','','2024-09-26 16:13:05',NULL,'0','AuthUser','','M'),
	 (102,'菜单管理',1,3,'/system/menu','system/menu/index','','1','0','0','0','tree-table','admin','2024-08-10 11:32:59','','2024-09-20 19:22:05.806721','菜单管理菜单','0','Menu','','M'),
	 (103,'部门管理',1,4,'/system/dept','system/dept/index','','1','0','0','0','tree','admin','2024-08-10 11:32:59','','2024-09-20 19:22:05.809633','部门管理菜单','0','Dept',NULL,'M'),
	 (104,'岗位管理',1,5,'/system/post','system/post/index','','1','0','0','0','post','admin','2024-08-10 11:32:59','','2024-09-20 19:22:05.812455','岗位管理菜单','0','Post',NULL,'M'),
	 (105,'字典管理',1,6,'/system/dict','system/dict/index','','1','0','0','0','dict','admin','2024-08-10 11:32:59','','2024-09-20 19:22:05.815106','字典管理菜单','0','Dict',NULL,'M'),
	 (2012,'字典数据',1,6,'/system/dict/data','system/dict/data','/system/dict','1','0','1','0','#','','2024-09-29 15:03:10.718292','','2024-09-29 15:03:18',NULL,'0','DictData','','M'),
	 (106,'参数设置',1,7,'/system/config','system/config/index','','1','0','0','0','edit','admin','2024-08-10 11:32:59','','2024-09-20 19:22:05.818103','参数设置菜单','0','Config',NULL,'M');
	 (107,'通知公告',1,8,'/system/notice','system/notice/index','','1','0','0','0','message','admin','2024-08-10 11:32:59','','2024-09-20 19:22:05.821470','通知公告菜单','0','Notice',NULL,'M'),
	 (109,'在线用户',2,1,'/monitor/online','monitor/online/index','','1','0','0','0','online','admin','2024-08-10 11:32:59','','2024-09-20 19:22:49.331259','在线用户菜单','0','Online',NULL,'M'),
	 (112,'服务监控',2,4,'/monitor/server','monitor/server/index','','1','0','0','0','server','admin','2024-08-10 11:32:59','','2024-09-20 20:27:15.409699','服务监控菜单','0','Server',NULL,'M'),
	 (113,'缓存监控',2,5,'/monitor/cache','monitor/cache/index','','1','0','0','0','redis','admin','2024-08-10 11:32:59','','2024-09-20 20:27:15.415829','缓存监控菜单','0','Cache',NULL,'M'),
	 (114,'缓存列表',2,6,'/monitor/cacheList','monitor/cache/list','','1','0','0','0','redis-list','admin','2024-08-10 11:32:59','','2024-09-20 20:27:15.418995','缓存列表菜单','0','Cachelist',NULL,'M'),
	 (500,'操作日志',2,1,'/monitor/operlog','monitor/operlog/index','','1','0','0','0','form','admin','2024-08-10 11:32:59','','2024-09-20 20:27:15.422445','操作日志菜单','0','Operlog',NULL,'M'),
	 (501,'登录日志',2,2,'/monitor/logininfor','monitor/logininfor/index','','1','0','0','0','logininfor','admin','2024-08-10 11:32:59','','2024-09-20 20:27:15.425662','登录日志菜单','0','Logininfor',NULL,'M'),
-- 按钮权限
INSERT INTO test.sys_menu (menu_id,menu_name,parent_id,order_num,`path`,component,active_menu,is_frame,is_cache,visible,status,icon,create_by,create_time,update_by,update_time,remark,del_flag,name,perm,menu_type) VALUES
	 (2002,'新增',102,0,'',NULL,'','1','0','0','0','#','','2024-08-27 09:41:18.899954','','2024-08-27 09:50:21.936600',NULL,'0','','add','F'),
	 (2003,'编辑',102,0,'',NULL,'','1','0','0','0','#','','2024-08-27 09:52:59.584458','','2024-08-27 09:52:59.584458',NULL,'0','','edit','F'),
	 (2004,'删除',102,0,'',NULL,'','1','0','0','0','#','','2024-08-27 09:53:24.731894','','2024-08-30 15:08:26',NULL,'0','','remove','F');
	 (2005,'功能',102,0,'',NULL,'','1','0','0','0','#','','2024-08-27 09:55:47.403263','','2024-08-27 10:13:42',NULL,'1','','perm','F'),
	 (2006,'新增',100,0,'','','','1','0','0','0','#','','2024-08-30 16:28:52.804010','','2024-08-30 16:28:52.804010',NULL,'0','','add','F'),
	 (2007,'修改',100,0,'','','','1','0','0','0','#','','2024-08-30 16:29:06.573919','','2024-08-30 16:29:06.573919',NULL,'0','','edit','F'),
	 (2008,'删除',100,0,'','','','1','0','0','0','#','','2024-08-30 16:29:20.217915','','2024-09-29 16:41:17',NULL,'0','','remove','F'),
	 (2009,'分配角色',100,0,'','','','1','0','0','0','#','','2024-08-30 16:30:49.039120','','2024-08-30 16:30:49.039120',NULL,'0','','useRole','F'),
	 (2013,'新增',101,0,'','','','1','0','0','0','#','','2024-09-29 16:19:02.975338','','2024-09-29 16:19:02.975338',NULL,'0','','add','F'),
	 (2014,'导入',100,0,'','','','1','0','0','0','#','','2024-09-29 16:41:30.650394','','2024-09-29 16:41:30.650394',NULL,'0','','import','F');
	 (2015,'导出',100,0,'','','','1','0','0','0','#','','2024-09-29 16:41:35.740903','','2024-09-29 16:41:35.740903',NULL,'0','','export','F'),
	 (2016,'重置密码',100,0,'','','','1','0','0','0','#','','2024-09-29 16:41:57.401303','','2024-09-29 16:41:57.401303',NULL,'0','','resetPwd','F'),
	 (2017,'编辑',101,0,'','','','1','0','0','0','#','','2024-09-29 16:42:34.485468','','2024-09-29 16:42:34.485468',NULL,'0','','edit','F'),
	 (2018,'删除',101,0,'','','','1','0','0','0','#','','2024-09-29 16:42:40.571573','','2024-09-29 16:42:40.571573',NULL,'0','','remove','F'),
	 (2019,'导出',101,0,'','','','1','0','0','0','#','','2024-09-29 16:42:50.438517','','2024-09-29 16:42:50.438517',NULL,'0','','export','F'),
	 (2020,'分配用户',101,0,'','','','1','0','0','0','#','','2024-09-29 16:45:26.226282','','2024-09-29 16:45:26.226282',NULL,'0','','authUser','F'),
	 (2021,'新增',104,0,'','','','1','0','0','0','#','','2024-09-29 16:46:41.497228','','2024-09-29 16:46:41.497228',NULL,'0','','add','F'),
	 (2022,'编辑',104,0,'','','','1','0','0','0','#','','2024-09-29 16:46:46.157708','','2024-09-29 16:46:46.157708',NULL,'0','','edit','F'),
	 (2023,'删除',104,0,'','','','1','0','0','0','#','','2024-09-29 16:46:50.462564','','2024-09-29 16:46:50.462564',NULL,'0','','remove','F'),
	 (2024,'导出',104,0,'','','','1','0','0','0','#','','2024-09-29 16:47:00.509214','','2024-09-29 16:47:00.509214',NULL,'0','','export','F');
	 (2025,'新增',107,0,'','','','1','0','0','0','#','','2024-09-29 16:47:23.008759','','2024-09-29 16:47:23.008759',NULL,'0','','add','F'),
	 (2026,'编辑',107,0,'','','','1','0','0','0','#','','2024-09-29 16:47:26.944002','','2024-09-29 16:47:26.944002',NULL,'0','','edit','F'),
	 (2027,'删除',107,0,'','','','1','0','0','0','#','','2024-09-29 16:47:31.149596','','2024-09-29 16:47:31.149596',NULL,'0','','remove','F'),
	 (2028,'新增',105,0,'','','','1','0','0','0','#','','2024-09-29 16:50:02.372923','','2024-09-29 16:50:02.372923',NULL,'0','','add','F'),
	 (2029,'编辑',105,0,'','','','1','0','0','0','#','','2024-09-29 16:50:07.106857','','2024-09-29 16:50:07.106857',NULL,'0','','edit','F'),
	 (2030,'删除',105,0,'','','','1','0','0','0','#','','2024-09-29 16:50:12.108135','','2024-09-29 16:50:12.108135',NULL,'0','','remove','F'),
	 (2031,'导出',105,0,'','','','1','0','0','0','#','','2024-09-29 16:50:16.491943','','2024-09-29 16:50:16.491943',NULL,'0','','export','F'),
	 (2032,'新增',2012,0,'','','','1','0','0','0','#','','2024-09-29 16:50:31.830027','','2024-09-29 16:50:31.830027',NULL,'0','','add','F'),
	 (2033,'编辑',2012,0,'','','','1','0','0','0','#','','2024-09-29 16:50:35.639049','','2024-09-29 16:50:35.639049',NULL,'0','','edit','F'),
	 (2034,'删除',2012,0,'','','','1','0','0','0','#','','2024-09-29 16:50:52.391401','','2024-09-29 16:50:52.391401',NULL,'0','','remove','F');
	 (2035,'导出',2012,0,'','','','1','0','0','0','#','','2024-09-29 16:50:58.414496','','2024-09-29 16:50:58.414496',NULL,'0','','export','F'),
	 (2036,'新增',103,0,'','','','1','0','0','0','#','','2024-09-29 16:51:28.030890','','2024-09-29 16:51:28.030890',NULL,'0','','add','F'),
	 (2037,'编辑',103,0,'','','','1','0','0','0','#','','2024-09-29 16:51:32.548637','','2024-09-29 16:51:32.548637',NULL,'0','','edit','F'),
	 (2038,'新增',106,0,'','','','1','0','0','0','#','','2024-09-29 16:51:45.824117','','2024-09-29 16:51:45.824117',NULL,'0','','add','F'),
	 (2039,'编辑',106,0,'','','','1','0','0','0','#','','2024-09-29 16:51:49.549005','','2024-09-29 16:51:49.549005',NULL,'0','','edit','F'),
	 (2040,'删除',106,0,'','','','1','0','0','0','#','','2024-09-29 16:51:53.976016','','2024-09-29 16:51:53.976016',NULL,'0','','remove','F'),
	 (2041,'导出',106,0,'','','','1','0','0','0','#','','2024-09-29 16:52:05.021785','','2024-09-29 16:52:05.021785',NULL,'0','','export','F'),
	 (2042,'删除',500,0,'','','','1','0','0','0','#','','2024-09-29 16:53:00.512698','','2024-09-29 16:53:00.512698',NULL,'0','','remove','F'),
	 (2043,'导出',500,0,'','','','1','0','0','0','#','','2024-09-29 16:53:04.926045','','2024-09-29 16:53:04.926045',NULL,'0','','export','F'),
	 (2044,'查询',500,0,'','','','1','0','0','0','#','','2024-09-29 16:53:09.582669','','2024-09-29 16:53:09.582669',NULL,'0','','query','F');
	 (2045,'强退',109,0,'','','','1','0','0','0','#','','2024-09-29 16:53:39.205755','','2024-09-29 16:53:39.205755',NULL,'0','','forceLogout','F'),
	 (2046,'删除',501,0,'','','','1','0','0','0','#','','2024-09-29 16:53:58.597305','','2024-09-29 16:53:58.597305',NULL,'0','','remove','F'),
	 (2047,'导出',501,0,'','','','1','0','0','0','#','','2024-09-29 16:54:08.936721','','2024-09-29 16:54:08.936721',NULL,'0','','export','F'),
	 (2048,'解锁',501,0,'','','','1','0','0','0','#','','2024-09-29 16:54:23.160430','','2024-09-29 16:54:23.160430',NULL,'0','','unlock','F'),

-- ----------------------------
-- 6、用户和角色关联表  用户N-1角色
-- ----------------------------
drop table if exists sys_user_role;
create table sys_user_role (
  user_id   int        not null comment '用户ID',
  role_id   int        not null comment '角色ID',
  primary key(user_id, role_id)
) engine=innodb comment = '用户和角色关联表';

-- ----------------------------
-- 初始化-用户和角色关联表数据
-- ----------------------------
insert into sys_user_role values ('1', '1');
insert into sys_user_role values ('2', '2');


-- ----------------------------
-- 7、角色和菜单关联表  角色1-N菜单
-- ----------------------------
drop table if exists sys_role_menu;
create table sys_role_menu (
  role_id   int        not null comment '角色ID',
  menu_id   int        not null comment '菜单ID',
  primary key(role_id, menu_id)
) engine=innodb comment = '角色和菜单关联表';

-- ----------------------------
-- 初始化-角色和菜单关联表数据
-- ----------------------------
insert into sys_role_menu values ('2', '1');
insert into sys_role_menu values ('2', '2');
insert into sys_role_menu values ('2', '3');
insert into sys_role_menu values ('2', '4');
insert into sys_role_menu values ('2', '100');
insert into sys_role_menu values ('2', '101');
insert into sys_role_menu values ('2', '102');
insert into sys_role_menu values ('2', '103');
insert into sys_role_menu values ('2', '104');
insert into sys_role_menu values ('2', '105');
insert into sys_role_menu values ('2', '106');
insert into sys_role_menu values ('2', '107');
insert into sys_role_menu values ('2', '108');
insert into sys_role_menu values ('2', '109');
insert into sys_role_menu values ('2', '110');
insert into sys_role_menu values ('2', '111');
insert into sys_role_menu values ('2', '112');
insert into sys_role_menu values ('2', '113');
insert into sys_role_menu values ('2', '114');
insert into sys_role_menu values ('2', '115');
insert into sys_role_menu values ('2', '116');
insert into sys_role_menu values ('2', '117');
insert into sys_role_menu values ('2', '500');
insert into sys_role_menu values ('2', '501');

-- ----------------------------
-- 8、角色和部门关联表  角色1-N部门
-- ----------------------------
drop table if exists sys_role_dept;
create table sys_role_dept (
  role_id   int        not null comment '角色ID',
  dept_id   int        not null comment '部门ID',
  primary key(role_id, dept_id)
) engine=innodb comment = '角色和部门关联表';

-- ----------------------------
-- 初始化-角色和部门关联表数据
-- ----------------------------
insert into sys_role_dept values ('2', '100');
insert into sys_role_dept values ('2', '101');
insert into sys_role_dept values ('2', '105');


-- ----------------------------
-- 9、用户与岗位关联表  用户1-N岗位
-- ----------------------------
drop table if exists sys_user_post;
create table sys_user_post
(
  user_id   int        not null comment '用户ID',
  post_id   int        not null comment '岗位ID',
  primary key (user_id, post_id)
) engine=innodb comment = '用户与岗位关联表';

-- ----------------------------
-- 初始化-用户与岗位关联表数据
-- ----------------------------
insert into sys_user_post values ('1', '1');
insert into sys_user_post values ('2', '2');


-- ----------------------------
-- 10、操作日志记录
-- ----------------------------
drop table if exists sys_oper_log;
create table sys_oper_log (
  oper_id           int             not null auto_increment    comment '日志主键',
  title             varchar(50)     default ''                 comment '模块标题',
  business_type     int(2)          default 0                  comment '业务类型（0其它 1新增 2修改 3删除）',
  method            varchar(100)    default ''                 comment '方法名称',
  request_method    varchar(10)     default ''                 comment '请求方式',
  operator_type     char(1)          default 0                  comment '操作类别（0其它 1后台用户 2手机端用户）',
  oper_name         varchar(50)     default ''                 comment '操作人员',
  dept_name         varchar(50)     default ''                 comment '部门名称',
  oper_url          varchar(255)    default ''                 comment '请求URL',
  oper_ip           varchar(128)    default ''                 comment '主机地址',
  oper_location     varchar(255)    default ''                 comment '操作地点',
  oper_param        varchar(2000)   default ''                 comment '请求参数',
  json_result       varchar(2000)   default ''                 comment '返回参数',
  status            char(1)         default '0'                comment '操作状态（0正常 1异常）',
  error_msg         varchar(2000)   default ''                 comment '错误消息',
  oper_time         datetime                                   comment '操作时间',
  cost_time         int             default 0                  comment '消耗时间',
  primary key (oper_id),
  key idx_sys_oper_log_bt (business_type),
  key idx_sys_oper_log_s  (status),
  key idx_sys_oper_log_ot (oper_time)
) engine=innodb auto_increment=100 comment = '操作日志记录';


-- ----------------------------
-- 11、字典类型表
-- ----------------------------
drop table if exists sys_dict_type;
create table sys_dict_type
(
  dict_id          int             not null auto_increment    comment '字典主键',
  dict_name        varchar(100)    default ''                 comment '字典名称',
  dict_type        varchar(100)    default ''                 comment '字典类型',
  status           char(1)         default '0'                comment '状态（0正常 1停用）',
  create_by        varchar(64)     default ''                 comment '创建者',
  create_time      datetime                                   comment '创建时间',
  update_by        varchar(64)     default ''                 comment '更新者',
  update_time      datetime                                   comment '更新时间',
  remark           varchar(500)    default null               comment '备注',
  del_flag         char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  primary key (dict_id),
  unique (dict_type)
) engine=innodb auto_increment=100 comment = '字典类型表';

insert into sys_dict_type values(1,  '用户性别', 'sys_user_sex',        '0', 'admin', sysdate(), '', null, '用户性别', '0');
insert into sys_dict_type values(2,  '显示状态', 'sys_show_hide',       '0', 'admin', sysdate(), '', null, '菜单显示状态', '0');
insert into sys_dict_type values(3,  '系统开关', 'sys_normal_disable',  '0', 'admin', sysdate(), '', null, '系统开关', '0');
insert into sys_dict_type values(4,  '系统状态', 'sys_success_error',   '0', 'admin', sysdate(), '', null, '系统状态', '0');
insert into sys_dict_type values(6,  '系统是否', 'sys_yes_no',          '0', 'admin', sysdate(), '', null, '系统是否', '0');
insert into sys_dict_type values(7,  '通知类型', 'sys_notice_type',     '0', 'admin', sysdate(), '', null, '通知类型列表', '0');
insert into sys_dict_type values(8,  '通知状态', 'sys_notice_status',   '0', 'admin', sysdate(), '', null, '通知状态列表', '0');
insert into sys_dict_type values(9,  '操作类型', 'sys_oper_type',       '0', 'admin', sysdate(), '', null, '操作类型列表', '0');


-- ----------------------------
-- 12、字典数据表
-- ----------------------------
drop table if exists sys_dict_data;
create table sys_dict_data
(
  dict_code        int             not null auto_increment    comment '字典编码',
  dict_sort        int(4)          default 0                  comment '字典排序',
  dict_label       varchar(100)    default ''                 comment '字典标签',
  dict_value       varchar(100)    default ''                 comment '字典键值',
  dict_type        varchar(100)    default ''                 comment '字典类型',
  css_class        varchar(100)    default null               comment '样式属性（其他样式扩展）',
  list_class       varchar(100)    default null               comment '表格回显样式',
  is_default       char(1)         default 'N'                comment '是否默认（Y是 N否）',
  status           char(1)         default '0'                comment '状态（0正常 1停用）',
  create_by        varchar(64)     default ''                 comment '创建者',
  create_time      datetime                                   comment '创建时间',
  update_by        varchar(64)     default ''                 comment '更新者',
  update_time      datetime                                   comment '更新时间',
  remark           varchar(500)    default null               comment '备注',
  del_flag         char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  primary key (dict_code)
) engine=innodb auto_increment=100 comment = '字典数据表';

insert into sys_dict_data values(1,  1,  '男',       '0',       'sys_user_sex',        '',   '',        'Y', '0', 'admin', sysdate(), '', null, '性别男', '0');
insert into sys_dict_data values(2,  2,  '女',       '1',       'sys_user_sex',        '',   '',        'N', '0', 'admin', sysdate(), '', null, '性别女', '0');
insert into sys_dict_data values(3,  3,  '未知',     '2',       'sys_user_sex',        '',   '',        'N', '0', 'admin', sysdate(), '', null, '性别未知', '0');
insert into sys_dict_data values(4,  1,  '显示',     '0',       'sys_show_hide',       '',   'primary', 'Y', '0', 'admin', sysdate(), '', null, '显示状态', '0');
insert into sys_dict_data values(5,  2,  '隐藏',     '1',       'sys_show_hide',       '',   'danger',  'N', '0', 'admin', sysdate(), '', null, '隐藏状态', '0');
insert into sys_dict_data values(6,  1,  '正常',     '0',       'sys_normal_disable',  '',   'primary', 'Y', '0', 'admin', sysdate(), '', null, '正常状态', '0');
insert into sys_dict_data values(7,  2,  '停用',     '1',       'sys_normal_disable',  '',   'danger',  'N', '0', 'admin', sysdate(), '', null, '停用状态', '0');
insert into sys_dict_data values(12, 1,  '是',       'Y',       'sys_yes_no',          '',   'primary', 'Y', '0', 'admin', sysdate(), '', null, '是', '0');
insert into sys_dict_data values(13, 2,  '否',       'N',       'sys_yes_no',          '',   'danger',  'N', '0', 'admin', sysdate(), '', null, '否', '0');
insert into sys_dict_data values(14, 1,  '通知',     '1',       'sys_notice_type',     '',   'warning', 'Y', '0', 'admin', sysdate(), '', null, '通知', '0');
insert into sys_dict_data values(15, 2,  '公告',     '2',       'sys_notice_type',     '',   'success', 'N', '0', 'admin', sysdate(), '', null, '公告', '0');
insert into sys_dict_data values(16, 1,  '正常',     '0',       'sys_notice_status',   '',   'primary', 'Y', '0', 'admin', sysdate(), '', null, '正常状态', '0');
insert into sys_dict_data values(17, 2,  '关闭',     '1',       'sys_notice_status',   '',   'danger',  'N', '0', 'admin', sysdate(), '', null, '关闭状态', '0');
insert into sys_dict_data values(18, 99, '其他',     '0',       'sys_oper_type',       '',   'info',    'N', '0', 'admin', sysdate(), '', null, '其他操作', '0');
insert into sys_dict_data values(19, 1,  '新增',     '1',       'sys_oper_type',       '',   'info',    'N', '0', 'admin', sysdate(), '', null, '新增操作', '0');
insert into sys_dict_data values(20, 2,  '修改',     '2',       'sys_oper_type',       '',   'info',    'N', '0', 'admin', sysdate(), '', null, '修改操作', '0');
insert into sys_dict_data values(21, 3,  '删除',     '3',       'sys_oper_type',       '',   'danger',  'N', '0', 'admin', sysdate(), '', null, '删除操作', '0');
insert into sys_dict_data values(22, 4,  '授权',     '4',       'sys_oper_type',       '',   'primary', 'N', '0', 'admin', sysdate(), '', null, '授权操作', '0');
insert into sys_dict_data values(23, 5,  '导出',     '5',       'sys_oper_type',       '',   'warning', 'N', '0', 'admin', sysdate(), '', null, '导出操作', '0');
insert into sys_dict_data values(24, 6,  '导入',     '6',       'sys_oper_type',       '',   'warning', 'N', '0', 'admin', sysdate(), '', null, '导入操作', '0');
insert into sys_dict_data values(25, 7,  '强退',     '7',       'sys_oper_type',       '',   'danger',  'N', '0', 'admin', sysdate(), '', null, '强退操作', '0');
insert into sys_dict_data values(26, 8,  '生成代码', '8',       'sys_oper_type',       '',   'warning', 'N', '0', 'admin', sysdate(), '', null, '生成操作', '0');
insert into sys_dict_data values(27, 9,  '清空数据', '9',       'sys_oper_type',       '',   'danger',  'N', '0', 'admin', sysdate(), '', null, '清空操作', '0');
insert into sys_dict_data values(28, 1,  '成功',     '0',       'sys_success_error',   '',   'primary', 'N', '0', 'admin', sysdate(), '', null, '成功状态', '0');
insert into sys_dict_data values(29, 2,  '失败',     '1',       'sys_success_error',   '',   'danger',  'N', '0', 'admin', sysdate(), '', null, '失败状态', '0');


-- ----------------------------
-- 13、参数配置表
-- ----------------------------
drop table if exists sys_config;
create table sys_config (
  config_id         int(5)          not null auto_increment    comment '参数主键',
  config_name       varchar(100)    default ''                 comment '参数名称',
  config_key        varchar(100)    default ''                 comment '参数键名',
  config_value      varchar(500)    default ''                 comment '参数键值',
  config_type       char(1)         default 'N'                comment '系统内置（Y是 N否）',
  create_by         varchar(64)     default ''                 comment '创建者',
  create_time       datetime                                   comment '创建时间',
  update_by         varchar(64)     default ''                 comment '更新者',
  update_time       datetime                                   comment '更新时间',
  remark            varchar(500)    default null               comment '备注',
  status            char(1)         default '0'                comment '状态（0正常 1停用）',
  del_flag          char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  primary key (config_id)
) engine=innodb auto_increment=100 comment = '参数配置表';

insert into sys_config values(1, '主框架页-默认皮肤样式名称',     'sys.index.skinName',            'skin-blue',     'Y', 'admin', sysdate(), '', null, '蓝色 skin-blue、绿色 skin-green、紫色 skin-purple、红色 skin-red、黄色 skin-yellow', '0', '0');
insert into sys_config values(2, '用户管理-账号初始密码',         'sys.user.initPassword',         '123456',        'Y', 'admin', sysdate(), '', null, '初始化密码 123456', '0', '0');
insert into sys_config values(3, '主框架页-侧边栏主题',           'sys.index.sideTheme',           'theme-dark',    'Y', 'admin', sysdate(), '', null, '深色主题theme-dark，浅色主题theme-light', '0', '0');
insert into sys_config values(4, '账号自助-验证码开关',           'sys.account.captchaEnabled',    'true',          'Y', 'admin', sysdate(), '', null, '是否开启验证码功能（true开启，false关闭）', '0', '0');
insert into sys_config values(5, '账号自助-是否开启用户注册功能', 'sys.account.registerUser',      'false',         'Y', 'admin', sysdate(), '', null, '是否开启注册用户功能（true开启，false关闭）', '0', '0');
insert into sys_config values(6, '用户登录-黑名单列表',           'sys.login.blackIPList',         '',              'Y', 'admin', sysdate(), '', null, '设置登录IP黑名单限制，多个匹配项以;分隔，支持匹配（*通配、网段）', '0', '0');


-- ----------------------------
-- 14、系统访问记录
-- ----------------------------
drop table if exists sys_logininfor;
create table sys_logininfor (
  info_id        int            not null auto_increment   comment '访问ID',
  user_name      varchar(50)    default ''                comment '用户账号',
  ipaddr         varchar(128)   default ''                comment '登录IP地址',
  login_location varchar(255)   default ''                comment '登录地点',
  browser        varchar(50)    default ''                comment '浏览器类型',
  os             varchar(50)    default ''                comment '操作系统',
  status         char(1)        default '0'               comment '登录状态（0成功 1失败）',
  msg            varchar(255)   default ''                comment '提示消息',
  login_time     datetime                                 comment '访问时间',
  create_by      varchar(64)     default ''               comment '创建者',
  create_time    datetime                                 comment '创建时间',
  update_by      varchar(64)     default ''               comment '更新者',
  update_time    datetime                                 comment '更新时间',
  remark         varchar(500)    default null             comment '备注',
  del_flag       char(1)         default '0'              comment '删除标志（0代表存在 1代表删除）',
  primary key (info_id),
  key idx_sys_logininfor_s  (status),
  key idx_sys_logininfor_lt (login_time)
) engine=innodb auto_increment=100 comment = '系统访问记录';


-- ----------------------------
-- 15、通知公告表
-- ----------------------------
drop table if exists sys_notice;
create table sys_notice (
  notice_id         int(4)          not null auto_increment    comment '公告ID',
  notice_title      varchar(50)     not null                   comment '公告标题',
  notice_type       char(1)         not null                   comment '公告类型（1通知 2公告）',
  notice_content    longtext        default null               comment '公告内容',
  status            char(1)         default '0'                comment '公告状态（0正常 1关闭）',
  create_by         varchar(64)     default ''                 comment '创建者',
  create_time       datetime                                   comment '创建时间',
  update_by         varchar(64)     default ''                 comment '更新者',
  update_time       datetime                                   comment '更新时间',
  remark            varchar(255)    default null               comment '备注',
  del_flag          char(1)         default '0'                comment '删除标志（0代表存在 1代表删除）',
  primary key (notice_id)
) engine=innodb auto_increment=10 comment = '通知公告表';

-- ----------------------------
-- 初始化-公告信息表数据
-- ----------------------------
insert into sys_notice values('1', '温馨提醒：2018-07-01 nest-admin新版本发布啦', '2', '新版本内容', '0', 'admin', sysdate(), '', null, '管理员', '0');
insert into sys_notice values('2', '维护通知：2018-07-01 nest-admin系统凌晨维护', '1', '维护内容',   '0', 'admin', sysdate(), '', null, '管理员', '0');
