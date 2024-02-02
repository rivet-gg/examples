FROM node:16.13.0-alpine3.14

WORKDIR /app

COPY package.json yarn.lock ./
COPY src/ src/

RUN apk add --no-cache git \
    && yarn install \
    && adduser -D rivet

USER rivet

CMD ["node", "src/server/server.js"]
