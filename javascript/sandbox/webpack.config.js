const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');

require('dotenv').config();

const distPath = path.join(__dirname, 'dist');

let examples = ['index', 'matchmaker', 'native'];

module.exports = {
	mode: 'development',
	entry: Object.fromEntries([
		...examples.map(name => [`${name}-js`, path.resolve(__dirname, 'src', 'examples', `${name}.ts`)]),
		...examples.map(name => [
			`${name}-css`,
			path.resolve(__dirname, 'src', 'styles', `${name}-html.scss`)
		])
	]),
	output: {
		filename: '[name].[contenthash].bundle.js',
		path: distPath
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/
			},
			{
				test: /\.s[ac]ss$/i,
				issuer: /\.tsx?$/,
				use: ['css-loader', 'sass-loader']
			},
			{
				test: /\.s[ac]ss$/i,
				issuer: /^(?:(?!\.tsx?).)*$/,
				use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader']
			},
			{
				test: /\.(jpe?g|png|gif|svg)$/i,
				type: 'asset/resource'
			}
		]
	},
	resolve: {
		extensions: ['.tsx', '.ts', '.js']
	},
	plugins: [
		...(process.env.PROD == '1'
			? [new Dotenv({ path: '.env.prod' })]
			: [new Dotenv({ path: '.env' }), new Dotenv({ path: '.env.dev' })]),
		new webpack.EnvironmentPlugin({
			RIVET_API_ENDPOINT: process.env.RIVET_API_ENDPOINT ?? 'https://api.rivet.gg'
		}),
		new MiniCssExtractPlugin(),
		...examples.map(name => {
			return new HtmlWebpackPlugin({
				template: path.resolve(__dirname, 'src', 'html', `${name}.html`),
				filename: path.join(distPath, `${name}.html`),
				chunks: [`${name}-js`, `${name}-css`]
			});
		})
	],
	devServer: {
		compress: true,
		port: 5000,
		allowedHosts: 'all',
		host: '0.0.0.0'
	},
	optimization: {
		splitChunks: {
			chunks: 'all'
		}
	}
};
