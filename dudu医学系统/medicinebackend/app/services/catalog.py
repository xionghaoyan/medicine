import csv
import io
import sqlite3
from datetime import date, timedelta

from pydantic import ValidationError

from app.errors import BusinessError, require
from app.schemas import DrugInput, ReceiveInput
from app.services.common import audit, now, one, paginate, rows, serial, today


def drug_sql():
    return """SELECT d.*,
      COALESCE(SUM(b.quantity),0) AS total_stock,
      COALESCE(SUM(b.reserved_quantity),0) AS reserved_stock,
      COALESCE(SUM(CASE WHEN b.expires_at >= :today THEN b.quantity-b.reserved_quantity ELSE 0 END),0) AS available_stock,
      MIN(CASE WHEN b.quantity>0 THEN b.expires_at END) AS nearest_expiry,
      COALESCE(SUM(CASE WHEN b.expires_at BETWEEN :today AND :soon THEN b.quantity ELSE 0 END),0) AS expiring_stock
      FROM drugs d LEFT JOIN stock_batches b ON b.drug_id=d.id GROUP BY d.id"""


def drug_bindings():
    return {"today": today(), "soon": (date.fromisoformat(today()) + timedelta(days=30)).isoformat()}


def get_drug(conn, drug_id):
    return one(
        conn, f"SELECT * FROM ({drug_sql()}) WHERE id=:id", {**drug_bindings(), "id": drug_id}, "药品不存在"
    )


def list_drugs(conn, q="", low_stock=False, expiring=False, active_only=False, page=1, page_size=20):
    params = drug_bindings()
    sql = f"SELECT * FROM ({drug_sql()}) WHERE 1=1"
    if q:
        sql += " AND (generic_name LIKE :q OR trade_name LIKE :q OR drug_code LIKE :q)"
        params["q"] = f"%{q}%"
    if low_stock:
        sql += " AND available_stock <= stock_threshold AND active=1"
    if expiring:
        sql += " AND (expiring_stock>0 OR nearest_expiry < :today)"
    if active_only:
        sql += " AND active=1"
    total = conn.execute(f"SELECT COUNT(*) FROM ({sql})", params).fetchone()[0]
    params.update(limit=page_size, offset=(page - 1) * page_size)
    items = rows(conn, sql + " ORDER BY active DESC,id LIMIT :limit OFFSET :offset", params)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def save_drug(conn, payload, actor, drug_id=None):
    require(actor.role == "admin", "只有管理员可以维护药品档案和价格", 403, "FORBIDDEN")
    data = payload.model_dump()
    data["active"] = int(data["active"])
    if drug_id is None:
        data["created_at"] = now()
        cursor = conn.execute(
            """INSERT INTO drugs(drug_code,generic_name,trade_name,specification,
            dosage_form,unit,price_cents,insurance_category,manufacturer,stock_threshold,active,created_at)
            VALUES (:drug_code,:generic_name,:trade_name,:specification,:dosage_form,:unit,:price_cents,
            :insurance_category,:manufacturer,:stock_threshold,:active,:created_at)""",
            data,
        )
        drug_id = cursor.lastrowid
        action = "drug.create"
    else:
        previous = one(conn, "SELECT * FROM drugs WHERE id=?", (drug_id,))
        if previous["specification"] != data["specification"] or previous["unit"] != data["unit"]:
            used = conn.execute(
                """SELECT 1 FROM stock_batches WHERE drug_id=?
                UNION ALL SELECT 1 FROM prescription_items WHERE drug_id=? LIMIT 1""",
                (drug_id, drug_id),
            ).fetchone()
            require(not used, "该药品已有库存或处方记录，不能更改规格和计量单位，请新建药品档案")
        conn.execute(
            """UPDATE drugs SET drug_code=:drug_code,generic_name=:generic_name,trade_name=:trade_name,
            specification=:specification,dosage_form=:dosage_form,unit=:unit,price_cents=:price_cents,
            insurance_category=:insurance_category,manufacturer=:manufacturer,stock_threshold=:stock_threshold,
            active=:active WHERE id=:id""",
            {**data, "id": drug_id},
        )
        action = "drug.update"
        audit(
            conn,
            actor,
            action,
            "drug",
            drug_id,
            {
                "name": data["generic_name"],
                "old_price_cents": previous["price_cents"],
                "new_price_cents": data["price_cents"],
            },
        )
        return get_drug(conn, drug_id)
    audit(
        conn,
        actor,
        action,
        "drug",
        drug_id,
        {"name": data["generic_name"], "price_cents": data["price_cents"]},
    )
    return get_drug(conn, drug_id)


