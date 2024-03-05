# === Build ===
FROM node:20-slim as build
WORKDIR /app
COPY ./package.json ./package-lock.json /app/
RUN npm install
COPY . .
RUN npm run build

# === Run ===
FROM node:20-slim
# Enables uWebSockets to run on Alpine Linux
# RUN apk add --no-cache libc6-compat && ln -s /lib/libc.musl-x86_64.so.1 /lib/ld-linux-x86-64.so.2
RUN adduser server
USER server
WORKDIR /app
COPY --from=build --chown=server:server /app/package.json /app/package-lock.json /app/
RUN npm install --production
COPY --from=build --chown=server:server /app/lib/ /app/lib/
CMD node lib/index.js
