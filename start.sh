#!/usr/bin/env bash
# Start the CUDA Lab IDE.  Usage: ./start.sh [port]
cd "$(dirname "$0")"
E=${CUDA_ENV:-/opt/conda/envs/voice-pipeline}
PY=$E/bin/python
export PATH=$E/bin:$PATH
exec "$PY" ide/server.py --port "${1:-8090}"
