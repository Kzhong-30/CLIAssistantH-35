const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './client/index.tsx',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist', 'public'),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './client/index.html',
    }),
  ],
  devServer: {
    port: 3000,
    hot: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
};
