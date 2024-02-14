# === Build ===
FROM node:16-alpine as build
WORKDIR /app
COPY ./package.json ./yarn.lock /app/
RUN yarn install
COPY . .
RUN yarn run build:server

# === Run ===
FROM node:16-alpine
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json /app/
RUN yarn install --production
COPY --from=build /app/dist/ /app/dist/
RUN adduser -D server
USER server
CMD node dist/server/index.js
