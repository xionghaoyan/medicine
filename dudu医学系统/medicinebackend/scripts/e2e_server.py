"""Run an isolated API for Playwright; never open the user's business database."""

from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn

from app.config import Settings
from app.main import create_app

if __name__ == "__main__":
    with TemporaryDirectory(prefix="dudu-his-e2e-") as directory:
        settings = Settings(
            database_path=Path(directory) / "e2e.sqlite3",
            jwt_secret="isolated-browser-test-secret-" * 3,
            cors_origins=("http://127.0.0.1:15178",),
        )
        uvicorn.run(create_app(settings), host="127.0.0.1", port=18008, log_level="warning")
