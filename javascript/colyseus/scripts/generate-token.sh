#!/bin/sh
set -euf

# Writes the token to a file so it can be fetched from the HTML
echo -n "$RIVET_TOKEN" > static/rivet-public-token.txt

