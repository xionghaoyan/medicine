import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass
class Settings:
    database_path: Path
    jwt_secret: str
    seed_demo: bool = True
    demo_password: str = "MedDemo2026!"
    session_hours: int = 8
    cookie_secure: bool = False
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")


def load_settings() -> Settings:
    path = Path(os.getenv("DATABASE_PATH", "data/his.sqlite3"))
    if not path.is_absolute():
        path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    secret = os.getenv("JWT_SECRET", "").strip()
    if not secret:
        secret_path = path.parent / ".jwt_secret"
        if not secret_path.exists():
            try:
                fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "w") as handle:
                    handle.write(secrets.token_urlsafe(48))
            except FileExistsError:
                pass
        secret = secret_path.read_text().strip()
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET must contain at least 32 characters")
    return Settings(
        database_path=path,
        jwt_secret=secret,
        seed_demo=os.getenv("SEED_DEMO", "true").lower() == "true",
        demo_password=os.getenv("DEMO_PASSWORD", "MedDemo2026!"),
        session_hours=int(os.getenv("SESSION_HOURS", "8")),
        cookie_secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        cors_origins=tuple(
            x.strip()
            for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if x.strip()
        ),
    )
