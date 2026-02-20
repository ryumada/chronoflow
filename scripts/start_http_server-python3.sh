#!/usr/bin/env bash
set -e
# Category: Server
# Description: Starts local HTTP server using npx
# Usage: ./scripts/start_http_server-python3.sh
# Dependencies: npm, npx

cd ../
npx http-server -p 8098
