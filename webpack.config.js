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
  mode: "production",
  devtool: "cheap-module-source-map",
  plugins: [],
};
