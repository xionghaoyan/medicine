import logging
import sqlite3
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, load_settings
from app.database import Database
from app.errors import BusinessError
from app.routers import administration, auth, catalog, clinic
from app.security import LoginLimiter
from app.seed import seed_demo
from app.services.administration import read_settings
from app.services.common import today

logger = logging.getLogger("dudu.his")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    database = Database(settings.database_path)

    @asynccontextmanager
    async def lifespan(app):
        database.migrate()
        if settings.seed_demo:
            seed_demo(database, settings.demo_password)
        yield

    app = FastAPI(
        title="dudu HIS", description="门诊业务、药品库存与机构管理 API", version="1.0.0", lifespan=lifespan
    )
    app.state.settings = settings
    app.state.db = database
    app.state.login_limiter = LoginLimiter()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "OPTIONS"],
        allow_headers=["Content-Type", "X-Requested-With"],
    )

    @app.middleware("http")
    async def request_safety(request: Request, call_next):
        request.state.request_id = uuid.uuid4().hex[:12]
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("origin")
            if origin and origin not in settings.cors_origins:
                return JSONResponse(
                    {"error": {"code": "INVALID_ORIGIN", "message": "请求来源未获允许"}}, status_code=403
                )
            if request.headers.get("x-requested-with") != "his-web":
                return JSONResponse(
                    {"error": {"code": "CSRF_REJECTED", "message": "缺少安全请求标识"}}, status_code=403
                )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(BusinessError)
    async def business_error(request: Request, exc: BusinessError):
        error = {"code": exc.code, "message": exc.message}
        if exc.details is not None:
            error["details"] = exc.details
        return JSONResponse({"error": error}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(v) for v in e["loc"] if v != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(
            {"error": {"code": "VALIDATION_ERROR", "message": "请检查输入内容", "details": details}},
            status_code=422,
        )

    @app.exception_handler(sqlite3.IntegrityError)
    async def integrity_error(request: Request, exc: sqlite3.IntegrityError):
        logger.warning("Database constraint at request %s: %s", request.state.request_id, exc)
        return JSONResponse(
            {"error": {"code": "DATA_CONFLICT", "message": "记录已存在或数据状态冲突，请刷新后核对"}},
            status_code=409,
        )

    @app.exception_handler(sqlite3.OperationalError)
    async def database_error(request: Request, exc: sqlite3.OperationalError):
        logger.exception("Database failure at request %s", request.state.request_id)
        return JSONResponse(
            {"error": {"code": "DATABASE_BUSY", "message": "数据服务暂忙，请稍后重试"}}, status_code=503
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        logger.exception("Unexpected failure at request %s", request.state.request_id, exc_info=exc)
        return JSONResponse(
            {"error": {"code": "INTERNAL_ERROR", "message": "服务暂时异常，请稍后重试"}}, status_code=500
        )

    @app.get("/api/v1/health", tags=["运行状态"])
    def health():
        with database.read() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"status": "ok", "database": "connected", "version": "1.0.0"}

    @app.get("/api/v1/meta", tags=["运行状态"])
    def meta():
        with database.read() as conn:
            info = read_settings(conn)
        return {
            "hospital_name": info["hospital_name"] or "dudu 医疗",
            "date": today(),
            "demo_mode": settings.seed_demo,
        }

    for router in (auth.router, clinic.router, catalog.router, administration.router):
        app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
