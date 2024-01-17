# FROM hello-world:latest
FROM node:16.13.0-alpine3.14

WORKDIR /app

RUN apk add --no-cache git

# Build Rivet libs
COPY package.json yarn.lock ./
COPY bin/build-libs.sh bin/build-libs.sh
RUN SKIP_INSTALL=1 ./bin/build-libs.sh


# Install libs
RUN yarn install --production

# Build server
COPY src/ src/
COPY tsconfig.json .
RUN yarn run build:server

CMD ["node", "src/server.js"]
