# Need to use Ubuntu base in order for wrtc lib to work.
#
# Requires specifically Node 18 for prebuilt wrtc binaries. https://github.com/WonderInventions/node-webrtc

# === Build ===
FROM node:18 as build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build:server

# === Run ===
FROM node:18
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y libasound2

COPY --from=build /app/package.json /app/package-lock.json /app/
RUN npm install --production

COPY --from=build /app/dist /app/dist

RUN adduser server
USER server
CMD node dist/server/index.js

