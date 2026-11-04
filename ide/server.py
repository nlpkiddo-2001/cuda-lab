"""CUDA Lab — a small web IDE for learning CUDA.

Compiles .cu code with nvcc, runs it on a chosen GPU, and returns program output,
ptxas resource usage (registers / shared mem / spills), PTX, and @@VIZ chart data.

Run:  ./start.sh          (or: python ide/server.py --port 8090)
"""
import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
LESSONS = ROOT / "lessons"
WORK = ROOT / "my-work"
BUILD = ROOT / "build"
INCLUDE = ROOT / "include"
STUB_LIB = ROOT / ".toolchain" / "lib"   # empty libcudadevrt.a (toolkit ships without it)
STATIC = Path(__file__).resolve().parent / "static"

CONDA_ENV = Path(os.environ.get("CUDA_ENV", "/opt/conda/envs/voice-pipeline"))
NVCC = os.environ.get("NVCC") or shutil.which("nvcc") or str(CONDA_ENV / "bin" / "nvcc")
CUDA_LIB = Path(os.environ.get("CUDA_LIB", Path(NVCC).resolve().parent.parent / "lib"))
ARCH = os.environ.get("CUDA_ARCH", "sm_86")   # RTX A6000

COMPILE_TIMEOUT = 60
RUN_TIMEOUT = 30
MAX_OUTPUT = 200_000
PLAYGROUND = "playground"
SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")

app = FastAPI()


def _check_id(lesson_id: str) -> str:
    if not SAFE_ID.match(lesson_id):
        raise HTTPException(400, "bad lesson id")
    return lesson_id


def _read(p: Path) -> str | None:
    return p.read_text() if p.exists() else None


# ---------------------------------------------------------------- lessons
@app.get("/api/lessons")
def lessons():
    cur = json.loads((LESSONS / "curriculum.json").read_text())
    for module in cur["modules"]:
        for les in module["lessons"]:
            les["available"] = (LESSONS / les["id"] / "lesson.md").exists()
            les["started"] = (WORK / f"{les['id']}.cu").exists()
    return cur


@app.get("/api/lesson/{lesson_id}")
def lesson(lesson_id: str):
    _check_id(lesson_id)
    if lesson_id == PLAYGROUND:
        starter = _read(LESSONS / "playground.cu") or ""
        return {"id": lesson_id, "markdown": _read(LESSONS / "playground.md") or "",
                "starter": starter, "work": _read(WORK / f"{PLAYGROUND}.cu"),
                "has_solution": False}
    d = LESSONS / lesson_id
    if not (d / "lesson.md").exists():
        raise HTTPException(404, "lesson not found")
    return {"id": lesson_id, "markdown": _read(d / "lesson.md"),
            "starter": _read(d / "starter.cu") or "", "work": _read(WORK / f"{lesson_id}.cu"),
            "has_solution": (d / "solution.cu").exists()}


@app.get("/api/lesson/{lesson_id}/solution")
def solution(lesson_id: str):
    _check_id(lesson_id)
    s = _read(LESSONS / lesson_id / "solution.cu")
    if s is None:
        raise HTTPException(404, "no solution")
    return {"code": s}


class SaveReq(BaseModel):
    id: str
    code: str


@app.post("/api/save")
def save(req: SaveReq):
    _check_id(req.id)
    WORK.mkdir(exist_ok=True)
    (WORK / f"{req.id}.cu").write_text(req.code)
    return {"ok": True}


# ---------------------------------------------------------------- GPUs
@app.get("/api/gpus")
def gpus():
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,name,memory.used,memory.total,utilization.gpu,temperature.gpu",
             "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10).stdout
    except Exception as e:  # noqa: BLE001
        return {"gpus": [], "error": str(e)}
    res = []
    for line in out.strip().splitlines():
        idx, name, used, total, util, temp = [x.strip() for x in line.split(",")]
        res.append({"index": int(idx), "name": name, "mem_used": int(used), "mem_total": int(total),
                    "util": int(util), "temp": int(temp)})
    return {"gpus": res}


# ---------------------------------------------------------------- compile + run
class RunReq(BaseModel):
    id: str
    code: str
    gpu: int = 1
    args: str = ""
    flags: str = "-O3"
    mode: str = "run"   # run | ptx


def _run_limited(cmd, env=None, cwd=None, timeout=RUN_TIMEOUT):
    """Run cmd in its own process group; kill the whole group on timeout."""
    t0 = time.perf_counter()
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=cwd,
                         start_new_session=True, text=True, errors="replace")
    timed_out = False
    try:
        out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(p.pid, signal.SIGKILL)
        out, err = p.communicate()
    ms = (time.perf_counter() - t0) * 1000
    return p.returncode, out[:MAX_OUTPUT], err[:MAX_OUTPUT], ms, timed_out


