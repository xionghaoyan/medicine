import time
from collections import defaultdict
from threading import Lock

import bcrypt
import jwt
from fastapi import Depends, Request

from app.errors import BusinessError
from app.services.common import Actor, now

COOKIE_NAME = "his_session"


def hash_password(password: str) -> str:
    if len(password.encode()) > 72:
        raise BusinessError(422, "VALIDATION_ERROR", "密码 UTF-8 长度不能超过 72 字节")
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if len(password.encode()) > 72:
        return False
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def current_user(request: Request) -> Actor:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise BusinessError(401, "UNAUTHENTICATED", "请先登录后继续操作")
    try:
        payload = jwt.decode(
            token,
            request.app.state.settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "jti"]},
        )
        user_id = int(payload["sub"])
        jti = payload["jti"]
    except (jwt.PyJWTError, ValueError, KeyError):
        raise BusinessError(401, "SESSION_EXPIRED", "登录已过期，请重新登录") from None
    with request.app.state.db.read() as conn:
        row = conn.execute(
            """SELECT u.* FROM users u JOIN auth_sessions s ON s.user_id=u.id
               WHERE u.id=? AND u.active=1 AND s.jti=? AND s.expires_at>?""",
            (user_id, jti, now()),
        ).fetchone()
    if row is None:
        raise BusinessError(401, "SESSION_EXPIRED", "会话已结束，请重新登录")
    return Actor(
        id=row["id"],
        display_name=row["display_name"],
        role=row["role"],
        doctor_id=row["doctor_id"],
        session_id=jti,
        ip=request.client.host if request.client else "",
    )


def require_roles(*roles):
    def dependency(actor: Actor = Depends(current_user)) -> Actor:
        if actor.role not in roles:
            raise BusinessError(403, "FORBIDDEN", "当前角色没有此操作权限")
        return actor

    return dependency


class LoginLimiter:
    def __init__(self):
        self.failures = defaultdict(list)
        self.lock = Lock()

    def check(self, key):
        with self.lock:
            current = time.monotonic()
            self.failures[key] = [t for t in self.failures[key] if current - t < 60]
            if len(self.failures[key]) >= 5:
                raise BusinessError(429, "TOO_MANY_ATTEMPTS", "尝试次数较多，请 1 分钟后再试")

    def fail(self, key):
        with self.lock:
            self.failures[key].append(time.monotonic())

    def clear(self, key):
        with self.lock:
            self.failures.pop(key, None)
