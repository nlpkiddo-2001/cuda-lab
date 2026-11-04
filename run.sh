#!/usr/bin/env bash
# Compile and run a .cu file from the terminal.
#   ./run.sh my-work/01-hello-gpu.cu [args...]      (GPU=2 ./run.sh ... to pick another GPU)
set -e
[ -z "$1" ] && { echo "usage: [GPU=n] ./run.sh file.cu [args...]"; exit 1; }
cd "$(dirname "$0")"
E=${CUDA_ENV:-/opt/conda/envs/voice-pipeline}
src=$1; shift
mkdir -p build/cli
exe=build/cli/$(basename "${src%.cu}")
"$E/bin/nvcc" -arch=sm_86 -std=c++17 -O3 -lineinfo -Iinclude -cudart shared -L"$E/lib" -L.toolchain/lib \
    -Xlinker -rpath,"$E/lib" "$src" -o "$exe" 2>&1 | grep -v "Skipping incompatible" || true
[ -x "$exe" ] && [ "$exe" -nt "$src" ] || { echo "compile failed"; exit 1; }
CUDA_VISIBLE_DEVICES=${GPU:-1} "./$exe" "$@"
