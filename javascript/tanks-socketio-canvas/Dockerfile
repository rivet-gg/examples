# === Build ===
FROM node:16-alpine as build
WORKDIR /app
COPY ./package.json ./package-lock.json /app/
RUN npm install
COPY . .
RUN npm run build:server

# === Run ===
FROM node:16-alpine
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json /app/
RUN npm install --production
COPY --from=build /app/dist/ /app/dist/
CMD node dist/server/index.js
