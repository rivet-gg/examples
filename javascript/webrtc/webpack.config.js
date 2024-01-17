require("dotenv").config();

const webpack = require("webpack");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env) => {
	return {
		entry: {
			client: path.join(__dirname, "client", "index.ts"),
		},
		output: {
			path: path.join(__dirname, "dist"),
			filename: "[name].[contenthash].js"
		},
		mode: "development",
		context: path.join(__dirname, "client"),
		resolve: {
			extensions: [".ts", ".js"],
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					use: "ts-loader",
					exclude: /node_modules/,
				},
				{
					test: /\.png/,
					type: "asset/resource",
				},
			],
		},
		devtool: "inline-source-map",
		devServer: {
			static: path.join(__dirname, "dist"),
			host: "127.0.0.1",
			port: 8080,
			hot: true,
			open: true,
		},
		watchOptions: {
			// File watching doesn't always work on Windows, so we fall back to polling
			poll: 1000,
		},
		plugins: [
			new HtmlWebpackPlugin({
				inject: "head",
				template: path.join(__dirname, "client", "index.html"),
			}),
			new webpack.DefinePlugin({
				"process.env.RIVET_TOKEN": env.production
					? "undefined"
					: JSON.stringify(process.env.RIVET_TOKEN),
			}),
		],
	};
};

