# Scrunch Game Prototype

![Screenshot](./public/img/screenshot.png)

## Description
A chess-like, browser-based, multiplayer game. Each player has a different pattern of places they can move to. Jump around to collect points, grow taller, and scrunch other players.

## Building Client
Before doing anything, execute `npm i` within this directory. That will install the NPM dependencies.
If you want to build the client just once, then execute `npm run build`. If you want Webpack to watch for changes, then execute `npm run watch`. If you want to obfuscate the client for publishing, execute `npm run build-prod`.

## Building and Running Server
*Make sure you have Rust nightly installed.* If it's not installed, execute `rustup install nightly`. One that is completed, execute `npm start` and visit `localhost:8000`.

## How to Play
* Press `Enter` to join.
* Click on the green squares to move your player there.
* Collect yellow orbs to grow taller.
* Every time you move, a "gap" (represented by blue squares) is spawned behind you. Don't jump on the gaps – they'll kill you.
* Jump on other players to scrunch them. This makes them spawn yellow orbs that you can collect.

## Notable Technologies Used
* Rust
* TypeScript
* rocket.rs
* MessagePack
* Pixi.js
