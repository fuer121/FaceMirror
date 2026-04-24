module.exports = {
  apps: [
    {
      name: "facemirror-server",
      script: "./apps/server/dist/index.js",
      cwd: "/srv/facemirror",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 8787
      }
    }
  ]
};

