#!/usr/bin/env bash
set -e
# Category: Server
# Description: Starts local HTTP server using python module
# Usage: ./scripts/start_http_server-npm.sh
# Dependencies: python3

cd ../
python3 -m http.server 8098
