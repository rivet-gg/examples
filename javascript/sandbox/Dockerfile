# Steps:
# 1. Add `apk add`
# 1. Replace `server` with your user

FROM node:16.13.0-alpine3.14

WORKDIR /app

RUN apk add --no-cache git

# Install dependencies
RUN apk add --no-cache openssh supervisor

# Build Rivet libs
COPY package.json yarn.lock ./
RUN yarn install --production

# Build server
COPY src/ src/
COPY tsconfig.json tsconfig.server.json .
RUN yarn run build:server

RUN adduser -D server
USER server

# CMD ["node", "out/server.js"]

# Setup SSH server
RUN mkdir -p "/home/server/.ssh" \
  && ssh-keygen -t ed25519 -f "/home/server/.ssh/ssh_host_ed25519_key" \
  && echo -e "\
HostKey /home/server/.ssh/ssh_host_ed25519_key\n\
Port 2222\n\
PermitRootLogin yes\n\
PidFile /home/server/.ssh/sshd.pid" > /home/server/.ssh/sshd_config

# Setup supervisor
RUN mkdir -p /run/sshd /etc/supervisor/conf.d/
RUN echo -e "\
[supervisord]\nnodaemon=true\n\
logfile=/dev/stdout\n\
logfile_maxbytes=0\n\
[program:sshd]\n\
command=/usr/sbin/sshd -D\n\
autorestart=false\n\
stdout_logfile=/dev/stdout\n\
stderr_logfile=/dev/stderr\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile_maxwords=0\n\
[program:nodeapp]\n\
command=node /app/out/server.js\n\
autorestart=false\n\
stdout_logfile=/dev/stdout\n\
stderr_logfile=/dev/stderr\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile_maxbytes=0" > /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

