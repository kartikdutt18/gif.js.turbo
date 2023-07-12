const config = require('./webpack.base.config');
const { merge } = require('webpack-merge');
const path = require('path');

module.exports = merge(config, {
  entry: {
    'gif.worker': './src/gif.worker.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
});
