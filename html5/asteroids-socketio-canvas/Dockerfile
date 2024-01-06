# syntax=docker/dockerfile:1

FROM node:20-alpine as build-image

ENV NODE_ENV=production

WORKDIR /app/build
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json
RUN npm ci --include=dev

COPY tsconfig.json ./

COPY ./server ./server/
COPY ./shared ./shared/

RUN npm run build:server

RUN rm -rf ./node_modules
RUN npm ci --omit=dev

COPY .env rivet.toml ./
COPY .rivet ./.rivet

FROM alpine as production-image

RUN apk add --update nodejs

ENV NODE_ENV=production

WORKDIR /app
COPY --from=build-image /app/build/build/server ./
COPY --from=build-image /app/build/.rivet ./.rivet
COPY --from=build-image /app/build/node_modules ./node_modules

COPY --from=build-image /app/build/rivet.toml ./rivet.toml
COPY --from=build-image /app/build/.env ./.env
COPY --from=build-image /app/build/tsconfig.json ./tsconfig.json
COPY --from=build-image /app/build/package*.json ./

CMD ["node", \
    "--optimize-for-size", \
    "-r", "module-alias/register", \
    "-r", "dotenv/config", \
    "server/index.js"]
