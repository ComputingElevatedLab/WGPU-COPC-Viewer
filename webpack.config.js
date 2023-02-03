const webpack = require("webpack");
const path = require("path");
const lazPerf = require("laz-perf");
console.log(lazPerf);
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
    // commonjs({ include: /node_modules\/laz-perf/ }),
    new webpack.DefinePlugin({
      tree: {
        leafCapacity: 16,
        bufferCapacity: 16,
      },
    }),
  ],
};
