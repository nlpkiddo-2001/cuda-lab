// Lesson 02 · Threads, blocks, grids & warps — solution
#include <cstdio>
#include "cudalearn.h"

__global__ void who_am_i(int* block_of, int* warp_of, int* global_of, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        block_of[i]  = blockIdx.x;
        warp_of[i]   = threadIdx.x / 32;
        global_of[i] = i;
    }
}

// Bonus: 2-D launch over a W x H image
__global__ void block_map_2d(int* out, int W, int H) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    if (x < W && y < H) out[y * W + x] = blockIdx.y * gridDim.x + blockIdx.x;
}

int main() {
    const int n = 256;
    const int threads = 64;
    const int blocks = (n + threads - 1) / threads;

    int *d_block, *d_warp, *d_global;
    CUDA_CHECK(cudaMalloc(&d_block, n * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&d_warp, n * sizeof(int)));
    CUDA_CHECK(cudaMalloc(&d_global, n * sizeof(int)));

    who_am_i<<<blocks, threads>>>(d_block, d_warp, d_global, n);
    KERNEL_CHECK();

    int h_block[n], h_warp[n], h_global[n];
    CUDA_CHECK(cudaMemcpy(h_block, d_block, sizeof(h_block), cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(h_warp, d_warp, sizeof(h_warp), cudaMemcpyDeviceToHost));
    CUDA_CHECK(cudaMemcpy(h_global, d_global, sizeof(h_global), cudaMemcpyDeviceToHost));

    printf("launched %d blocks x %d threads = %d threads for %d elements (%d idle)\n",
           blocks, threads, blocks * threads, n, blocks * threads - n);

    viz::launch("who_am_i", dim3(blocks), dim3(threads));
    viz::labels("blockIdx.x per element", h_block, 10, 10);
    viz::labels("warp index per element", h_warp, 10, 10);
    viz::array("global index i", h_global, n);

    // ---- bonus: 2-D grid ----
    const int W = 32, H = 24;
    dim3 block2(8, 8), grid2((W + 7) / 8, (H + 7) / 8);
    int* d_img;
    CUDA_CHECK(cudaMalloc(&d_img, W * H * sizeof(int)));
    block_map_2d<<<grid2, block2>>>(d_img, W, H);
    KERNEL_CHECK();
    int h_img[W * H];
    CUDA_CHECK(cudaMemcpy(h_img, d_img, sizeof(h_img), cudaMemcpyDeviceToHost));
    viz::launch("block_map_2d", grid2, block2);
    viz::labels("2-D: block id per pixel", h_img, H, W);

    cudaFree(d_block); cudaFree(d_warp); cudaFree(d_global); cudaFree(d_img);
    return 0;
}
