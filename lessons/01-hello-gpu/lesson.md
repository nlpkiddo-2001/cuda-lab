# Lesson 01 · Hello GPU

## The big idea

A CUDA program has two sides:

| | **Host** | **Device** |
|---|---|---|
| What | CPU + system RAM | GPU + its own memory (VRAM) |
| Code | ordinary C++ (`main`) | **kernels**: functions marked `__global__` |
| Runs | one thread, top to bottom | the same kernel on **thousands of threads at once** |

The host decides how much work to start, then **launches** a kernel on the device.

## Your first kernel

```cpp
__global__ void hello() {
    printf("block %d, thread %d\n", blockIdx.x, threadIdx.x);
}

int main() {
    hello<<<2, 4>>>();          // 2 blocks × 4 threads = 8 threads
    cudaDeviceSynchronize();    // wait for the GPU to finish
}
```

- `__global__` means "runs on the GPU, called from the CPU". It must return `void`.
- `<<<blocks, threadsPerBlock>>>` is the **launch configuration**. Threads are grouped into **blocks**, and blocks make up the **grid**.
- Inside the kernel, every thread can read built-in variables:
  - `threadIdx.x`: my index inside my block (0 … blockDim.x-1)
  - `blockIdx.x`: my block's index in the grid (0 … gridDim.x-1)
  - `blockDim.x`, `gridDim.x`: the sizes you passed in `<<< >>>`
- **Launches are asynchronous.** The CPU continues immediately after `<<< >>>`. `cudaDeviceSynchronize()` waits for the GPU (and flushes device `printf`). If you leave it out, the program may exit before anything prints.

## Things to notice when you run it

1. **Output order is not guaranteed.** Blocks run in whatever order the hardware schedules them. Never write code that depends on block order.
2. Threads inside a block are run in groups of 32 called **warps**. Lesson 02 covers warps.

## Your GPU

You have 4× **NVIDIA RTX A6000** (Ampere, compute capability **8.6**). Some numbers to remember:

- 84 **SMs** (Streaming Multiprocessors). Each one runs several blocks at once.
- At most **1024 threads per block**
- **48 GB** of memory, ~**768 GB/s** of bandwidth

`cudaGetDeviceProperties` lets you query all of these from code.

## Exercise

Open the editor (`starter.cu`) and complete the TODOs:

1. Launch `hello` with **3 blocks of 4 threads**. Run it a few times and compare the print order between runs.
2. Inside the kernel, also print `blockDim.x` and `gridDim.x`.
3. In `main`, finish printing the device properties: SM count, max threads per block, warp size, and total memory in GB.
4. Call `viz::launch("hello", grid, block)` to draw the launch in the **Visualize** tab.

**Bonus:** try `hello<<<1, 2000>>>()`. What happens? (Hint: the limit is 1024 threads per block. The launch fails *silently* unless you check for errors. Wrap it with `KERNEL_CHECK()` to see the error. Lesson 05 covers error handling.)

When you're done, click **Solution** to compare with the reference.
