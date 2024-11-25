module.exports = {
  apps: [
    {
      name: 'll_api',
      script: './dist/main.js',
      instances: 3, // 启用多少个实例
      exec_mode: 'cluster', // 应用程序启动模式，这里设置的是cluster_mode（集群），默认是fork
      max_restarts: 10, // 设置应用程序异常退出重启的次数，默认15次（从0开始计数）
      restart_delay: 5000, // 异常重启情况下，延时重启时间
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      combine_logs: true,
      log_file: './logs/combined.outerr.log', // 日志目录
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
