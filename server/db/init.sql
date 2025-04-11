-- MySQL dump 10.13  Distrib 8.0.33, for Win64 (x86_64)
--
-- Host: localhost    Database: loca_test
-- ------------------------------------------------------
-- Server version	8.0.33
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;

/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;

/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;

/*!50503 SET NAMES utf8mb4 */;

/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;

/*!40103 SET TIME_ZONE='+00:00' */;

/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;

/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;

/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `area`
--
DROP TABLE IF EXISTS `area`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `area` (
    `name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
    `code` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
    `provinceCode` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
    `cityCode` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
    PRIMARY KEY (`code`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '区';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `area`
--
LOCK TABLES `area` WRITE;

/*!40000 ALTER TABLE `area` DISABLE KEYS */;

/*!40000 ALTER TABLE `area` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `city`
--
DROP TABLE IF EXISTS `city`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `city` (
    `name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
    `code` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
    `provinceCode` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
    PRIMARY KEY (`code`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '市';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `city`
--
LOCK TABLES `city` WRITE;

/*!40000 ALTER TABLE `city` DISABLE KEYS */;

/*!40000 ALTER TABLE `city` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `nodemailer_pushlog`
--
DROP TABLE IF EXISTS `nodemailer_pushlog`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `nodemailer_pushlog` (
    `pushlog_id` int NOT NULL AUTO_INCREMENT COMMENT '推送日志id',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `push_status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '推送状态',
    `pushtask_id` int DEFAULT NULL COMMENT '任务ID',
    `pushtask_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '任务名称',
    `accept_email` varchar(200) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '接受邮箱',
    `push_title` varchar(200) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '推送标题',
    `push_content` varchar(200) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '推送内容',
    `remark` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '备注',
    PRIMARY KEY (`pushlog_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '推送日志表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nodemailer_pushlog`
--
LOCK TABLES `nodemailer_pushlog` WRITE;

/*!40000 ALTER TABLE `nodemailer_pushlog` DISABLE KEYS */;

/*!40000 ALTER TABLE `nodemailer_pushlog` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `nodemailer_pushtask`
--
DROP TABLE IF EXISTS `nodemailer_pushtask`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `nodemailer_pushtask` (
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    `del_flag` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '删除标志',
    `create_by` int DEFAULT NULL COMMENT '创建者',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `update_by` int DEFAULT NULL COMMENT '更新者',
    `update_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
    `pushtask_id` int NOT NULL AUTO_INCREMENT COMMENT '任务ID',
    `pushtask_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '任务名称',
    `accept_email` varchar(200) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '接受邮箱',
    `push_title` varchar(200) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '推送标题',
    `push_content` varchar(200) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '推送内容',
    `push_Model` enum ('1', '2') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1' COMMENT '推送类型',
    `push_interval` enum ('1', '2', '3') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1' COMMENT '定期推送间隔',
    `start_date` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '定期推送时间',
    `push_time` datetime DEFAULT NULL COMMENT '按时推送时间',
    `remark` varchar(500) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '备注',
    PRIMARY KEY (`pushtask_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '邮件推送任务表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nodemailer_pushtask`
--
LOCK TABLES `nodemailer_pushtask` WRITE;

/*!40000 ALTER TABLE `nodemailer_pushtask` DISABLE KEYS */;

/*!40000 ALTER TABLE `nodemailer_pushtask` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `province`
--
DROP TABLE IF EXISTS `province`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `province` (
    `name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
    `code` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
    PRIMARY KEY (`code`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '省';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `province`
--
LOCK TABLES `province` WRITE;

/*!40000 ALTER TABLE `province` DISABLE KEYS */;

/*!40000 ALTER TABLE `province` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_config`
--
DROP TABLE IF EXISTS `sys_config`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_config` (
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    `del_flag` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '删除标志',
    `create_by` int DEFAULT NULL COMMENT '创建者',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `update_by` int DEFAULT NULL COMMENT '更新者',
    `update_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
    `config_id` int NOT NULL AUTO_INCREMENT COMMENT '参数主键',
    `config_name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '参数名称',
    `config_key` varchar(100) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '参数键',
    `config_value` varchar(500) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '参数键值',
    `config_type` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1' COMMENT '系统内置',
    `remark` varchar(500) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '备注',
    PRIMARY KEY (`config_id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 4 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '参数配置表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_config`
--
LOCK TABLES `sys_config` WRITE;

/*!40000 ALTER TABLE `sys_config` DISABLE KEYS */;

INSERT INTO
  `sys_config`
VALUES
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:59:10.160491',
    1,
    '账号初始密码',
    'sys.user.initPassword',
    '123456',
    '0',
    '初始化密码 123456'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:59:10.164332',
    2,
    '验证码开关',
    'sys.account.captchaEnabled',
    'TRUE',
    '0',
    '是否开启验证码功能（true开启，false关闭）'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:59:10.166928',
    3,
    '是否开启用户注册功能',
    'sys.account.registerUser',
    'FALSE',
    '0',
    '是否开启注册用户功能（true开启，false关闭）'
  );

/*!40000 ALTER TABLE `sys_config` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_dept`
--
DROP TABLE IF EXISTS `sys_dept`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_dept` (
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    `del_flag` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '删除标志',
    `create_by` int DEFAULT NULL COMMENT '创建者',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `update_by` int DEFAULT NULL COMMENT '更新者',
    `update_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
    `dept_id` int NOT NULL AUTO_INCREMENT COMMENT '部门ID',
    `parent_id` int NOT NULL DEFAULT '0' COMMENT '父部门ID',
    `ancestors` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '祖级列表',
    `dept_name` varchar(30) COLLATE utf8mb4_general_ci NOT NULL COMMENT '部门名称',
    `order_num` int NOT NULL DEFAULT '0' COMMENT '显示顺序',
    `leader` varchar(20) COLLATE utf8mb4_general_ci NOT NULL COMMENT '负责人',
    `phone` varchar(11) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '联系电话',
    `email` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '邮箱',
    PRIMARY KEY (`dept_id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 110 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '部门表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dept`
--
LOCK TABLES `sys_dept` WRITE;

/*!40000 ALTER TABLE `sys_dept` DISABLE KEYS */;

INSERT INTO
  `sys_dept`
VALUES
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.768794',
    100,
    0,
    '0',
    'll-科技',
    0,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.773377',
    101,
    100,
    '0,100',
    '深圳总公司',
    1,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.775866',
    102,
    100,
    '0,100',
    '长沙分公司',
    2,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.778521',
    103,
    101,
    '0,100,101',
    '研发部门',
    1,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.781384',
    104,
    101,
    '0,100,101',
    '市场部门',
    2,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.783268',
    105,
    101,
    '0,100,101',
    '测试部门',
    3,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.785267',
    106,
    101,
    '0,100,101',
    '财务部门',
    4,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.787553',
    107,
    101,
    '0,100,101',
    '运维部门',
    2,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.790829',
    108,
    102,
    '0,100,102',
    '市场部门',
    1,
    'll-admin',
    '15888888888',
    'll@qq.com'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:02.793144',
    109,
    102,
    '0,100,102',
    '财务部门',
    2,
    'll-admin',
    '15888888888',
    'll@qq.com'
  );

