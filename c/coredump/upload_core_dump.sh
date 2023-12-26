#!/bin/bash
echo "Core dump happened: $1 $2" >> /var/log/core_dump.log
# curl -X POST --data-binary @$2 http://your-server.com/upload

