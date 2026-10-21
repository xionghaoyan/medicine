from app.errors import require
from app.security import hash_password
from app.services.common import audit, now, one, rows, user_public


def list_users(conn):
    return rows(
        conn,
        """SELECT u.id,u.username,u.display_name,u.role,u.doctor_id,u.active,u.created_at,
        d.name AS doctor_name FROM users u LEFT JOIN doctors d ON d.id=u.doctor_id ORDER BY u.id""",
    )


def create_user(conn, payload, actor):
    if payload.role == "doctor":
        require(payload.doctor_id is not None, "医生账户必须关联医生档案", 422, "VALIDATION_ERROR")
        one(conn, "SELECT id FROM doctors WHERE id=?", (payload.doctor_id,), "医生档案不存在")
    password_hash = hash_password(payload.password)
    user_id = conn.execute(
        """INSERT INTO users(username,password_hash,display_name,role,doctor_id,created_at)
        VALUES (?,?,?,?,?,?)""",
        (
            payload.username,
            password_hash,
            payload.display_name,
            payload.role,
            payload.doctor_id if payload.role == "doctor" else None,
            now(),
        ),
    ).lastrowid
    audit(conn, actor, "user.create", "user", user_id, {"username": payload.username, "role": payload.role})
    return user_public(one(conn, "SELECT * FROM users WHERE id=?", (user_id,)))


def update_user(conn, user_id, payload, actor):
    current = one(conn, "SELECT * FROM users WHERE id=?", (user_id,), "账户不存在")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if key != "doctor_id":
            require(value is not None, f"{key} 不能为 null", 422, "VALIDATION_ERROR")
    updated = {**current, **changes}
    if (
        current["role"] == "admin"
        and current["active"]
        and (updated["role"] != "admin" or not updated["active"])
    ):
        require(
            conn.execute("SELECT COUNT(*) FROM users WHERE role='admin' AND active=1").fetchone()[0] > 1,
            "至少保留一位启用的管理员",
        )
    if updated["role"] == "doctor":
        require(updated["doctor_id"] is not None, "医生账户必须关联医生档案", 422, "VALIDATION_ERROR")
        one(conn, "SELECT id FROM doctors WHERE id=?", (updated["doctor_id"],), "医生档案不存在")
    else:
        updated["doctor_id"] = None
    if changes.get("password"):
        updated["password_hash"] = hash_password(changes["password"])
    conn.execute(
        """UPDATE users SET display_name=?,role=?,doctor_id=?,active=?,password_hash=? WHERE id=?""",
        (
            updated["display_name"],
            updated["role"],
            updated["doctor_id"],
            int(updated["active"]),
            updated["password_hash"],
            user_id,
        ),
    )
    if set(changes) & {"password", "active", "role", "doctor_id"}:
        conn.execute("DELETE FROM auth_sessions WHERE user_id=?", (user_id,))
    audit(
        conn,
        actor,
        "user.update",
        "user",
        user_id,
        {
            "fields": [key for key in changes if key != "password"],
            "password_changed": bool(changes.get("password")),
        },
    )
    return user_public(one(conn, "SELECT * FROM users WHERE id=?", (user_id,)))


def read_settings(conn):
    keys = ("hospital_name", "phone", "address")
    values = {row["key"]: row["value"] for row in conn.execute("SELECT * FROM settings")}
    return {key: values.get(key, "") for key in keys}


def update_settings(conn, payload, actor):
    for key, value in payload.model_dump().items():
        conn.execute(
            "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
    audit(
        conn, actor, "settings.update", "settings", "hospital", {"fields": list(type(payload).model_fields)}
    )
    return read_settings(conn)
