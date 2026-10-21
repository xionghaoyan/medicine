from app.errors import require
from app.services.common import assert_doctor_owner, audit, now, one, paginate, rows, serial, today

REG_SELECT = """SELECT r.*,p.full_name AS patient_name,p.patient_no,p.gender,p.birth_date,p.phone,p.allergies,
    s.date AS visit_date,s.period,d.id AS doctor_id,d.name AS doctor_name,d.title AS doctor_title,
    dp.id AS department_id,dp.name AS department_name,
    rx.id AS prescription_id,rx.status AS prescription_status,rx.total_amount_cents
    FROM registrations r JOIN patients p ON p.id=r.patient_id JOIN schedules s ON s.id=r.schedule_id
    JOIN doctors d ON d.id=s.doctor_id JOIN departments dp ON dp.id=d.department_id
    LEFT JOIN prescriptions rx ON rx.registration_id=r.id"""

RX_SELECT = """SELECT rx.*,p.id AS patient_id,p.full_name AS patient_name,p.patient_no,p.gender,p.birth_date,
    p.phone,p.allergies,r.registration_no,r.queue_no,r.status AS registration_status,
    s.date AS visit_date,s.period,d.name AS doctor_name,dp.name AS department_name
    FROM prescriptions rx JOIN registrations r ON r.id=rx.registration_id
    JOIN patients p ON p.id=r.patient_id JOIN schedules s ON s.id=r.schedule_id
    JOIN doctors d ON d.id=rx.doctor_id JOIN departments dp ON dp.id=d.department_id"""


def schedule_list(conn, date_filter=None, department_id=None, doctor_id=None):
    sql = """SELECT s.*,d.name AS doctor_name,d.title,d.specialty,d.consultation_fee_cents,d.avatar_color,
        d.department_id,dp.name AS department_name,dp.location
        FROM schedules s JOIN doctors d ON d.id=s.doctor_id JOIN departments dp ON dp.id=d.department_id WHERE s.date=?"""
    params = [date_filter or today()]
    if department_id:
        sql += " AND d.department_id=?"
        params.append(department_id)
    if doctor_id:
        sql += " AND d.id=?"
        params.append(doctor_id)
    return rows(conn, sql + " ORDER BY d.id,CASE s.period WHEN 'morning' THEN 0 ELSE 1 END", params)


def save_schedule(conn, payload, actor, schedule_id=None):
    if schedule_id is None:
        one(conn, "SELECT id FROM doctors WHERE id=?", (payload.doctor_id,), "医生不存在")
        schedule_id = conn.execute(
            """INSERT INTO schedules(doctor_id,date,period,total_slots,remaining_slots)
            VALUES (?,?,?,?,?)""",
            (
                payload.doctor_id,
                payload.date.isoformat(),
                payload.period,
                payload.total_slots,
                payload.total_slots,
            ),
        ).lastrowid
    else:
        old = one(conn, "SELECT * FROM schedules WHERE id=?", (schedule_id,))
        require(old["date"] >= today(), "历史排班不能修改")
        used = old["total_slots"] - old["remaining_slots"]
        require(payload.total_slots >= used, f"总号源不能小于已挂号人数（{used} 人）")
        conn.execute(
            "UPDATE schedules SET total_slots=?,remaining_slots=? WHERE id=?",
            (payload.total_slots, payload.total_slots - used, schedule_id),
        )
    audit(conn, actor, "schedule.save", "schedule", schedule_id, {"total_slots": payload.total_slots})
    return one(conn, "SELECT * FROM schedules WHERE id=?", (schedule_id,))


def registration_detail(conn, registration_id, actor):
    item = one(conn, REG_SELECT + " WHERE r.id=?", (registration_id,), "挂号记录不存在")
    assert_doctor_owner(actor, item["doctor_id"])
    return item


def registration_list(
    conn, actor, date_filter=None, q="", status="", doctor_id=None, page=1, page_size=20, pending_only=False
):
    sql = REG_SELECT + " WHERE 1=1"
    params = []
    if date_filter:
        sql += " AND s.date=?"
        params.append(date_filter)
    if actor.role == "doctor":
        sql += " AND s.doctor_id=?"
        params.append(actor.doctor_id)
    elif doctor_id:
        sql += " AND s.doctor_id=?"
        params.append(doctor_id)
    if status:
        sql += " AND r.status=?"
        params.append(status)
    if pending_only:
        sql += " AND r.status IN ('waiting','in_progress') AND rx.id IS NULL"
    if q:
        sql += " AND (p.full_name LIKE ? OR p.patient_no LIKE ? OR r.registration_no LIKE ?)"
        params.extend([f"%{q}%"] * 3)
    return paginate(conn, sql, params, page, page_size, "r.id ASC" if pending_only else "r.id DESC")