def _demangle(names):
    if not names:
        return {}
    try:
        out = subprocess.run(["c++filt"], input="\n".join(names), capture_output=True, text=True,
                             timeout=5).stdout.splitlines()
        return dict(zip(names, out))
    except Exception:  # noqa: BLE001
        return {n: n for n in names}


def _parse_ptxas(log: str):
    """Pull per-kernel register / smem / spill info out of `-Xptxas -v` output."""
    kernels, cur = [], None
    for line in log.splitlines():
        m = re.search(r"Compiling entry function '([^']+)'", line)
        if m:
            cur = {"mangled": m.group(1), "registers": 0, "smem": 0, "cmem": 0,
                   "spill_stores": 0, "spill_loads": 0, "stack": 0}
            kernels.append(cur)
            continue
        if cur is None:
            continue
        if m := re.search(r"(\d+) bytes stack frame, (\d+) bytes spill stores, (\d+) bytes spill loads", line):
            cur["stack"], cur["spill_stores"], cur["spill_loads"] = map(int, m.groups())
        if m := re.search(r"Used (\d+) registers", line):
            cur["registers"] = int(m.group(1))
        if m := re.search(r"(\d+) bytes smem", line):
            cur["smem"] = int(m.group(1))
        if m := re.search(r"(\d+) bytes cmem\[0\]", line):
            cur["cmem"] = int(m.group(1))
    names = _demangle([k["mangled"] for k in kernels])
    for k in kernels:
        k["name"] = names.get(k["mangled"], k["mangled"])
    return kernels


def _clean_log(log: str, src: Path) -> str:
    lines = [l for l in log.splitlines()
             if "Skipping incompatible" not in l and not l.startswith("ptxas info")
             and not re.match(r"^\s+\d+ bytes stack frame", l)]
    return "\n".join(lines).replace(str(src), "main.cu")


def _split_viz(stdout: str):
    viz, text = [], []
    for line in stdout.splitlines():
        if line.startswith("@@VIZ "):
            try:
                viz.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                text.append(line)
        else:
            text.append(line)
    return "\n".join(text), viz


@app.post("/api/run")
def run(req: RunReq):
    _check_id(req.id)
    WORK.mkdir(exist_ok=True)
    (WORK / f"{req.id}.cu").write_text(req.code)

    bdir = BUILD / req.id
    bdir.mkdir(parents=True, exist_ok=True)
    src, exe = bdir / "main.cu", bdir / "main"
    src.write_text(req.code)
    user_flags = [f for f in req.flags.split() if f.startswith("-") and not f.startswith("-o")]

    base = [NVCC, f"-arch={ARCH}", "-std=c++17", "-lineinfo", f"-I{INCLUDE}", *user_flags]
    if req.mode == "ptx":
        rc, out, err, ms, to = _run_limited([*base, "-ptx", str(src), "-o", str(bdir / "main.ptx")],
                                            timeout=COMPILE_TIMEOUT)
        return {"compile": {"ok": rc == 0, "log": _clean_log(out + err, src), "ms": ms},
                "ptx": _read(bdir / "main.ptx") if rc == 0 else None}

    if exe.exists():
        exe.unlink()
    cmd = [*base, "-Xptxas", "-v", "-cudart", "shared", f"-L{CUDA_LIB}", f"-L{STUB_LIB}",
           "-Xlinker", f"-rpath,{CUDA_LIB}", str(src), "-o", str(exe)]
    rc, out, err, cms, cto = _run_limited(cmd, timeout=COMPILE_TIMEOUT)
    log = out + err
    compile_res = {"ok": rc == 0 and exe.exists(), "log": _clean_log(log, src), "ms": cms,
                   "timed_out": cto, "kernels": _parse_ptxas(log)}
    if not compile_res["ok"]:
        return {"compile": compile_res, "run": None, "viz": []}

    env = {**os.environ, "CUDA_VISIBLE_DEVICES": str(req.gpu)}
    rc, out, err, rms, rto = _run_limited([str(exe), *req.args.split()], env=env, cwd=bdir)
    text, viz = _split_viz(out)
    return {"compile": compile_res,
            "run": {"exit_code": rc, "stdout": text, "stderr": err, "ms": rms, "timed_out": rto,
                    "gpu": req.gpu},
            "viz": viz}


# ---------------------------------------------------------------- static
@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.exception_handler(Exception)
def on_error(_, exc):
    return JSONResponse({"error": str(exc)}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8090)
    a = ap.parse_args()
    print(f"CUDA Lab: nvcc={NVCC} arch={ARCH} -> http://{a.host}:{a.port}")
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")