def receive_stock(conn, payload, actor, timestamp=None):
    drug = one(conn, "SELECT * FROM drugs WHERE id=?", (payload.drug_id,), "药品不存在")
    require(drug["active"], "该药品已停用，请先启用档案")
    expiry = payload.expires_at.isoformat()
    require(expiry >= today(), "不能入库已过期药品")
    existing = conn.execute(
        "SELECT * FROM stock_batches WHERE drug_id=? AND batch_no=?", (payload.drug_id, payload.batch_no)
    ).fetchone()
    stamp = timestamp or now()
    if existing:
        require(existing["expires_at"] == expiry, "同一批号的有效期必须一致")
        batch_id = existing["id"]
        conn.execute("UPDATE stock_batches SET quantity=quantity+? WHERE id=?", (payload.quantity, batch_id))
    else:
        batch_id = conn.execute(
            """INSERT INTO stock_batches(drug_id,batch_no,quantity,expires_at,created_at)
            VALUES (?,?,?,?,?)""",
            (payload.drug_id, payload.batch_no, payload.quantity, expiry, stamp),
        ).lastrowid
    ref = serial("RK")
    conn.execute(
        """INSERT INTO stock_movements(drug_id,batch_id,quantity_delta,type,reference_no,operator_id,created_at)
        VALUES (?,?,?,'receive',?,?,?)""",
        (payload.drug_id, batch_id, payload.quantity, ref, actor.id, stamp),
    )
    audit(
        conn,
        actor,
        "stock.receive",
        "batch",
        batch_id,
        {"drug_name": drug["generic_name"], "batch_no": payload.batch_no, "quantity": payload.quantity},
        stamp,
    )
    return one(conn, "SELECT * FROM stock_batches WHERE id=?", (batch_id,))


CSV_FIELDS = [
    "drug_code",
    "generic_name",
    "trade_name",
    "specification",
    "dosage_form",
    "unit",
    "price_cents",
    "insurance_category",
    "manufacturer",
    "stock_threshold",
    "batch_no",
    "quantity",
    "expires_at",
]


def import_csv(conn, data: bytes, actor):
    if len(data) > 2 * 1024 * 1024:
        raise BusinessError(413, "FILE_TOO_LARGE", "CSV 文件不能超过 2MB")
    text = None
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    require(text is not None, "无法识别文件编码，请使用 UTF-8 CSV", 400, "INVALID_CSV")
    try:
        reader = csv.DictReader(io.StringIO(text), strict=True)
        require(
            reader.fieldnames and set(CSV_FIELDS).issubset(reader.fieldnames),
            "表头不完整，请下载并使用导入模板",
            400,
            "INVALID_CSV",
        )
        entries = list(reader)
    except csv.Error:
        raise BusinessError(400, "INVALID_CSV", "CSV 格式有误，请检查引号和分隔符") from None
    require(len(entries) <= 2000, "一次最多导入 2000 行", 413, "TOO_MANY_ROWS")
    require(bool(entries), "CSV 没有数据行", 400, "INVALID_CSV")
    result = {"success_count": 0, "skipped_count": 0, "failed_count": 0, "errors": []}
    for index, entry in enumerate(entries, 2):
        conn.execute("SAVEPOINT csv_row")
        try:
            archive = DrugInput(**{field: entry.get(field, "") for field in CSV_FIELDS[:10]})
            existing = conn.execute("SELECT * FROM drugs WHERE drug_code=?", (archive.drug_code,)).fetchone()
            if existing:
                require(
                    existing["generic_name"] == archive.generic_name
                    and existing["specification"] == archive.specification
                    and existing["unit"] == archive.unit
                    and existing["price_cents"] == archive.price_cents,
                    "与已有药品的名称、规格、单位或单价不一致，请先核对档案",
                )
                drug_id = existing["id"]
            else:
                require(actor.role == "admin", "药师只能导入已建档药品，新药品请联系管理员", 403, "FORBIDDEN")
                drug_id = save_drug(conn, archive, actor)["id"]
            receive = ReceiveInput(
                drug_id=drug_id,
                batch_no=entry["batch_no"],
                quantity=entry["quantity"],
                expires_at=entry["expires_at"],
            )
            duplicate = conn.execute(
                "SELECT * FROM stock_batches WHERE drug_id=? AND batch_no=?", (drug_id, receive.batch_no)
            ).fetchone()
            if duplicate:
                require(duplicate["expires_at"] == receive.expires_at.isoformat(), "已有批号的有效期不一致")
                result["skipped_count"] += 1
            else:
                receive_stock(conn, receive, actor)
                result["success_count"] += 1
            conn.execute("RELEASE csv_row")
        except (BusinessError, ValidationError, ValueError, KeyError, sqlite3.IntegrityError) as exc:
            conn.execute("ROLLBACK TO csv_row")
            conn.execute("RELEASE csv_row")
            message = (
                exc.message
                if isinstance(exc, BusinessError)
                else (
                    "；".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
                    if isinstance(exc, ValidationError)
                    else "字段格式错误，请核对模板"
                )
            )
            result["failed_count"] += 1
            result["errors"].append({"row": index, "message": message})
    audit(
        conn, actor, "drug.import", "import", serial("IM"), {k: v for k, v in result.items() if k != "errors"}
    )
    return result


