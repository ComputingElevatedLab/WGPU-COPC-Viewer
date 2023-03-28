const webpack = require("webpack");
const path = require("path");
const lazPerf = require("laz-perf");
const Dotenv = require("dotenv-webpack");
module.exports = {
  entry: "./src/index.js",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "docs"),
  },
  resolve: {
    fallback: {
      fs: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.worker\.js$/,
        exclude: /node_modules/,
        use: "worker-loader",
      },
    ],
  },
  devServer: {
    port: 8080,
    static: path.resolve(__dirname, "docs"),
    hot: true,
  },
  mode: "development",
  devtool: "cheap-module-source-map",
  plugins: [
    new Dotenv(),
    // commonjs({ include: /node_modules\/laz-perf/ }),
  ],
};
