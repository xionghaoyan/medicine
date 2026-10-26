import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, Request, Response

from app.errors import BusinessError
from app.schemas import Login
from app.security import COOKIE_NAME, current_user, verify_password
from app.services.common import Actor, audit, now, one, user_public

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/login")
def login(payload: Login, request: Request, response: Response):
    db = request.app.state.db
    settings = request.app.state.settings
    ip = request.client.host if request.client else "local"
    limiter = request.app.state.login_limiter
    key = (ip, payload.username.lower())
    limiter.check(key)
    with db.read() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (payload.username,)).fetchone()
    if row is None or not row["active"] or not verify_password(payload.password, row["password_hash"]):
        limiter.fail(key)
        raise BusinessError(401, "INVALID_CREDENTIALS", "账号或密码不正确")
    limiter.clear(key)
    jti = secrets.token_urlsafe(24)
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.session_hours)
    actor = Actor(row["id"], row["display_name"], row["role"], row["doctor_id"], jti, ip)
    with db.transaction() as conn:
        conn.execute("DELETE FROM auth_sessions WHERE expires_at<=?", (now(),))
        conn.execute(
            "INSERT INTO auth_sessions(jti,user_id,expires_at) VALUES (?,?,?)",
            (jti, row["id"], expires.isoformat(timespec="seconds").replace("+00:00", "Z")),
        )
        audit(conn, actor, "auth.login", "user", row["id"])
    token = jwt.encode(
        {"sub": str(row["id"]), "role": row["role"], "jti": jti, "exp": expires},
        settings.jwt_secret,
        algorithm="HS256",
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/api",
    )
    return user_public(row)


@router.get("/me")
def me(request: Request, actor: Actor = Depends(current_user)):
    with request.app.state.db.read() as conn:
        return user_public(one(conn, "SELECT * FROM users WHERE id=?", (actor.id,)))


@router.post("/logout")
def logout(request: Request, response: Response, actor: Actor = Depends(current_user)):
    with request.app.state.db.transaction() as conn:
        conn.execute("DELETE FROM auth_sessions WHERE jti=?", (actor.session_id,))
        audit(conn, actor, "auth.logout", "user", actor.id)
    response.delete_cookie(COOKIE_NAME, path="/api", httponly=True, samesite="lax")
    return {"message": "已安全退出"}
