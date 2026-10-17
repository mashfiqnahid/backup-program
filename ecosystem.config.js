module.exports = {
  apps: [
    {
      name: 'backup-file-cleaner',
      script: './index.js',
      cwd: 'F:/backup-file-cleaner',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true
    }
  ]
};
