# === Build ===
FROM node:16-alpine as build
WORKDIR /app
COPY ./package.json ./package-lock.json /app/
RUN npm install
COPY . .
RUN npm run build

# === Run ===
FROM node:16-alpine
WORKDIR /app
# Enables uWebSockets to run on Alpine Linux
RUN apk add --no-cache libc6-compat && ln -s /lib/libc.musl-x86_64.so.1 /lib/ld-linux-x86-64.so.2
COPY --from=build /app/package.json /app/package-lock.json /app/
RUN npm install --production
COPY --from=build /app/lib/ /app/lib/
CMD node lib/index.js
