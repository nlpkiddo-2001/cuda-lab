#include <cstdio>
#include <cmath>
#include "cudalearn.h"

__global__ void wave(float* out, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) out[i] = sinf(i * 0.05f) * expf(-i * 0.004f);
}

int main() {
    const int n = 1000;
    float* d;
    CUDA_CHECK(cudaMalloc(&d, n * sizeof(float)));

    GpuTimer t;
    t.start();
    wave<<<(n + 255) / 256, 256>>>(d, n);
    float ms = t.stop();
    KERNEL_CHECK();

    float h[n];
    CUDA_CHECK(cudaMemcpy(h, d, sizeof(h), cudaMemcpyDeviceToHost));
    printf("kernel took %.4f ms\n", ms);

    viz::array("damped wave", h, n);
    viz::timing("wave kernel", ms);
    cudaFree(d);
    return 0;
}
