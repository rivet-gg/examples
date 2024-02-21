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

# Create a non-root user to run the server. Read more at
# https://rivet.gg/docs/dynamic-servers/concepts/docker-root-user
RUN adduser -D server
USER server

CMD node dist/server/index.js