/*!40000 ALTER TABLE `sys_dept` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_logininfor`
--
DROP TABLE IF EXISTS `sys_logininfor`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_logininfor` (
    `info_id` int NOT NULL AUTO_INCREMENT COMMENT '访问ID',
    `login_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '访问时间',
    `user_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '用户账号',
    `ipaddr` varchar(128) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '登录IP地址',
    `login_location` varchar(255) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '登录地点',
    `browser` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '浏览器类型',
    `os` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '操作系统',
    `msg` varchar(255) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '提示消息',
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    PRIMARY KEY (`info_id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 3 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '系统访问记录';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_logininfor`
--
LOCK TABLES `sys_logininfor` WRITE;

/*!40000 ALTER TABLE `sys_logininfor` DISABLE KEYS */;

INSERT INTO
  `sys_logininfor`
VALUES
  (
    1,
    '2024-12-12 16:51:47.162764',
    'admin',
    '::1',
    '未知',
    'Chrome 131.0.0',
    'Windows',
    '登录成功',
    '0'
  ),
  (
    2,
    '2024-12-12 17:09:16.902730',
    'admin',
    '::1',
    '未知',
    'Chrome 131.0.0',
    'Windows',
    '登录成功',
    '0'
  );

/*!40000 ALTER TABLE `sys_logininfor` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_menu`
--
DROP TABLE IF EXISTS `sys_menu`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_menu` (
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    `del_flag` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '删除标志',
    `create_by` int DEFAULT NULL COMMENT '创建者',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `update_by` int DEFAULT NULL COMMENT '更新者',
    `update_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
    `menu_id` int NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
    `menu_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '菜单名称',
    `parent_id` int NOT NULL COMMENT '父菜单ID',
    `ancestors` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '祖级列表',
    `order_num` int NOT NULL DEFAULT '0' COMMENT '显示顺序',
    `path` varchar(200) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '路由地址',
    `component` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '组件路径',
    `name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '组件name',
    `active_menu` varchar(255) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '高亮菜单',
    `is_frame` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1' COMMENT '是否为外链',
    `is_cache` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '是否缓存',
    `visible` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '是否显示',
    `icon` varchar(100) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '菜单图标',
    `perm` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '功能权限标识',
    `menu_type` enum ('M', 'F') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'M' COMMENT '菜单类型',
    PRIMARY KEY (`menu_id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 204 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '菜单权限表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_menu`
--
LOCK TABLES `sys_menu` WRITE;

/*!40000 ALTER TABLE `sys_menu` DISABLE KEYS */;

