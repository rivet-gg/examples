#!/usr/bin/env bash
set -euf

# Load .env
if [ -f ".env" ]; then
    echo "Loading .env"
    grep -v '^#' .env
    export $(grep -v '^#' .env | xargs)
fi

# ./bin/copy-libs.sh
# yarn install

export PATH="$PATH:$HOME/rivet/cli/target/debug"

# docker build --file Dockerfile --tag my-image --squash .
# rivet build push --name "Local" --tag my-image

rm -rf ./dist/
PROD=1 yarn run build
rivet site push --name "Local" --path dist/