def departments(conn):
    return rows(conn, "SELECT * FROM departments ORDER BY id")


def doctors(conn, department_id=None):
    sql = """SELECT d.*,dp.name AS department_name,dp.location FROM doctors d
             JOIN departments dp ON d.department_id=dp.id WHERE 1=1"""
    params = []
    if department_id:
        sql += " AND d.department_id=?"
        params.append(department_id)
    return rows(conn, sql + " ORDER BY d.id", params)


def batches(conn, drug_id):
    one(conn, "SELECT id FROM drugs WHERE id=?", (drug_id,))
    return rows(
        conn,
        """SELECT *,quantity-reserved_quantity AS available_quantity
        FROM stock_batches WHERE drug_id=? ORDER BY expires_at,id""",
        (drug_id,),
    )


def list_patients(conn, actor, q="", page=1, page_size=20):
    sql = "SELECT p.* FROM patients p WHERE 1=1"
    params = []
    if actor.role == "doctor":
        sql += """ AND EXISTS (SELECT 1 FROM registrations r JOIN schedules s ON r.schedule_id=s.id
                   WHERE r.patient_id=p.id AND s.doctor_id=?)"""
        params.append(actor.doctor_id)
    if q:
        sql += " AND (p.full_name LIKE ? OR p.patient_no LIKE ? OR p.phone LIKE ?)"
        params += [f"%{q}%"] * 3
    return paginate(conn, sql, params, page, page_size, "p.id DESC")


def patient_detail(conn, patient_id, actor):
    patient = one(conn, "SELECT * FROM patients WHERE id=?", (patient_id,), "患者档案不存在")
    sql = """SELECT r.*,s.date AS visit_date,s.period,d.name AS doctor_name,dp.name AS department_name,
           rx.diagnosis,rx.id AS prescription_id,rx.status AS prescription_status
           FROM registrations r JOIN schedules s ON s.id=r.schedule_id JOIN doctors d ON d.id=s.doctor_id
           JOIN departments dp ON dp.id=d.department_id LEFT JOIN prescriptions rx ON rx.registration_id=r.id
           WHERE r.patient_id=?"""
    params = [patient_id]
    if actor.role == "doctor":
        sql += " AND d.id=?"
        params.append(actor.doctor_id)
        require(
            conn.execute(
                """SELECT 1 FROM registrations r JOIN schedules s ON r.schedule_id=s.id
                WHERE r.patient_id=? AND s.doctor_id=? LIMIT 1""",
                params,
            ).fetchone(),
            "您只能查看本人负责的患者",
            403,
            "FORBIDDEN",
        )
    patient["visits"] = rows(conn, sql + " ORDER BY s.date DESC,r.id DESC LIMIT 50", params)
    return patient


def save_patient(conn, payload, actor, patient_id=None):
    data = payload.model_dump(mode="json")
    if patient_id is None:
        data.update(patient_no=serial("P"), created_at=now())
        patient_id = conn.execute(
            """INSERT INTO patients(patient_no,full_name,gender,birth_date,phone,allergies,address,created_at)
           VALUES (:patient_no,:full_name,:gender,:birth_date,:phone,:allergies,:address,:created_at)""",
            data,
        ).lastrowid
        action = "patient.create"
    else:
        one(conn, "SELECT id FROM patients WHERE id=?", (patient_id,))
        conn.execute(
            """UPDATE patients SET full_name=:full_name,gender=:gender,birth_date=:birth_date,
           phone=:phone,allergies=:allergies,address=:address WHERE id=:id""",
            {**data, "id": patient_id},
        )
        action = "patient.update"
    audit(conn, actor, action, "patient", patient_id, {"fields": list(type(payload).model_fields)})
    return one(conn, "SELECT * FROM patients WHERE id=?", (patient_id,))
