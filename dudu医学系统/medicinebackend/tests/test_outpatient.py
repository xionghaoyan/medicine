from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier

from fastapi.testclient import TestClient

from app.services.common import today


def test_charge_reserves_dispense_consumes_and_duplicates_are_idempotent(client, scenario):
    drug = scenario.drug(quantity=8, price_cents=1299)
    rx = scenario.prescription(drug, quantity=3)
    assert rx["total_amount_cents"] == 3897
    assert scenario.stock(drug["id"])[0]["quantity"] == 8
    paid = scenario.post(f"/prescriptions/{rx['id']}/charge", {"payment_method": "cash"})
    batch = scenario.stock(drug["id"])[0]
    assert (batch["quantity"], batch["reserved_quantity"]) == (8, 3)
    assert (
        scenario.post(f"/prescriptions/{rx['id']}/charge", {"payment_method": "wechat"})["charge"]["id"]
        == paid["charge"]["id"]
    )
    done = scenario.post(f"/prescriptions/{rx['id']}/dispense")
    assert done["status"] == "dispensed" and done["registration_status"] == "completed"
    repeat = scenario.post(f"/prescriptions/{rx['id']}/dispense")
    assert repeat["dispensation"]["id"] == done["dispensation"]["id"]
    batch = scenario.stock(drug["id"])[0]
    assert (batch["quantity"], batch["reserved_quantity"]) == (5, 0)
    with client.app.state.db.read() as conn:
        assert (
            conn.execute(
                "SELECT COUNT(*) FROM stock_movements WHERE drug_id=? AND type='dispense'", (drug["id"],)
            ).fetchone()[0]
            == 1
        )
        assert (
            conn.execute(
                "SELECT COUNT(*) FROM audit_logs WHERE action='pharmacy.dispense' AND entity_id=?",
                (str(rx["id"]),),
            ).fetchone()[0]
            == 1
        )
    assert (
        client.post(f"/api/v1/prescriptions/{rx['id']}/refund", json={"reason": "发药后尝试退费"}).status_code
        == 409
    )


def test_refund_releases_reservations_once_and_blocks_later_dispensing(client, scenario):
    drug = scenario.drug(quantity=10)
    rx = scenario.prescription(drug, quantity=4)
    scenario.post(f"/prescriptions/{rx['id']}/charge", {"payment_method": "alipay"})
    refunded = scenario.post(f"/prescriptions/{rx['id']}/refund", {"reason": "测试取消取药"})
    assert refunded["status"] == "refunded"
    scenario.post(f"/prescriptions/{rx['id']}/refund", {"reason": "重复请求"})
    batch = scenario.stock(drug["id"])[0]
    assert (batch["quantity"], batch["reserved_quantity"]) == (10, 0)
    assert {r["status"] for r in refunded["reservations"]} == {"released"}
    assert client.post(f"/api/v1/prescriptions/{rx['id']}/dispense").status_code == 409
    assert (
        client.post(f"/api/v1/prescriptions/{rx['id']}/charge", json={"payment_method": "cash"}).status_code
        == 409
    )


def test_multi_drug_shortage_rolls_back_all_business_data(client, scenario):
    plentiful = scenario.drug(quantity=10)
    scarce = scenario.drug(quantity=1)
    items = [
        {"drug_id": d["id"], "quantity": 2, "dosage": "测试", "frequency": "测试"}
        for d in (plentiful, scarce)
    ]
    rx = scenario.prescription(plentiful, items=items)
    response = client.post(f"/api/v1/prescriptions/{rx['id']}/charge", json={"payment_method": "cash"})
    assert response.status_code == 409 and "库存不足" in response.json()["error"]["message"]
    detail = scenario.get(f"/prescriptions/{rx['id']}")
    assert detail["status"] == "unpaid" and detail["charge"] is None and detail["reservations"] == []
    for drug in (plentiful, scarce):
        assert scenario.stock(drug["id"])[0]["reserved_quantity"] == 0
    with client.app.state.db.read() as conn:
        assert (
            conn.execute(
                "SELECT COUNT(*) FROM audit_logs WHERE action='charge.confirm' AND entity_id=?",
                (str(rx["id"]),),
            ).fetchone()[0]
            == 0
        )


