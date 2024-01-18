const webpack = require("webpack");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env) => {
	return {
		entry: {
			client: path.join(__dirname, "client", "index.ts"),
		},
		output: {
			path: path.join(__dirname, "public"),
            filename: 'js/[name].[contenthash].js',
		},
		mode: "development",
		context: path.join(__dirname, "client"),
		resolve: {
			extensions: [".ts", ".js"],
            fallback: {
                "path": false,
                "url": false,
                "oimo": false,
                "earcut": false,
                "cannon": false,
                // "util": require.resolve("util/"),
            }
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
                    use: [
                        {
                            loader: 'ts-loader',
                            options: { transpileOnly: true }
                        }
                    ]
				},
				{
					test: /\.png/,
					type: "asset/resource",
				},
			],
		},
		devtool: "inline-source-map",
		devServer: {
			static: path.join(__dirname, "public"),
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
				"process.env.RIVET_API_ENDPOINT": JSON.stringify(process.env.RIVET_API_ENDPOINT),
				"process.env.RIVET_TOKEN": JSON.stringify(process.env.RIVET_TOKEN),
                "process.env": "{}"
			}),
		],
	};
};
