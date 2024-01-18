#!/bin/sh
set -euf

git clean -xdf
rm -rf .env .gitignore .github/workflows .rivet/ 
cp ./bin/default-gitignore .gitignore

