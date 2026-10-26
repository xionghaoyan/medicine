#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  printf '请先安装 Node.js 20.19+ 或 22.12+（含 npm）。\n' >&2
  exit 1
fi
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22)) { console.error("当前 Node.js 版本不满足 Vite 要求，请使用 20.19+ 或 22.12+。"); process.exit(1) }'

python_bin="$project_dir/medicinebackend/.venv/bin/python"
if [[ ! -x "$python_bin" ]]; then
  bootstrap_python="${PYTHON_BIN:-}"
  if [[ -z "$bootstrap_python" ]]; then
    for candidate in python3.12 python3.13 python3.11 python3.14 python3; do
      if command -v "$candidate" >/dev/null && "$candidate" -c 'import sys; assert sys.version_info >= (3, 11)' 2>/dev/null; then
        bootstrap_python="$candidate"
        break
      fi
    done
  fi
  if [[ -z "$bootstrap_python" ]]; then
    printf '需要 Python 3.11+。安装后重试，或指定 PYTHON_BIN=/path/to/python ./start.sh。\n' >&2
    exit 1
  fi
  "$bootstrap_python" -c 'import sys; assert sys.version_info >= (3, 11), "需要 Python 3.11+"'
  "$bootstrap_python" -m venv medicinebackend/.venv
fi

if ! "$python_bin" -c 'import fastapi, uvicorn, bcrypt, jwt, multipart, dotenv' 2>/dev/null; then
  "$python_bin" -m pip install -r medicinebackend/requirements.txt
fi
if [[ ! -x medicinefronted/node_modules/.bin/vite ]]; then
  npm ci --prefix medicinefronted
fi

exec "$python_bin" scripts/dev.py
