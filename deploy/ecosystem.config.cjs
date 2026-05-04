module.exports = {
  apps: [
    {
      name: "facemirror-server",
      script: "./apps/server/dist/index.js",
      cwd: "/srv/facemirror/current",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: 8787,
        DATA_DIR: "/srv/facemirror/shared/server-data"
      }
    }
  ]
};
