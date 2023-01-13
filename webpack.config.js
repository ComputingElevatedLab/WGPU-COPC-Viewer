const webpack = require("webpack");
const path = require("path");
module.exports = {
  entry: "./src/index.js",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "docs"),
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
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
    new webpack.DefinePlugin({
      tree: {
        leafCapacity: 16,
        bufferCapacity: 16,
      },
    }),
  ],
};
