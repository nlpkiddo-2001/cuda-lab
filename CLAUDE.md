# CUDA Lab: learning CUDA from scratch

This directory is a hands-on course for learning CUDA C++, from first kernels up to tensor cores and
flash-attention-style kernels. The user is a beginner at CUDA. Claude acts as the **teacher**: it writes
lessons, reviews the user's code, and explains what the GPU is actually doing.

## Hardware & toolchain (verified 2026-11-04)

- **4× NVIDIA RTX A6000**: Ampere, compute capability **8.6** (`-arch=sm_86`), 48 GB each, 84 SMs,
  ~768 GB/s peak bandwidth, 64K registers/SM, max 1536 threads (48 warps)/SM, 100 KB shared mem/SM.
- Other workloads share these GPUs. **GPU 1 is usually idle**, while GPUs 0/2 are partly used and **GPU 3 is nearly full**.
  Check `nvidia-smi` before running anything heavy. The IDE preselects the GPU with the most free memory.
- **nvcc 12.4** lives in the conda env `/opt/conda/envs/voice-pipeline` (`bin/nvcc`). There is no `/usr/local/cuda`.
- Toolkit quirks, which the server already works around:
  - No `libcudart_static.a`, so we link with `-cudart shared -L$ENV/lib -Xlinker -rpath,$ENV/lib`.
  - No 12.x `libcudadevrt.a`, so `.toolchain/lib/libcudadevrt.a` is an **empty stub** that satisfies the linker.
    This means **dynamic parallelism (kernels launching kernels) and `-rdc=true` won't link**. Avoid them, or
    install `cuda-cudart-static=12.4` into the env first.
  - **No Nsight Compute / Nsight Systems / compute-sanitizer / cuobjdump** are installed. For performance analysis use
    `GpuTimer` + `viz::bandwidth`, `ptxas -v` (shown in the IDE's "Kernel resources" tab) and PTX (`nvcc -ptx`).
- Manual compile (outside the IDE):
  ```bash
  E=/opt/conda/envs/voice-pipeline
  $E/bin/nvcc -arch=sm_86 -std=c++17 -O3 -lineinfo -Iinclude -cudart shared -L$E/lib \
      -L.toolchain/lib -Xlinker -rpath,$E/lib file.cu -o file && CUDA_VISIBLE_DEVICES=1 ./file
  ```

## Layout

```
cuda-learning/
  start.sh               launch the IDE (default port 8090, binds 127.0.0.1)
  run.sh                 terminal compile+run: [GPU=n] ./run.sh my-work/<id>.cu [args]  (default GPU 1)
  ide/server.py          FastAPI backend: compile with nvcc, run on a chosen GPU, parse ptxas -v, PTX, @@VIZ
  ide/static/            index.html, app.js (editor/run/UI), viz.js (chart renderers), style.css
  include/cudalearn.h    CUDA_CHECK, KERNEL_CHECK, GpuTimer, viz:: helpers (auto-included via -Iinclude)
  lessons/curriculum.json   full roadmap; a lesson shows as available once lessons/<id>/lesson.md exists
  lessons/<id>/          lesson.md (theory + exercise), starter.cu (TODOs), solution.cu (reference)
  lessons/playground.*   free scratch space
  my-work/<id>.cu        THE USER'S OWN CODE: autosaved by the IDE. Never overwrite without asking.
  build/<id>/            compiler output (disposable)
```

## Running the IDE

```bash
cd /workspace/cuda-learning && ./start.sh        # http://127.0.0.1:8090 (VS Code forwards the port)
```
Python is `/opt/conda/envs/voice-pipeline/bin/python` (it has fastapi + uvicorn). The server runs user code with
`CUDA_VISIBLE_DEVICES=<selected gpu>`, a 30 s run timeout, and a 60 s compile timeout.

## The viz protocol

Programs print lines of the form `@@VIZ {json}` to stdout. The server strips them from the console output and the UI draws them.
`cudalearn.h` emits them for you, and every function takes **host** pointers:

| C++ call | `type` | UI |
|---|---|---|
| `viz::launch(title, grid, block)` | launch | grid overview + block 0 as warps × 32 lanes |
| `viz::array(title, ptr, n)` | array | bars (≤128 pts) or line, downsampled to 2048 |
| `viz::matrix(title, ptr, rows, cols)` | matrix | heatmap, downsampled to 128×128 |
| `viz::labels(title, int_ptr, rows, cols)` | labels | labelled cells (block/warp ids); -1 = unwritten (hatched) |
| `viz::timing(label, ms)` | timing | all timings combined into one bar chart, with speedup vs the first |
| `viz::bandwidth(label, bytes, ms)` | bandwidth | GB/s vs the 768 GB/s peak |

To add a new viz type, add an emitter in `cudalearn.h` and a renderer in `viz.js` (register it in the `R` map in
`render`). Keep chart colors on the dark categorical/sequential tokens already defined in `viz.js` / `style.css`.

## Teaching approach (how Claude should work here)

- **One lesson at a time, in curriculum order.** Create lesson N+1 only when the user is ready for it. Don't
  pre-generate the whole course. Mark progress in the "Progress" section below.
- Every lesson has the same structure: **concept → small code example → "things to notice" → exercise with
  TODOs → experiments/bonus**. Each one introduces at most 2–3 new ideas.
- `starter.cu` must **compile and run as given** (TODOs leave it incomplete, not broken). `solution.cu` must be
  verified by actually compiling and running it on the GPU before the lesson is handed over.
- Every lesson uses `viz::` so the user *sees* the concept: thread mappings, memory access patterns, speedups.
  From module 2 onward, every optimization lesson measures **before/after** with `GpuTimer` + `viz::timing` /
  `viz::bandwidth`.
- When reviewing the user's code in `my-work/`, explain *why* something is slow or wrong in terms of the hardware
  (warps, coalescing, banks, occupancy, latency hiding). Don't just hand over a fixed version; give hints first.
- Keep the user's GPU neighbours in mind: default to GPU 1, keep allocations small (well under ~10 GB) unless a lesson
  specifically needs more, and never kill other processes on the GPUs.
- The multi-GPU lesson (22) may use all four GPUs, but must check free memory on each first.
- The user writes casually ("bro"). Keep explanations friendly, direct, and concrete.

## Progress

- [x] Lab setup: IDE, cudalearn.h, curriculum
- [ ] 01 Hello GPU (lesson written)
- [ ] 02 Thread indexing (lesson written)
- [ ] 03+ not yet written
