# FROM hello-world:latest
FROM node:16.13.0-alpine3.14

WORKDIR /app

RUN apk add --no-cache git

# Build Rivet libs
COPY package.json yarn.lock ./
RUN yarn install --production

# Build server
COPY src/ src/
COPY tsconfig.json tsconfig.server.json .
RUN yarn run build:server

RUN adduser -D server
USER server

CMD ["node", "out/server.js"]