INSERT INTO
  `sys_menu` (
    status,
    del_flag,
    create_by,
    create_time,
    update_by,
    update_time,
    menu_id,
    menu_name,
    parent_id,
    ancestors,
    order_num,
    `path`,
    component,
    name,
    active_menu,
    is_frame,
    is_cache,
    visible,
    icon,
    perm,
    menu_type
  )
VALUES
  (
    '0',
    '0',
    1,
    '2024-08-10 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    1,
    '系统管理',
    0,
    '0',
    1,
    'system',
    '#',
    'System',
    '',
    '1',
    '0',
    '0',
    'system',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-11 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    2,
    '系统监控',
    0,
    '0',
    2,
    'monitor',
    '#',
    'Monitor',
    '',
    '1',
    '0',
    '0',
    'monitor',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-12 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    3,
    'vue官网',
    0,
    '0',
    3,
    'https://cn.vuejs.org',
    '',
    '',
    '',
    '0',
    '0',
    '0',
    'guide',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-13 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    100,
    '用户管理',
    1,
    '0,1',
    1,
    '/system/user',
    'system/user/index',
    'User',
    '',
    '1',
    '0',
    '0',
    'user',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-15 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    101,
    '角色管理',
    1,
    '0,1',
    3,
    '/user/profile',
    'system/user/profile/index',
    'Profile',
    '',
    '1',
    '0',
    '1',
    '#',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-16 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    102,
    '菜单管理',
    1,
    '0,1',
    4,
    '/system/role',
    'system/role/index',
    'Role',
    '',
    '1',
    '0',
    '0',
    'peoples',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-17 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    103,
    '部门管理',
    1,
    '0,1',
    5,
    '/system/menu',
    'system/menu/index',
    'Menu',
    '',
    '1',
    '0',
    '0',
    'tree-table',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-18 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    104,
    '岗位管理',
    1,
    '0,1',
    6,
    '/system/dept',
    'system/dept/index',
    'Dept',
    '',
    '1',
    '0',
    '0',
    'tree',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-19 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    105,
    '字典管理',
    1,
    '0,1',
    7,
    '/system/post',
    'system/post/index',
    'Post',
    '',
    '1',
    '0',
    '0',
    'post',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-20 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    106,
    '参数设置',
    1,
    '0,1',
    8,
    '/system/config',
    'system/config/index',
    'Config',
    '',
    '1',
    '0',
    '0',
    'edit',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-21 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    107,
    '通知公告',
    1,
    '0,1',
    9,
    '/system/notice',
    'system/notice/index',
    'Notice',
    '',
    '1',
    '0',
    '0',
    'message',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-22 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    200,
    '服务监控',
    2,
    '0,1',
    1,
    '/monitor/server',
    'monitor/server/index',
    'Server',
    '',
    '1',
    '0',
    '0',
    'server',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-23 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    201,
    '缓存监控',
    2,
    '0,2',
    2,
    '/monitor/cache',
    'monitor/cache/index',
    'Cache',
    '',
    '1',
    '0',
    '0',
    'redis',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-24 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    202,
    '缓存列表',
    2,
    '0,2',
    3,
    '/monitor/cacheList',
    'monitor/cache/list',
    'Cachelist',
    '',
    '1',
    '0',
    '0',
    'redis-list',
    '',
    'M'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-25 11:32:00',
    NULL,
    '2025-04-01 17:50:23.060501',
    203,
    '登录日志',
    2,
    '0,2',
    4,
    '/monitor/logininfor',
    'monitor/logininfor/index',
    'Logininfor',
    '',
    '1',
    '0',
    '0',
    'logininfor',
    '',
    'M'
  );

