const path = require("path");
module.exports = {
  entry: "./src/index.js",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
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
    static: path.resolve(__dirname, "dist"),
    hot: true,
  },
  mode: "development",
  devtool: "cheap-module-source-map",
  plugins: [],
};
