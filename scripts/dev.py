"""Start the local HIS and clean up only the process groups created here."""

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]


def main():
    for port in (8000, 5173):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                print(
                    f"端口 {port} 已被占用。请使用正在运行的服务，或先停止占用该端口的进程。", file=sys.stderr
                )
                return 1

    log_dir = ROOT / ".local" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    processes = []
    logs = []

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        commands = [
            (
                "backend",
                ROOT / "medicinebackend",
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8000",
                    "--reload",
                ],
            ),
            ("frontend", ROOT / "medicinefronted", ["npm", "run", "dev"]),
        ]
        for name, directory, command in commands:
            log = (log_dir / f"{name}.log").open("a")
            logs.append(log)
            processes.append(
                subprocess.Popen(
                    command, cwd=directory, stdout=log, stderr=subprocess.STDOUT, start_new_session=True
                )
            )
        print("正在启动青禾 HIS…", flush=True)
        deadline = time.monotonic() + 30
        opener = build_opener(ProxyHandler({}))
        pending = {"http://127.0.0.1:8000/api/v1/health", "http://127.0.0.1:5173/"}
        while pending:
            if any(process.poll() is not None for process in processes):
                raise RuntimeError(f"服务提前退出，请查看 {log_dir}")
            for url in tuple(pending):
                try:
                    with opener.open(url, timeout=1) as response:
                        if response.status == 200:
                            pending.remove(url)
                except (URLError, TimeoutError, ConnectionError):
                    pass
            if time.monotonic() > deadline:
                raise RuntimeError(f"启动超时，请查看 {log_dir}")
            if pending:
                time.sleep(0.2)
        print(
            "\n前端：http://127.0.0.1:5173\n接口文档：http://127.0.0.1:8000/docs\n"
            f"日志：{log_dir}\n按 Ctrl+C 停止本次启动的服务。\n",
            flush=True,
        )
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        raise RuntimeError(f"服务已停止，请查看 {log_dir}")
    except KeyboardInterrupt:
        print("\n正在停止本次启动的服务…", flush=True)
        return 0
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        for process in processes:
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
        for log in logs:
            log.close()


if __name__ == "__main__":
    raise SystemExit(main())