/*!40000 ALTER TABLE `sys_menu` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_notice`
--
DROP TABLE IF EXISTS `sys_notice`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_notice` (
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    `del_flag` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '删除标志',
    `create_by` int DEFAULT NULL COMMENT '创建者',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `update_by` int DEFAULT NULL COMMENT '更新者',
    `update_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
    `notice_id` int NOT NULL AUTO_INCREMENT COMMENT '公告ID',
    `notice_title` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '公告标题',
    `notice_type` enum ('1', '2') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1' COMMENT '公告类型',
    `notice_content` longtext COLLATE utf8mb4_general_ci COMMENT '公告内容',
    PRIMARY KEY (`notice_id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 3 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '通知公告表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_notice`
--
LOCK TABLES `sys_notice` WRITE;

/*!40000 ALTER TABLE `sys_notice` DISABLE KEYS */;

INSERT INTO
  `sys_notice`
VALUES
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 17:00:28.446865',
    1,
    '温馨提醒：2021-01-01 新版本发布啦',
    '2',
    '<p>新版本内容112</p>'
  ),
  (
    '1',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 17:00:28.451878',
    2,
    '维护通知：2021-01-01 系统凌晨维护',
    '1',
    '<p>维护内容112</p>'
  );

/*!40000 ALTER TABLE `sys_notice` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_post`
--
DROP TABLE IF EXISTS `sys_post`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_post` (
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    `del_flag` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '删除标志',
    `create_by` int DEFAULT NULL COMMENT '创建者',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `update_by` int DEFAULT NULL COMMENT '更新者',
    `update_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
    `post_id` int NOT NULL AUTO_INCREMENT COMMENT '岗位ID',
    `post_code` varchar(64) COLLATE utf8mb4_general_ci NOT NULL COMMENT '岗位编码',
    `post_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '岗位名称',
    `post_sort` int NOT NULL DEFAULT '0' COMMENT '显示顺序',
    `remark` varchar(500) CHARACTER
    SET
      utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '备注',
      PRIMARY KEY (`post_id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 6 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '岗位信息表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_post`
--
LOCK TABLES `sys_post` WRITE;

/*!40000 ALTER TABLE `sys_post` DISABLE KEYS */;

INSERT INTO
  `sys_post`
VALUES
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:56:28.537100',
    1,
    'ceo',
    '董事长',
    1,
    ''
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:56:28.541037',
    2,
    'se',
    '项目经理',
    2,
    ''
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:56:28.543508',
    3,
    'hr',
    '人力资源',
    3,
    ''
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:56:28.545629',
    4,
    'user',
    '普通员工',
    5,
    ''
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:56:28.549184',
    5,
    'code',
    '技术员',
    4,
    ''
  );

/*!40000 ALTER TABLE `sys_post` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_role`
--
DROP TABLE IF EXISTS `sys_role`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_role` (
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    `del_flag` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '删除标志',
    `create_by` int DEFAULT NULL COMMENT '创建者',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `update_by` int DEFAULT NULL COMMENT '更新者',
    `update_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
    `role_id` int NOT NULL AUTO_INCREMENT COMMENT '角色ID',
    `role_name` varchar(30) COLLATE utf8mb4_general_ci NOT NULL COMMENT '角色名称',
    `role_sort` int NOT NULL DEFAULT '0' COMMENT '显示顺序',
    `role_key` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT '角色权限字符串',
    `data_scope` enum ('1', '2', '3', '4', '5') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1' COMMENT '数据范围',
    `remark` varchar(500) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '备注',
    PRIMARY KEY (`role_id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 3 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '角色信息表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role`
--
LOCK TABLES `sys_role` WRITE;

/*!40000 ALTER TABLE `sys_role` DISABLE KEYS */;

INSERT INTO
  `sys_role`
VALUES
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:52.912763',
    1,
    '超级管理员',
    1,
    'admin',
    '1',
    '超级管理员'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:55:52.917253',
    2,
    '普通角色',
    2,
    'common',
    '2',
    '普通角色'
  );

/*!40000 ALTER TABLE `sys_role` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_role_dept`
--
DROP TABLE IF EXISTS `sys_role_dept`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_role_dept` (
    `role_id` int NOT NULL DEFAULT '0' COMMENT '角色ID',
    `dept_id` int NOT NULL DEFAULT '0' COMMENT '部门ID',
    PRIMARY KEY (`role_id`, `dept_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '角色和部门关联表  角色1-N部门';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role_dept`
--
LOCK TABLES `sys_role_dept` WRITE;

/*!40000 ALTER TABLE `sys_role_dept` DISABLE KEYS */;

/*!40000 ALTER TABLE `sys_role_dept` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_role_menu`
--
DROP TABLE IF EXISTS `sys_role_menu`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_role_menu` (
    `role_id` int NOT NULL DEFAULT '0' COMMENT '角色ID',
    `menu_id` int NOT NULL DEFAULT '0' COMMENT '菜单ID',
    PRIMARY KEY (`role_id`, `menu_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '角色和菜单关联表  角色1-N菜单';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role_menu`
--
LOCK TABLES `sys_role_menu` WRITE;

/*!40000 ALTER TABLE `sys_role_menu` DISABLE KEYS */;

