import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1751597336874 implements MigrationInterface {
    name = 'Migration1751597336874'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`sys_oper_log\` (\`oper_id\` int NOT NULL AUTO_INCREMENT COMMENT '日志主键', \`title\` varchar(50) NOT NULL COMMENT '模块标题' DEFAULT '', \`business_type\` int NOT NULL COMMENT '业务类型' DEFAULT '0', \`method\` varchar(100) NOT NULL COMMENT '方法名称' DEFAULT '', \`request_method\` varchar(10) NOT NULL COMMENT '请求方式' DEFAULT '', \`operator_type\` int NOT NULL COMMENT '操作类别' DEFAULT '0', \`oper_name\` varchar(50) NOT NULL COMMENT '操作人员' DEFAULT '', \`dept_name\` varchar(50) NOT NULL COMMENT '部门名称' DEFAULT '', \`oper_url\` varchar(255) NOT NULL COMMENT '请求URL' DEFAULT '', \`oper_ip\` varchar(255) NOT NULL COMMENT '主机地址' DEFAULT '', \`oper_location\` varchar(255) NOT NULL COMMENT '操作地点' DEFAULT '', \`oper_param\` varchar(2000) NOT NULL COMMENT '请求参数' DEFAULT '', \`json_result\` varchar(2000) NOT NULL COMMENT '返回参数' DEFAULT '', \`oper_time\` timestamp(6) NOT NULL COMMENT '操作时间' DEFAULT CURRENT_TIMESTAMP(6), \`error_msg\` varchar(2000) NOT NULL COMMENT '错误消息' DEFAULT '', \`cost_time\` int NOT NULL COMMENT '消耗时间' DEFAULT '0', PRIMARY KEY (\`oper_id\`)) ENGINE=InnoDB COMMENT="操作日志记录"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`sys_oper_log\``);
    }

}
