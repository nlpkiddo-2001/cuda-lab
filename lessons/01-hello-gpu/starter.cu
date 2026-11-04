// Lesson 01 · Hello GPU
#include <cstdio>
#include "cudalearn.h"

__global__ void hello() {
    // TODO 2: also print blockDim.x and gridDim.x
    printf("Hello from block %d, thread %d\n", blockIdx.x, threadIdx.x);
}

int main() {
    // ---- device info -------------------------------------------------
    cudaDeviceProp prop;
    CUDA_CHECK(cudaGetDeviceProperties(&prop, 0));
    printf("GPU: %s (compute capability %d.%d)\n", prop.name, prop.major, prop.minor);
    // TODO 3: print prop.multiProcessorCount, prop.maxThreadsPerBlock,
    //         prop.warpSize and prop.totalGlobalMem (in GB)

    // ---- launch ------------------------------------------------------
    dim3 grid(2);    // TODO 1: 3 blocks
    dim3 block(4);   //         of 4 threads
    hello<<<grid, block>>>();
    cudaDeviceSynchronize();

    // TODO 4: viz::launch("hello", grid, block);
    return 0;
}
