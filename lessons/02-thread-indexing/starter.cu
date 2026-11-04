// Lesson 02 · Threads, blocks, grids & warps
#include <cstdio>
#include "cudalearn.h"

__global__ void who_am_i(int* block_of, int* warp_of, int* global_of, int n) {
    // TODO 2: compute the global index i
    int i = 0;

    // TODO 2: guard with if (i < n)
    // TODO 3: write blockIdx.x, the warp index (threadIdx.x / 32) and i
}

int main() {
    const int n = 100;
    const int threads = 32;
    const int blocks = 1;   // TODO 1: ceil(n / threads)

    int *d_block, *d_warp, *d_global;
    CUDA_CHECK(cudaMalloc(&d_block, n * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&d_warp, n * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&d_global, n * sizeof(int)));
    CUDA_CHECK(cudaMemset(d_block, 0xff, n * sizeof(int)));   // -1 = "nobody wrote here"
    CUDA_CHECK(cudaMemset(d_warp, 0xff, n * sizeof(int)));
    CUDA_CHECK(cudaMemset(d_global, 0xff, n * sizeof(int)));

    who_am_i<<<blocks, threads>>>(d_block, d_warp, d_global, n);
    KERNEL_CHECK();

    int h_block[n], h_warp[n], h_global[n];
    CUDA_CHECK(cudaMemcpy(h_block, d_block, sizeof(h_block), cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(h_warp, d_warp, sizeof(h_warp), cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(h_global, d_global, sizeof(h_global), cudaMemcpyDeviceToHost));

    printf("launched %d blocks x %d threads = %d threads for %d elements\n",
           blocks, threads, blocks * threads, n);

    viz::launch("who_am_i", dim3(blocks), dim3(threads));
    viz::labels("blockIdx.x per element", h_block, 10, 10);
    viz::labels("warp index per element", h_warp, 10, 10);
    viz::array("global index i", h_global, n);

    cudaFree(d_block); cudaFree(d_warp); cudaFree(d_global);
    return 0;
}