def test_prescription_uses_price_snapshot_and_rejects_forged_money(client, scenario):
    drug = scenario.drug(price_cents=1501)
    visit = scenario.visit()
    payload = {
        "registration_id": visit["id"],
        "diagnosis": "测试诊断",
        "items": [{"drug_id": drug["id"], "quantity": 3, "dosage": "测试", "frequency": "测试"}],
    }
    assert client.post("/api/v1/prescriptions", json={**payload, "total_amount_cents": 1}).status_code == 422
    payload["items"][0]["unit_price_cents"] = 1
    assert client.post("/api/v1/prescriptions", json=payload).status_code == 422
    del payload["items"][0]["unit_price_cents"]
    rx = scenario.post("/prescriptions", payload)
    assert scenario.patch_drug(drug, price_cents=9900).status_code == 200
    paid = scenario.post(f"/prescriptions/{rx['id']}/charge", {"payment_method": "cash"})
    assert paid["charge"]["amount_cents"] == paid["total_amount_cents"] == 4503
    assert paid["items"][0]["unit_price_cents"] == 1501
    assert (
        client.post(
            f"/api/v1/prescriptions/{rx['id']}/charge", json={"payment_method": "cash", "amount_cents": 1}
        ).status_code
        == 422
    )


def test_earliest_expiry_allocated_first_and_expired_reservation_cannot_dispense(client, scenario):
    drug = scenario.drug(quantity=8, expiry_days=365)
    earlier = scenario.post(
        "/stock/receive",
        {
            "drug_id": drug["id"],
            "batch_no": "EARLIER",
            "quantity": 2,
            "expires_at": (date.fromisoformat(today()) + timedelta(days=10)).isoformat(),
        },
    )
    rx = scenario.prescription(drug, quantity=3)
    paid = scenario.post(f"/prescriptions/{rx['id']}/charge", {"payment_method": "card"})
    assert [(r["batch_no"], r["quantity"]) for r in paid["reservations"]] == [("EARLIER", 2), ("B-TEST", 1)]
    with client.app.state.db.transaction() as conn:
        conn.execute(
            "UPDATE stock_batches SET expires_at=? WHERE id=?",
            ((date.fromisoformat(today()) - timedelta(days=1)).isoformat(), earlier["id"]),
        )
    before = scenario.stock(drug["id"])
    response = client.post(f"/api/v1/prescriptions/{rx['id']}/dispense")
    assert response.status_code == 409 and "过期" in response.json()["error"]["message"]
    assert scenario.stock(drug["id"]) == before
    assert scenario.get(f"/prescriptions/{rx['id']}")["dispensation"] is None
    scenario.post(f"/prescriptions/{rx['id']}/refund", {"reason": "预留批次过期"})
    assert all(b["reserved_quantity"] == 0 for b in scenario.stock(drug["id"]))


def test_disabled_drug_after_charge_is_blocked_and_unit_history_is_preserved(client, scenario):
    drug = scenario.drug()
    rx = scenario.prescription(drug)
    assert scenario.patch_drug(drug, unit="片").status_code == 409
    assert scenario.patch_drug(drug, specification="不同规格").status_code == 409
    scenario.post(f"/prescriptions/{rx['id']}/charge", {"payment_method": "cash"})
    assert scenario.patch_drug(drug, active=False).status_code == 200
    before = scenario.stock(drug["id"])
    response = client.post(f"/api/v1/prescriptions/{rx['id']}/dispense")
    assert response.status_code == 409 and "停用" in response.json()["error"]["message"]
    assert scenario.stock(drug["id"]) == before


