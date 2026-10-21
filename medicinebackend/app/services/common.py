import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.errors import BusinessError

SHANGHAI = ZoneInfo("Asia/Shanghai")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def today() -> str:
    return datetime.now(SHANGHAI).date().isoformat()


def serial(prefix: str) -> str:
    return f"{prefix}{datetime.now(SHANGHAI):%y%m%d}{secrets.token_hex(3).upper()}"


@dataclass
class Actor:
    id: int
    display_name: str
    role: str
    doctor_id: int | None = None
    session_id: str = ""
    ip: str = ""


def audit(conn, actor: Actor, action: str, entity: str, entity_id, details=None, timestamp=None):
    conn.execute(
        """INSERT INTO audit_logs(user_id,actor_name,action,entity_type,entity_id,details,ip_address,created_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (
            actor.id,
            actor.display_name,
            action,
            entity,
            str(entity_id),
            json.dumps(details or {}, ensure_ascii=False),
            actor.ip,
            timestamp or now(),
        ),
    )


def one(conn, sql: str, params=(), message="记录不存在") -> dict:
    row = conn.execute(sql, params).fetchone()
    if row is None:
        raise BusinessError(404, "NOT_FOUND", message)
    return dict(row)


def rows(conn, sql: str, params=()) -> list[dict]:
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def paginate(conn, sql: str, params=(), page=1, page_size=20, order="id DESC") -> dict:
    total = conn.execute(f"SELECT COUNT(*) FROM ({sql})", params).fetchone()[0]
    items = rows(
        conn, f"{sql} ORDER BY {order} LIMIT ? OFFSET ?", (*params, page_size, (page - 1) * page_size)
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def assert_doctor_owner(actor: Actor, doctor_id: int):
    if actor.role == "doctor" and actor.doctor_id != doctor_id:
        raise BusinessError(403, "FORBIDDEN", "您只能处理本人负责的诊疗记录")


def user_public(row) -> dict:
    return {key: row[key] for key in ("id", "username", "display_name", "role", "doctor_id", "active")}
