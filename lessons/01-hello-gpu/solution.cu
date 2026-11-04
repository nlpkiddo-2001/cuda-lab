// Lesson 01 · Hello GPU — solution
#include <cstdio>
#include "cudalearn.h"

__global__ void hello() {
    printf("Hello from block %d/%d, thread %d/%d\n",
           blockIdx.x, gridDim.x, threadIdx.x, blockDim.x);
}

int main() {
    cudaDeviceProp prop;
    CUDA_CHECK(cudaGetDeviceProperties(&prop, 0));
    printf("GPU: %s (compute capability %d.%d)\n", prop.name, prop.major, prop.minor);
    printf("  SMs                : %d\n", prop.multiProcessorCount);
    printf("  max threads/block  : %d\n", prop.maxThreadsPerBlock);
    printf("  warp size          : %d\n", prop.warpSize);
    printf("  global memory      : %.1f GB\n", prop.totalGlobalMem / 1e9);
    printf("  shared mem / block : %zu KB\n\n", prop.sharedMemPerBlock / 1024);

    dim3 grid(3);
    dim3 block(4);
    hello<<<grid, block>>>();
    KERNEL_CHECK();   // check the launch and wait for the GPU

    viz::launch("hello<<<3, 4>>>", grid, block);
    return 0;
}