def register(conn, payload, actor, timestamp=None):
    patient = one(conn, "SELECT * FROM patients WHERE id=?", (payload.patient_id,), "患者不存在")
    schedule = one(
        conn,
        """SELECT s.*,d.consultation_fee_cents FROM schedules s
        JOIN doctors d ON d.id=s.doctor_id WHERE s.id=?""",
        (payload.schedule_id,),
        "排班不存在",
    )
    require(schedule["date"] >= today(), "不能预约过去的排班")
    return _register(conn, patient, schedule, actor, timestamp)


def _register(conn, patient, schedule, actor, timestamp=None):
    require(schedule["remaining_slots"] > 0, "该时段号源已满，请选择其他时段")
    require(
        not conn.execute(
            "SELECT 1 FROM registrations WHERE patient_id=? AND schedule_id=? AND status!='cancelled'",
            (patient["id"], schedule["id"]),
        ).fetchone(),
        "该患者已预约此时段，请勿重复挂号",
    )
    updated = conn.execute(
        """UPDATE schedules SET remaining_slots=remaining_slots-1,next_queue_no=next_queue_no+1
        WHERE id=? AND remaining_slots>0""",
        (schedule["id"],),
    )
    require(updated.rowcount == 1, "号源已被占用，请刷新后重试")
    queue_no = conn.execute("SELECT next_queue_no FROM schedules WHERE id=?", (schedule["id"],)).fetchone()[0]
    number = serial("GH")
    reg_id = conn.execute(
        """INSERT INTO registrations(registration_no,patient_id,schedule_id,queue_no,fee_cents,created_at)
        VALUES (?,?,?,?,?,?)""",
        (
            number,
            patient["id"],
            schedule["id"],
            queue_no,
            schedule["consultation_fee_cents"],
            timestamp or now(),
        ),
    ).lastrowid
    audit(
        conn,
        actor,
        "registration.create",
        "registration",
        reg_id,
        {"registration_no": number, "patient_no": patient["patient_no"], "queue_no": queue_no},
        timestamp,
    )
    return registration_detail(conn, reg_id, actor)


def cancel_registration(conn, reg_id, actor):
    registration = registration_detail(conn, reg_id, actor)
    if registration["status"] == "cancelled":
        return registration
    require(
        registration["status"] != "completed" and registration["prescription_id"] is None,
        "已开方或已完成的就诊不能退号",
    )
    conn.execute("UPDATE registrations SET status='cancelled' WHERE id=?", (reg_id,))
    conn.execute(
        "UPDATE schedules SET remaining_slots=remaining_slots+1 WHERE id=?", (registration["schedule_id"],)
    )
    audit(
        conn,
        actor,
        "registration.cancel",
        "registration",
        reg_id,
        {"registration_no": registration["registration_no"]},
    )
    return registration_detail(conn, reg_id, actor)


def start_consultation(conn, reg_id, actor):
    registration = registration_detail(conn, reg_id, actor)
    require(registration["visit_date"] <= today(), "预约日期尚未到达")
    require(registration["status"] in ("waiting", "in_progress"), "该就诊不能再次接诊")
    if registration["status"] == "waiting":
        conn.execute("UPDATE registrations SET status='in_progress' WHERE id=?", (reg_id,))
        audit(conn, actor, "consultation.start", "registration", reg_id)
    return registration_detail(conn, reg_id, actor)


