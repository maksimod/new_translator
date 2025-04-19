module.exports = {
    apps: [{
      name: "my-app",
      script: "server.js",
      watch: true,
      ignore_watch: ["node_modules"],
      env: {
        "NODE_ENV": "development"
      }
    }]
  }