/*!40000 ALTER TABLE `sys_role_menu` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_upload`
--
DROP TABLE IF EXISTS `sys_upload`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_upload` (
    `upload_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '任务Id',
    `size` int NOT NULL COMMENT '文件大小',
    `file_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '文件路径',
    `new_file_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '文件名',
    `url` varchar(255) COLLATE utf8mb4_general_ci NOT NULL COMMENT '文件地址',
    `ext` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '拓展名',
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1' COMMENT '状态',
    PRIMARY KEY (`upload_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '文件上传记录';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_upload`
--
LOCK TABLES `sys_upload` WRITE;

/*!40000 ALTER TABLE `sys_upload` DISABLE KEYS */;

/*!40000 ALTER TABLE `sys_upload` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_user`
--
DROP TABLE IF EXISTS `sys_user`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_user` (
    `status` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '状态',
    `del_flag` enum ('0', '1') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0' COMMENT '删除标志',
    `create_by` int DEFAULT NULL COMMENT '创建者',
    `create_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
    `update_by` int DEFAULT NULL COMMENT '更新者',
    `update_time` datetime (6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
    `user_id` int NOT NULL AUTO_INCREMENT COMMENT '用户ID',
    `dept_id` int DEFAULT NULL COMMENT '部门ID',
    `user_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '用户账号',
    `nick_name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '用户昵称',
    `user_type` enum ('00', '10') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '10' COMMENT '用户类型',
    `email` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '邮箱',
    `phonenumber` varchar(11) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '手机号码',
    `sex` enum ('0', '1', '2') COLLATE utf8mb4_general_ci NOT NULL DEFAULT '2' COMMENT '性别',
    `avatar` varchar(255) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '头像地址',
    `password` varchar(100) CHARACTER
    SET
      utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT '用户登录密码',
      `login_ip` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT '最后登录IP',
      `login_date` timestamp NOT NULL COMMENT '最后登录时间',
      `remark` varchar(500) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '' COMMENT '备注',
      PRIMARY KEY (`user_id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 3 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '用户信息表';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--
LOCK TABLES `sys_user` WRITE;

/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;

INSERT INTO
  `sys_user`
VALUES
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 17:09:16.000000',
    1,
    103,
    'admin',
    'll-admin',
    '00',
    'll@163.com',
    '15888888888',
    '1',
    '',
    '$2b$10$d4Z9Iq.v9J4pjX55I9mzRuPHsOMKLupOqxlb/UfbD9oYsYxd5ezeS',
    '127.0.0.1',
    '2024-12-12 09:09:17',
    '管理员'
  ),
  (
    '0',
    '0',
    1,
    '2024-08-10 09:34:00.000000',
    NULL,
    '2024-12-12 16:53:58.446103',
    2,
    105,
    'test',
    'll-test',
    '00',
    'll@qq.com',
    '15666666666',
    '1',
    '',
    '$2b$10$xR4VuFRGxlN0IRJjaeQeLeAIF/ZmHCDPOCfoFMmnJ8LHbmaPReh4K',
    '127.0.0.1',
    '2024-12-11 03:24:00',
    '测试员'
  );

/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_user_post`
--
DROP TABLE IF EXISTS `sys_user_post`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_user_post` (
    `user_id` int NOT NULL COMMENT '用户ID',
    `post_id` int NOT NULL COMMENT '岗位ID',
    PRIMARY KEY (`user_id`, `post_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '用户与岗位关联表  用户1-N岗位';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_post`
--
LOCK TABLES `sys_user_post` WRITE;

/*!40000 ALTER TABLE `sys_user_post` DISABLE KEYS */;

/*!40000 ALTER TABLE `sys_user_post` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `sys_user_role`
--
DROP TABLE IF EXISTS `sys_user_role`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `sys_user_role` (
    `user_id` int NOT NULL COMMENT '用户ID',
    `role_id` int NOT NULL COMMENT '角色ID',
    PRIMARY KEY (`user_id`, `role_id`)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '用户和角色关联表  用户N-1角色';

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_role`
--
LOCK TABLES `sys_user_role` WRITE;

/*!40000 ALTER TABLE `sys_user_role` DISABLE KEYS */;

INSERT INTO
  `sys_user_role`
VALUES
  (1, 1);

/*!40000 ALTER TABLE `sys_user_role` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Dumping routines for database 'loca_test'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;

/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;

/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;

/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;

/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2024-12-12 17:30:07