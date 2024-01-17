FROM node:16-alpine
RUN apk add --no-cache git
WORKDIR /usr/src/app
COPY package*.json ./
RUN yarn install --frozen-lockfile
COPY . .
RUN adduser -D server
USER server
CMD ["node", "src/index.js"]

