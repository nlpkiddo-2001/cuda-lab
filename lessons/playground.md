# Playground

A free scratch space. Write any CUDA you want, and it's saved to `my-work/playground.cu`.

## Helpers from `cudalearn.h`

| Helper | What it does |
|---|---|
| `CUDA_CHECK(call)` | abort with file:line if a CUDA call fails |
| `KERNEL_CHECK()` | check the last launch and synchronize |
| `GpuTimer t; t.start(); ...; float ms = t.stop();` | time GPU work |
| `viz::launch(title, grid, block)` | draw the launch configuration |
| `viz::array(title, host_ptr, n)` | bar/line chart of an array |
| `viz::matrix(title, host_ptr, rows, cols)` | heatmap of a row-major matrix |
| `viz::labels(title, int_ptr, rows, cols)` | labelled grid (block / warp ids) |
| `viz::timing(label, ms)` | add a bar to the timing chart |
| `viz::bandwidth(label, bytes, ms)` | GB/s vs the A6000's ~768 GB/s peak |

All `viz::` functions take **host** pointers, so `cudaMemcpy` your data back first.

**Shortcuts:** `Ctrl+Enter` runs, `Ctrl+S` saves.
