module.exports = {
  apps: [
    {
      name: 'be-food-map',
      script: './dist/src/main.js',
      autorestart: true,
      exec_mode: 'cluster',
      watch: false,
      instances: 2,
      args: '',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.APP_PORT,
      },
      node_args: '--no-warnings',
    },
  ],
};