def prescription_detail(conn, prescription_id, actor):
    result = one(conn, RX_SELECT + " WHERE rx.id=?", (prescription_id,), "处方不存在")
    assert_doctor_owner(actor, result["doctor_id"])
    if actor.role == "pharmacist":
        require(result["status"] in ("paid", "dispensed"), "药房仅能查看已缴费处方", 403, "FORBIDDEN")
    result["items"] = rows(
        conn, "SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY id", (prescription_id,)
    )
    charge = conn.execute(
        """SELECT c.*,u.display_name AS cashier_name FROM charges c JOIN users u ON u.id=c.cashier_id
        WHERE c.prescription_id=?""",
        (prescription_id,),
    ).fetchone()
    result["charge"] = dict(charge) if charge and actor.role != "doctor" else None
    dispense = conn.execute(
        """SELECT d.*,u.display_name AS pharmacist_name FROM dispensations d
        JOIN users u ON u.id=d.pharmacist_id WHERE d.prescription_id=?""",
        (prescription_id,),
    ).fetchone()
    result["dispensation"] = dict(dispense) if dispense else None
    result["reservations"] = rows(
        conn,
        """SELECT r.*,b.batch_no,b.expires_at,d.generic_name AS drug_name
        FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id JOIN drugs d ON d.id=b.drug_id
        WHERE r.prescription_id=? ORDER BY r.id""",
        (prescription_id,),
    )
    return result


def prescription_list(conn, actor, status="", q="", date_filter=None, page=1, page_size=20):
    sql = RX_SELECT + " WHERE 1=1"
    params = []
    if actor.role == "doctor":
        sql += " AND rx.doctor_id=?"
        params.append(actor.doctor_id)
    if actor.role == "pharmacist":
        sql += " AND rx.status IN ('paid','dispensed')"
    if status:
        sql += " AND rx.status=?"
        params.append(status)
    if date_filter:
        sql += " AND s.date=?"
        params.append(date_filter)
    if q:
        sql += " AND (p.full_name LIKE ? OR rx.prescription_no LIKE ? OR p.patient_no LIKE ?)"
        params += [f"%{q}%"] * 3
    return paginate(conn, sql, params, page, page_size, "rx.id DESC")


def create_prescription(conn, payload, actor, timestamp=None):
    reg = registration_detail(conn, payload.registration_id, actor)
    require(reg["visit_date"] <= today(), "预约日期尚未到达，不能开方")
    require(reg["status"] in ("waiting", "in_progress"), "该挂号状态不能开方")
    require(reg["prescription_id"] is None, "该就诊已开具处方，请勿重复提交")
    items = []
    for item in payload.items:
        drug = one(conn, "SELECT * FROM drugs WHERE id=?", (item.drug_id,), "处方中的药品不存在")
        require(drug["active"], f"{drug['generic_name']} 已停用，请调整处方")
        items.append(
            {
                **item.model_dump(),
                "drug_name": drug["generic_name"],
                "specification": drug["specification"],
                "unit": drug["unit"],
                "unit_price_cents": drug["price_cents"],
                "line_total_cents": drug["price_cents"] * item.quantity,
            }
        )
    total = sum(item["line_total_cents"] for item in items)
    number = serial("CF")
    rx_id = conn.execute(
        """INSERT INTO prescriptions(prescription_no,registration_id,doctor_id,diagnosis,
        diagnosis_code,chief_complaint,notes,total_amount_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            number,
            payload.registration_id,
            reg["doctor_id"],
            payload.diagnosis,
            payload.diagnosis_code,
            payload.chief_complaint,
            payload.notes,
            total,
            timestamp or now(),
        ),
    ).lastrowid
    for item in items:
        conn.execute(
            """INSERT INTO prescription_items(prescription_id,drug_id,drug_name,specification,unit,quantity,
            unit_price_cents,line_total_cents,dosage,frequency) VALUES (:rx_id,:drug_id,:drug_name,:specification,
            :unit,:quantity,:unit_price_cents,:line_total_cents,:dosage,:frequency)""",
            {**item, "rx_id": rx_id},
        )
    conn.execute("UPDATE registrations SET status='in_progress' WHERE id=?", (payload.registration_id,))
    audit(
        conn,
        actor,
        "prescription.create",
        "prescription",
        rx_id,
        {"prescription_no": number, "item_count": len(items), "amount_cents": total},
        timestamp,
    )
    return prescription_detail(conn, rx_id, actor)


def void_prescription(conn, rx_id, reason, actor):
    rx = prescription_detail(conn, rx_id, actor)
    require(rx["status"] == "unpaid", "只有未收费处方可以作废")
    conn.execute("UPDATE prescriptions SET status='voided' WHERE id=?", (rx_id,))
    conn.execute("UPDATE registrations SET status='completed' WHERE id=?", (rx["registration_id"],))
    audit(conn, actor, "prescription.void", "prescription", rx_id, {"reason": reason})
    return prescription_detail(conn, rx_id, actor)
