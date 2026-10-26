import sqlite3
from contextlib import contextmanager
from pathlib import Path


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=5, isolation_level=None, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        return conn

    @contextmanager
    def read(self):
        conn = self.connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self):
        conn = self.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def migrate(self):
        with self.read() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
            for migration in sorted((Path(__file__).parent / "migrations").glob("*.sql")):
                if migration.stem in applied:
                    continue
                backup_path = self.path.with_name(f"{self.path.stem}.before-{migration.stem}.sqlite3")
                with sqlite3.connect(backup_path) as backup:
                    conn.backup(backup)
                # Migration names are trusted repository filenames, never client input.
                version = migration.stem.replace("'", "''")
                script = (
                    "BEGIN IMMEDIATE;\n"
                    + migration.read_text()
                    + f"\nINSERT INTO schema_migrations(version) VALUES ('{version}');\nCOMMIT;"
                )
                try:
                    conn.executescript(script)
                except Exception:
                    conn.rollback()
                    raise