def test_last_slot_is_claimed_once_and_cancel_does_not_reuse_queue_number(client, scenario):
    future = (date.fromisoformat(today()) + timedelta(days=20)).isoformat()
    schedule = scenario.post(
        "/schedules", {"doctor_id": 1, "date": future, "period": "morning", "total_slots": 1}
    )
    patients = [scenario.patient(), scenario.patient()]
    barrier = Barrier(2)

    def book(patient):
        with TestClient(
            client.app, headers={"X-Requested-With": "his-web"}, cookies=client.cookies
        ) as concurrent:
            barrier.wait(timeout=10)
            return concurrent.post(
                "/api/v1/registrations", json={"patient_id": patient["id"], "schedule_id": schedule["id"]}
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(book, patients))
    assert sorted(r.status_code for r in results) == [201, 409]
    winner = next(r.json() for r in results if r.status_code == 201)
    assert scenario.get("/schedules", date=future, doctor_id=1)[0]["remaining_slots"] == 0
    scenario.post(f"/registrations/{winner['id']}/cancel")
    scenario.post(f"/registrations/{winner['id']}/cancel")
    assert scenario.get("/schedules", date=future, doctor_id=1)[0]["remaining_slots"] == 1
    replacement = scenario.post(
        "/registrations", {"patient_id": winner["patient_id"], "schedule_id": schedule["id"]}
    )
    assert replacement["queue_no"] == winner["queue_no"] + 1
    assert client.post(f"/api/v1/registrations/{replacement['id']}/start").status_code == 409


def test_concurrent_charges_cannot_oversell_the_last_unit(client, scenario):
    drug = scenario.drug(quantity=1)
    prescriptions = [scenario.prescription(drug, quantity=1), scenario.prescription(drug, quantity=1)]
    barrier = Barrier(2)

    def charge(rx):
        with TestClient(
            client.app, headers={"X-Requested-With": "his-web"}, cookies=client.cookies
        ) as concurrent:
            barrier.wait(timeout=10)
            return concurrent.post(
                f"/api/v1/prescriptions/{rx['id']}/charge", json={"payment_method": "cash"}
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(charge, prescriptions))
    assert sorted(r.status_code for r in results) == [200, 409]
    batch = scenario.stock(drug["id"])[0]
    assert (batch["quantity"], batch["reserved_quantity"]) == (1, 1)


def test_pending_queue_is_paginated_before_completed_records(client, scenario):
    query = scenario.get("/registrations", date=today(), pending_only=True, page_size=5)
    assert query["total"] == 12 and len(query["items"]) == 5
    assert all(
        r["prescription_id"] is None and r["status"] in ("waiting", "in_progress") for r in query["items"]
    )
    next_page = scenario.get("/registrations", date=today(), pending_only=True, page_size=5, page=2)
    assert max(r["id"] for r in query["items"]) < min(r["id"] for r in next_page["items"])


def test_invalid_state_transitions_do_not_change_visit(client, scenario):
    drug = scenario.drug()
    visit = scenario.visit()
    rx = scenario.prescription(drug, visit=visit)
    assert client.post(f"/api/v1/registrations/{visit['id']}/cancel").status_code == 409
    assert client.post(f"/api/v1/prescriptions/{rx['id']}/dispense").status_code == 409
    assert (
        client.post(f"/api/v1/prescriptions/{rx['id']}/refund", json={"reason": "未缴费退费"}).status_code
        == 409
    )
    voided = scenario.post(f"/prescriptions/{rx['id']}/void", {"reason": "测试处方作废"})
    assert voided["status"] == "voided" and voided["registration_status"] == "completed"
    assert (
        client.post(f"/api/v1/prescriptions/{rx['id']}/charge", json={"payment_method": "cash"}).status_code
        == 409
    )


def test_schedule_capacity_cannot_drop_below_booked_count(client, scenario):
    schedule = scenario.get("/schedules", date=today(), doctor_id=1)[0]
    used = schedule["total_slots"] - schedule["remaining_slots"]
    assert used > 1
    assert (
        client.patch(f"/api/v1/schedules/{schedule['id']}", json={"total_slots": used - 1}).status_code == 409
    )
    updated = client.patch(f"/api/v1/schedules/{schedule['id']}", json={"total_slots": used}).json()
    assert updated["remaining_slots"] == 0 and updated["next_queue_no"] == schedule["next_queue_no"]
