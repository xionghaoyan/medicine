from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile

from app import schemas
from app.errors import require
from app.security import current_user, require_roles
from app.services import catalog
from app.services.analytics import safe_csv
from app.services.common import Actor, today

router = APIRouter(tags=["药品库存"])
stock_roles = require_roles("admin", "pharmacist")


@router.get("/drugs")
def drugs(
    request: Request,
    q: str = Query("", max_length=100),
    low_stock: bool = False,
    expiring: bool = False,
    active_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: Actor = Depends(current_user),
):
    with request.app.state.db.read() as conn:
        return catalog.list_drugs(conn, q, low_stock, expiring, active_only, page, page_size)


@router.post("/drugs", status_code=201)
def create_drug(payload: schemas.DrugInput, request: Request, actor: Actor = Depends(require_roles("admin"))):
    with request.app.state.db.transaction() as conn:
        return catalog.save_drug(conn, payload, actor)


@router.get("/drugs/import-template")
def import_template(actor: Actor = Depends(stock_roles)):
    expiry = (date.fromisoformat(today()) + timedelta(days=365)).isoformat()
    content = safe_csv(
        [
            catalog.CSV_FIELDS,
            [
                "MED001",
                "阿莫西林胶囊",
                "青禾示例",
                "0.25g × 24粒",
                "胶囊剂",
                "盒",
                1200,
                "A",
                "教学药品示例厂",
                20,
                "IMPORT-001",
                50,
                expiry,
            ],
        ]
    )
    return Response(
        content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="drug-import-template.csv"'},
    )


@router.post("/drugs/import")
def import_drugs(request: Request, file: UploadFile = File(...), actor: Actor = Depends(stock_roles)):
    require(file.filename and file.filename.lower().endswith(".csv"), "请选择 .csv 文件", 400, "INVALID_CSV")
    data = file.file.read(2 * 1024 * 1024 + 1)
    with request.app.state.db.transaction() as conn:
        return catalog.import_csv(conn, data, actor)


@router.patch("/drugs/{drug_id}")
def update_drug(
    drug_id: int, payload: schemas.DrugInput, request: Request, actor: Actor = Depends(require_roles("admin"))
):
    with request.app.state.db.transaction() as conn:
        return catalog.save_drug(conn, payload, actor, drug_id)


@router.get("/drugs/{drug_id}/batches")
def drug_batches(drug_id: int, request: Request, actor: Actor = Depends(stock_roles)):
    with request.app.state.db.read() as conn:
        return catalog.batches(conn, drug_id)


@router.post("/stock/receive", status_code=201)
def receive(payload: schemas.ReceiveInput, request: Request, actor: Actor = Depends(stock_roles)):
    with request.app.state.db.transaction() as conn:
        return catalog.receive_stock(conn, payload, actor)
