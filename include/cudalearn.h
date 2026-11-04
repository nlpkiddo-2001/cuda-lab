// cudalearn.h — helpers for the CUDA Lab.
//
//   CUDA_CHECK(call)   abort with file:line if a CUDA API call fails
//   KERNEL_CHECK()     check launch error + sync (catches errors inside kernels)
//   GpuTimer           cudaEvent based timer (milliseconds)
//   viz::*             emit "@@VIZ {json}" lines that the Lab UI turns into charts
//
// viz functions take HOST pointers — copy device data back with cudaMemcpy first.
// Large arrays/matrices are downsampled before printing so the UI stays fast.
#pragma once
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cuda_runtime.h>

#define CUDA_CHECK(call)                                                        \
    do {                                                                        \
        cudaError_t err__ = (call);                                             \
        if (err__ != cudaSuccess) {                                             \
            fprintf(stderr, "CUDA error %s at %s:%d\n  %s\n",                   \
                    cudaGetErrorName(err__), __FILE__, __LINE__,                \
                    cudaGetErrorString(err__));                                 \
            exit(1);                                                            \
        }                                                                       \
    } while (0)

#define KERNEL_CHECK()                                                          \
    do {                                                                        \
        CUDA_CHECK(cudaGetLastError());                                         \
        CUDA_CHECK(cudaDeviceSynchronize());                                    \
    } while (0)

struct GpuTimer {
    cudaEvent_t start_, stop_;
    GpuTimer() { cudaEventCreate(&start_); cudaEventCreate(&stop_); }
    ~GpuTimer() { cudaEventDestroy(start_); cudaEventDestroy(stop_); }
    void start(cudaStream_t s = 0) { cudaEventRecord(start_, s); }
    float stop(cudaStream_t s = 0) {   // returns elapsed ms
        cudaEventRecord(stop_, s);
        cudaEventSynchronize(stop_);
        float ms = 0.f;
        cudaEventElapsedTime(&ms, start_, stop_);
        return ms;
    }
};

namespace viz {

namespace detail {
inline void name(const char* n) {
    // minimal JSON string escaping for chart titles
    putchar('"');
    for (const char* p = n; *p; ++p) {
        if (*p == '"' || *p == '\\') putchar('\\');
        if ((unsigned char)*p >= 0x20) putchar(*p);
    }
    putchar('"');
}
template <typename T> inline void num(T v) {
    double d = (double)v;
    if (d != d) { fputs("null", stdout); return; }           // NaN
    if (d > 1e300 || d < -1e300) { fputs("null", stdout); return; }
    printf("%.6g", d);
}
}  // namespace detail

// Draw the grid/block layout of a kernel launch.
inline void launch(const char* title, dim3 grid, dim3 block) {
    fflush(stdout);
    printf("@@VIZ {\"type\":\"launch\",\"title\":"); detail::name(title);
    printf(",\"grid\":[%u,%u,%u],\"block\":[%u,%u,%u]}\n",
           grid.x, grid.y, grid.z, block.x, block.y, block.z);
    fflush(stdout);
}

// 1-D array -> bar chart (small) or line chart (large). Max 2048 points shown.
template <typename T>
inline void array(const char* title, const T* data, int n) {
    const int MAXP = 2048;
    int stride = n > MAXP ? (n + MAXP - 1) / MAXP : 1;
    fflush(stdout);
    printf("@@VIZ {\"type\":\"array\",\"title\":"); detail::name(title);
    printf(",\"n\":%d,\"stride\":%d,\"data\":[", n, stride);
    for (int i = 0, k = 0; i < n; i += stride, ++k) { if (k) putchar(','); detail::num(data[i]); }
    printf("]}\n");
    fflush(stdout);
}

// 2-D row-major matrix -> heatmap. Downsampled to at most 128x128 cells.
template <typename T>
inline void matrix(const char* title, const T* data, int rows, int cols) {
    const int MAXC = 128;
    int rs = rows > MAXC ? (rows + MAXC - 1) / MAXC : 1;
    int cs = cols > MAXC ? (cols + MAXC - 1) / MAXC : 1;
    fflush(stdout);
    printf("@@VIZ {\"type\":\"matrix\",\"title\":"); detail::name(title);
    printf(",\"rows\":%d,\"cols\":%d,\"rstride\":%d,\"cstride\":%d,\"data\":[", rows, cols, rs, cs);
    for (int r = 0, kr = 0; r < rows; r += rs, ++kr) {
        if (kr) putchar(',');
        putchar('[');
        for (int c = 0, kc = 0; c < cols; c += cs, ++kc) { if (kc) putchar(','); detail::num(data[(size_t)r * cols + c]); }
        putchar(']');
    }
    printf("]}\n");
    fflush(stdout);
}

// Integer labels laid out as a grid (e.g. "which block / warp wrote this element").
// Each cell shows its label; colors group equal labels.
inline void labels(const char* title, const int* data, int rows, int cols) {
    fflush(stdout);
    printf("@@VIZ {\"type\":\"labels\",\"title\":"); detail::name(title);
    printf(",\"rows\":%d,\"cols\":%d,\"data\":[", rows, cols);
    int total = rows * cols; if (total > 16384) total = 16384;
    for (int i = 0; i < total; ++i) { if (i) putchar(','); printf("%d", data[i]); }
    printf("]}\n");
    fflush(stdout);
}

// One timing measurement. All timings in a run are drawn together as one bar chart.
inline void timing(const char* label, float ms) {
    fflush(stdout);
    printf("@@VIZ {\"type\":\"timing\",\"title\":"); detail::name(label);
    printf(",\"ms\":"); detail::num(ms); printf("}\n");
    fflush(stdout);
}

// Effective memory bandwidth, compared in the UI against the GPU's peak.
inline void bandwidth(const char* label, double bytes, float ms) {
    fflush(stdout);
    printf("@@VIZ {\"type\":\"bandwidth\",\"title\":"); detail::name(label);
    printf(",\"gbps\":"); detail::num(bytes / (ms * 1e-3) / 1e9); printf("}\n");
    fflush(stdout);
}

}  // namespace viz
