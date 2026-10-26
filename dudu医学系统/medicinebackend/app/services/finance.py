from app.errors import require
from app.services.clinic import prescription_detail
from app.services.common import audit, now, one, rows, serial, today


def charge_prescription(conn, rx_id, payment_method, actor, timestamp=None):
    rx = prescription_detail(conn, rx_id, actor)
    if rx["status"] in ("paid", "dispensed"):
        return rx
    require(rx["status"] == "unpaid", "当前处方不能收费")
    allocations = []
    for item in rx["items"]:
        drug = one(conn, "SELECT * FROM drugs WHERE id=?", (item["drug_id"],))
        require(drug["active"], f"{drug['generic_name']} 已停用，请联系医生")
        candidates = rows(
            conn,
            """SELECT * FROM stock_batches WHERE drug_id=? AND expires_at>=?
            AND quantity>reserved_quantity ORDER BY expires_at,id""",
            (item["drug_id"], today()),
        )
        remaining = item["quantity"]
        for batch in candidates:
            take = min(remaining, batch["quantity"] - batch["reserved_quantity"])
            allocations.append((batch["id"], take))
            remaining -= take
            if remaining == 0:
                break
        require(
            remaining == 0, f"{item['drug_name']} 可用库存不足，缺少 {remaining} {item['unit']}，本次未收费"
        )
    # Validate every item before changing any stock. The surrounding transaction
    # additionally guarantees rollback if a constraint fails during allocation.
    for batch_id, quantity in allocations:
        changed = conn.execute(
            """UPDATE stock_batches SET reserved_quantity=reserved_quantity+?
            WHERE id=? AND quantity-reserved_quantity>=?""",
            (quantity, batch_id, quantity),
        )
        require(changed.rowcount == 1, "库存已变化，请刷新后重新收费")
        conn.execute(
            "INSERT INTO stock_reservations(prescription_id,batch_id,quantity) VALUES (?,?,?)",
            (rx_id, batch_id, quantity),
        )
    number = serial("SF")
    conn.execute(
        """INSERT INTO charges(charge_no,prescription_id,amount_cents,payment_method,cashier_id,paid_at)
        VALUES (?,?,?,?,?,?)""",
        (number, rx_id, rx["total_amount_cents"], payment_method, actor.id, timestamp or now()),
    )
    conn.execute("UPDATE prescriptions SET status='paid' WHERE id=?", (rx_id,))
    audit(
        conn,
        actor,
        "charge.confirm",
        "prescription",
        rx_id,
        {
            "prescription_no": rx["prescription_no"],
            "charge_no": number,
            "amount_cents": rx["total_amount_cents"],
            "payment_method": payment_method,
        },
        timestamp,
    )
    return prescription_detail(conn, rx_id, actor)


def refund_prescription(conn, rx_id, reason, actor, timestamp=None):
    rx = prescription_detail(conn, rx_id, actor)
    if rx["status"] == "refunded":
        return rx
    require(rx["status"] == "paid", "仅支持已收费且未发药的处方退费")
    reservations = rows(
        conn, "SELECT * FROM stock_reservations WHERE prescription_id=? AND status='reserved'", (rx_id,)
    )
    for reservation in reservations:
        conn.execute(
            "UPDATE stock_batches SET reserved_quantity=reserved_quantity-? WHERE id=?",
            (reservation["quantity"], reservation["batch_id"]),
        )
    conn.execute(
        "UPDATE stock_reservations SET status='released' WHERE prescription_id=? AND status='reserved'",
        (rx_id,),
    )
    conn.execute(
        "UPDATE charges SET status='refunded',refunded_at=?,refund_reason=? WHERE prescription_id=?",
        (timestamp or now(), reason, rx_id),
    )
    conn.execute("UPDATE prescriptions SET status='refunded' WHERE id=?", (rx_id,))
    conn.execute("UPDATE registrations SET status='completed' WHERE id=?", (rx["registration_id"],))
    audit(
        conn,
        actor,
        "charge.refund",
        "prescription",
        rx_id,
        {
            "prescription_no": rx["prescription_no"],
            "amount_cents": rx["total_amount_cents"],
            "reason": reason,
        },
        timestamp,
    )
    return prescription_detail(conn, rx_id, actor)


def dispense_prescription(conn, rx_id, actor, timestamp=None):
    rx = prescription_detail(conn, rx_id, actor)
    if rx["status"] == "dispensed":
        return rx
    require(rx["status"] == "paid", "处方尚未缴费，不能发药")
    reservations = rows(
        conn,
        """SELECT r.*,b.expires_at,b.drug_id,b.quantity AS batch_quantity,
        b.reserved_quantity,d.active,d.generic_name FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id
        JOIN drugs d ON d.id=b.drug_id
        WHERE r.prescription_id=? AND r.status='reserved'""",
        (rx_id,),
    )
    require(bool(reservations), "未找到有效库存预留，请联系管理员")
    for reservation in reservations:
        require(reservation["active"], f"{reservation['generic_name']} 已停用，请退费后重新处理")
        require(reservation["expires_at"] >= today(), "预留批次已过期，请退费后重新开方，勿发放过期药品")
        require(
            reservation["batch_quantity"] >= reservation["quantity"]
            and reservation["reserved_quantity"] >= reservation["quantity"],
            "预留库存状态异常，未执行发药",
        )
    number = serial("FY")
    stamp = timestamp or now()
    for reservation in reservations:
        conn.execute(
            """UPDATE stock_batches SET quantity=quantity-?,reserved_quantity=reserved_quantity-?
            WHERE id=?""",
            (reservation["quantity"], reservation["quantity"], reservation["batch_id"]),
        )
        conn.execute(
            """INSERT INTO stock_movements(drug_id,batch_id,quantity_delta,type,reference_no,operator_id,created_at)
            VALUES (?,?,?,'dispense',?,?,?)""",
            (
                reservation["drug_id"],
                reservation["batch_id"],
                -reservation["quantity"],
                number,
                actor.id,
                stamp,
            ),
        )
    conn.execute(
        "UPDATE stock_reservations SET status='dispensed' WHERE prescription_id=? AND status='reserved'",
        (rx_id,),
    )
    conn.execute(
        "INSERT INTO dispensations(dispense_no,prescription_id,pharmacist_id,created_at) VALUES (?,?,?,?)",
        (number, rx_id, actor.id, stamp),
    )
    conn.execute("UPDATE prescriptions SET status='dispensed' WHERE id=?", (rx_id,))
    conn.execute("UPDATE registrations SET status='completed' WHERE id=?", (rx["registration_id"],))
    audit(
        conn,
        actor,
        "pharmacy.dispense",
        "prescription",
        rx_id,
        {"prescription_no": rx["prescription_no"], "dispense_no": number, "item_count": len(rx["items"])},
        stamp,
    )
    return prescription_detail(conn, rx_id, actor)
