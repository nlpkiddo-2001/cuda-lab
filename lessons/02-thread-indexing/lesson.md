# Lesson 02 · Threads, blocks, grids & warps

## Every thread needs a job

If a kernel processes an array of `n` elements, each thread has to know **which element is its own**. The standard formula:

```cpp
int i = blockIdx.x * blockDim.x + threadIdx.x;   // global thread index
```

With `blockDim.x = 4`:

```
block:     0           1           2
thread:  0 1 2 3 | 0 1 2 3 | 0 1 2 3
global i: 0 1 2 3 | 4 5 6 7 | 8 9 10 11
```

## How many blocks?

Pick a block size (usually **128 or 256**), then round the number of blocks **up**:

```cpp
int threads = 256;
int blocks  = (n + threads - 1) / threads;   // ceil(n / threads)
```

That usually starts **more threads than elements**, so every kernel needs a **bounds check**:

```cpp
if (i < n) out[i] = ...;    // the extra threads do nothing
```

Without it, the extra threads write past the end of the array. That is a memory bug, and it can corrupt data silently.

## Warps

The hardware runs threads in groups of **32 called warps**. A warp executes one instruction at a time for all 32 of its threads (SIMT).

```cpp
int warp = threadIdx.x / 32;   // warp index inside the block
int lane = threadIdx.x % 32;   // my position inside the warp
```

This is why block sizes should be **multiples of 32**. A 48-thread block still occupies 2 full warps, and half of the second warp is wasted.

## Getting results back (preview of lesson 03)

GPU memory is separate from CPU memory:

```cpp
int* d_out;                                        // "d_" = device pointer
cudaMalloc(&d_out, n * sizeof(int));               // allocate on the GPU
kernel<<<blocks, threads>>>(d_out, n);
cudaMemcpy(h_out, d_out, n * sizeof(int), cudaMemcpyDeviceToHost);  // copy back
cudaFree(d_out);
```

## Exercise

The starter has `n = 100` elements and blocks of 32 threads.

1. Compute `blocks` with ceil division. Check: you should get 4 blocks = 128 threads for 100 elements.
2. In the kernel, compute the global index `i` and **guard it** with `if (i < n)`.
3. For each element, write `blockIdx.x` into `block_of`, the warp index into `warp_of`, and `i` into `global_of`.
4. Run it and open **Visualize**. The `labels` grid shows which block and which warp handled each element.

**Experiments:**
- Change the block size to 16, then 48. How do the warps line up with the blocks now?
- Remove the `if (i < n)` guard. Nothing may crash, but you are writing out of bounds. You can't see it because the bug is silent, and silent bugs are the most dangerous kind.
- **Bonus (2-D):** launch a `dim3 grid(4, 3)` with `dim3 block(8, 8)` over a 32×24 "image" and record `blockIdx.y * gridDim.x + blockIdx.x` per pixel. Visualize it with `viz::labels(title, data, 24, 32)`. Lesson 04 builds on this.
