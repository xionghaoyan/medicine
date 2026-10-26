from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Request, Response

from app import schemas
from app.security import current_user, require_roles
from app.services import administration, analytics, catalog
from app.services.common import Actor, today

router = APIRouter(tags=["运营管理"])
admin_role = require_roles("admin")
finance_roles = require_roles("admin", "cashier")


@router.get("/dashboard")
def dashboard(request: Request, actor: Actor = Depends(current_user)):
    with request.app.state.db.read() as conn:
        return analytics.dashboard(conn, actor)


@router.get("/reports")
def reports(
    request: Request,
    start_date: date | None = None,
    end_date: date | None = None,
    actor: Actor = Depends(finance_roles),
):
    end = end_date or date.fromisoformat(today())
    start = start_date or end - timedelta(days=6)
    with request.app.state.db.read() as conn:
        return analytics.report(conn, start.isoformat(), end.isoformat())


@router.get("/reports/export")
def export_report(request: Request, start_date: date, end_date: date, actor: Actor = Depends(finance_roles)):
    with request.app.state.db.read() as conn:
        report = analytics.report(conn, start_date.isoformat(), end_date.isoformat())
    content = [["日期", "有效挂号数", "收款笔数", "收款金额（元）", "退费金额（元）", "净收入（元）"]]
    content.extend(
        [
            [
                r["date"],
                r["visits"],
                r["charges"],
                f"{r['paid_cents'] / 100:.2f}",
                f"{r['refund_cents'] / 100:.2f}",
                f"{r['revenue_cents'] / 100:.2f}",
            ]
            for r in report["daily"]
        ]
    )
    return Response(
        analytics.safe_csv(content),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="his-report-{start_date}.csv"'},
    )


@router.get("/audit-logs")
def audit_logs(
    request: Request,
    q: str = Query("", max_length=100),
    action: str = Query("", max_length=60),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: Actor = Depends(admin_role),
):
    with request.app.state.db.read() as conn:
        return analytics.audit_list(conn, q, action, page, page_size)


@router.get("/search")
def search(request: Request, q: str = Query("", max_length=100), actor: Actor = Depends(current_user)):
    if not q.strip():
        return []
    with request.app.state.db.read() as conn:
        if actor.role == "pharmacist":
            found = catalog.list_drugs(conn, q=q, page_size=6)["items"]
            return [
                {
                    "id": item["id"],
                    "title": item["generic_name"],
                    "subtitle": item["drug_code"],
                    "path": "/inventory",
                    "query": item["drug_code"],
                    "type": "drug",
                }
                for item in found
            ]
        found = catalog.list_patients(conn, actor, q=q, page_size=6)["items"]
        return [
            {
                "id": item["id"],
                "title": item["full_name"],
                "subtitle": item["patient_no"],
                "path": "/patients",
                "query": item["patient_no"],
                "type": "patient",
            }
            for item in found
        ]


@router.get("/settings")
def settings(request: Request, actor: Actor = Depends(current_user)):
    with request.app.state.db.read() as conn:
        return administration.read_settings(conn)


@router.put("/settings")
def update_settings(payload: schemas.HospitalInput, request: Request, actor: Actor = Depends(admin_role)):
    with request.app.state.db.transaction() as conn:
        return administration.update_settings(conn, payload, actor)


@router.get("/users")
def users(request: Request, actor: Actor = Depends(admin_role)):
    with request.app.state.db.read() as conn:
        return administration.list_users(conn)


@router.post("/users", status_code=201)
def create_user(payload: schemas.UserCreate, request: Request, actor: Actor = Depends(admin_role)):
    with request.app.state.db.transaction() as conn:
        return administration.create_user(conn, payload, actor)


@router.patch("/users/{user_id}")
def update_user(
    user_id: int, payload: schemas.UserUpdate, request: Request, actor: Actor = Depends(admin_role)
):
    with request.app.state.db.transaction() as conn:
        return administration.update_user(conn, user_id, payload, actor)
