module.exports = {
  apps: [
    {
      name: "ava-backend",
      script: "npx",
      args: "tsx src/index.ts",
      cwd: "/root/projects/voice-outreach-demo/backend",
      env: {
        NODE_ENV: "production",
      },
      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      
      // Watch for code changes (dev mode)
      watch: false,
      
      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/log/ava-backend-error.log",
      out_file: "/var/log/ava-backend-out.log",
      merge_logs: true,
      
      // Memory limit (restart if >512MB)
      max_memory_restart: "512M",
    },
  ],
};
