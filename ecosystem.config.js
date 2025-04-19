module.exports = {
  apps: [{
    name: "speech-translator",
    script: "node_modules/nodemon/bin/nodemon.js",
    args: "server.js",
    instances: 1,
    autorestart: true,
    watch: true,
    ignore_watch: ["node_modules", "public", "temp"],
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "development"
    }
  }]
} 