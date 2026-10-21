import csv
import io
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.seed import seed_demo
from app.services.catalog import CSV_FIELDS
from app.services.common import today


@pytest.mark.parametrize(
    "role,method,path,payload",
    [
        ("doctor", "get", "/reports", None),
        ("doctor", "post", "/prescriptions/1/charge", {"payment_method": "cash"}),
        ("cashier", "post", "/prescriptions", {"registration_id": 1, "diagnosis": "测试", "items": []}),
        ("cashier", "post", "/prescriptions/1/dispense", None),
        ("pharmacist", "get", "/patients", None),
        ("pharmacist", "get", "/audit-logs", None),
        ("pharmacist", "put", "/settings", {"hospital_name": "越权修改"}),
        ("pharmacist", "patch", "/drugs/1", {}),
    ],
)
def test_role_permissions_are_enforced_by_api(role_client, role, method, path, payload):
    api = role_client(role)
    kwargs = {"json": payload} if payload is not None else {}
    response = api.request(method, "/api/v1" + path, **kwargs)
    assert response.status_code == 403, response.text


def test_doctor_ownership_filters_lists_and_blocks_other_patients(scenario, role_client):
    other_visit = scenario.visit(doctor_id=2)
    other_rx = scenario.prescription(visit=other_visit)
    own_visit = scenario.visit(doctor_id=1)
    own_rx = scenario.prescription(visit=own_visit)
    scenario.post(f"/prescriptions/{own_rx['id']}/charge", {"payment_method": "cash"})
    doctor = role_client("doctor")
    for path in (f"/patients/{other_visit['patient_id']}", f"/prescriptions/{other_rx['id']}"):
        assert doctor.get("/api/v1" + path).status_code == 403
    assert doctor.post(f"/api/v1/registrations/{other_visit['id']}/start").status_code == 403
    assert (
        doctor.post(f"/api/v1/prescriptions/{other_rx['id']}/void", json={"reason": "越权作废"}).status_code
        == 403
    )
    records = doctor.get("/api/v1/registrations", params={"page_size": 100, "doctor_id": 2}).json()
    assert records["items"] and all(r["doctor_id"] == 1 for r in records["items"])
    own = doctor.get(f"/api/v1/prescriptions/{own_rx['id']}").json()
    assert own["charge"] is None
    assert doctor.get(f"/api/v1/patients/{own_visit['patient_id']}").status_code == 200
    dashboard = doctor.get("/api/v1/dashboard").json()
    assert dashboard["stats"]["today_revenue_cents"] is None
    assert not any("revenue_cents" in record for record in dashboard["trend"] + dashboard["departments"])
    assert dashboard["activity"] == []


def test_logout_revokes_old_cookie_and_csrf_checks_are_enforced(client):
    cookie = client.cookies.get("his_session")
    with TestClient(client.app) as unauthenticated:
        assert unauthenticated.get("/api/v1/patients").status_code == 401
        response = unauthenticated.post(
            "/api/v1/auth/login", json={"username": "admin", "password": "MedDemo2026!"}
        )
        assert response.status_code == 403 and response.json()["error"]["code"] == "CSRF_REJECTED"
    response = client.post("/api/v1/auth/logout", headers={"Origin": "https://untrusted.example"})
    assert response.status_code == 403
    assert client.post("/api/v1/auth/logout").status_code == 200
    client.cookies.set("his_session", cookie, path="/api")
    assert client.get("/api/v1/auth/me").status_code == 401


def test_disable_account_revokes_session_and_last_admin_is_preserved(client, role_client):
    doctor = role_client("doctor")
    assert client.patch("/api/v1/users/2", json={"active": False}).status_code == 200
    assert doctor.get("/api/v1/auth/me").status_code == 401
    assert client.patch("/api/v1/users/1", json={"active": False}).status_code == 409
    assert client.patch("/api/v1/users/1", json={"role": "cashier"}).status_code == 409
    assert client.get("/api/v1/auth/me").json()["role"] == "admin"


def test_login_limit_and_cookie_security(client):
    with TestClient(client.app, headers={"X-Requested-With": "his-web"}) as api:
        for _ in range(5):
            assert (
                api.post(
                    "/api/v1/auth/login", json={"username": "nonexistent", "password": "invalid"}
                ).status_code
                == 401
            )
        assert (
            api.post(
                "/api/v1/auth/login", json={"username": "nonexistent", "password": "invalid"}
            ).status_code
            == 429
        )
        response = api.post("/api/v1/auth/login", json={"username": "cashier", "password": "MedDemo2026!"})
        assert response.status_code == 200
        cookie = response.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=lax" in cookie and "path=/api" in cookie
        assert "password" not in response.text and "token" not in response.text


def csv_data(rows):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=CSV_FIELDS)
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


def csv_row(code, **changes):
    return {
        "drug_code": code,
        "generic_name": "导入测试药",
        "trade_name": "",
        "specification": "10mg × 10片",
        "dosage_form": "片剂",
        "unit": "盒",
        "price_cents": 2000,
        "insurance_category": "self",
        "manufacturer": "虚构厂家",
        "stock_threshold": 5,
        "batch_no": "CSV001",
        "quantity": 10,
        "expires_at": (date.fromisoformat(today()) + timedelta(days=100)).isoformat(),
        **changes,
    }


def test_csv_import_is_partial_atomic_and_repeat_does_not_increase_stock(client, scenario):
    data = csv_data([csv_row("CSVGOOD1"), csv_row("CSVBAD", quantity=-1), csv_row("CSVGOOD2")])
    response = client.post("/api/v1/drugs/import", files={"file": ("drugs.csv", data, "text/csv")})
    result = response.json()
    assert response.status_code == 200, response.text
    assert (result["success_count"], result["failed_count"], result["skipped_count"]) == (2, 1, 0)
    assert result["errors"][0]["row"] == 3
    assert scenario.get("/drugs", q="CSVBAD")["total"] == 0
    repeated = client.post("/api/v1/drugs/import", files={"file": ("drugs.csv", data, "text/csv")}).json()
    assert (repeated["success_count"], repeated["failed_count"], repeated["skipped_count"]) == (0, 1, 2)
    assert all(d["total_stock"] == 10 for d in scenario.get("/drugs", q="CSVGOOD")["items"])


def test_pharmacist_import_cannot_change_price_or_invent_a_new_drug(scenario, role_client):
    drug = scenario.drug()
    pharmacy = role_client("pharmacist")
    existing = csv_row(drug["drug_code"], generic_name=drug["generic_name"], price_cents=99999)
    result = pharmacy.post(
        "/api/v1/drugs/import",
        files={"file": ("drugs.csv", csv_data([existing, csv_row("PHARMNEW")]), "text/csv")},
    ).json()
    assert result["failed_count"] == 2 and result["success_count"] == 0
    assert scenario.get("/drugs", q=drug["drug_code"])["items"][0]["price_cents"] == drug["price_cents"]
    assert scenario.get("/drugs", q="PHARMNEW")["total"] == 0


def test_invalid_csv_and_expired_stock_are_rejected(client, scenario):
    assert (
        client.post(
            "/api/v1/drugs/import", files={"file": ("bad.csv", b"wrong,header\na,b\n", "text/csv")}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/drugs/import", files={"file": ("large.csv", b"x" * (2 * 1024 * 1024 + 1), "text/csv")}
        ).status_code
        == 413
    )
    drug = scenario.drug()
    assert (
        client.post(
            "/api/v1/stock/receive",
            json={
                "drug_id": drug["id"],
                "batch_no": "EXPIRED",
                "quantity": 3,
                "expires_at": (date.fromisoformat(today()) - timedelta(days=1)).isoformat(),
            },
        ).status_code
        == 422
    )


def test_report_refunds_use_refund_day_and_export_matches(client, scenario):
    drug = scenario.drug(price_cents=1001)
    rx = scenario.prescription(drug, quantity=3)
    scenario.post(f"/prescriptions/{rx['id']}/charge", {"payment_method": "cash"})
    old_day = (date.fromisoformat(today()) - timedelta(days=40)).isoformat()
    with client.app.state.db.transaction() as conn:
        conn.execute(
            "UPDATE charges SET paid_at=? WHERE prescription_id=?", (old_day + "T01:00:00Z", rx["id"])
        )
    before = scenario.get("/reports", start_date=today(), end_date=today())
    scenario.post(f"/prescriptions/{rx['id']}/refund", {"reason": "跨日退费测试"})
    after = scenario.get("/reports", start_date=today(), end_date=today())
    assert after["summary"]["revenue_cents"] == before["summary"]["revenue_cents"] - 3003
    assert after["summary"]["refund_cents"] == 3003
    historic = scenario.get("/reports", start_date=old_day, end_date=old_day)
    assert historic["summary"]["paid_cents"] == historic["summary"]["revenue_cents"] == 3003
    exported = client.get("/api/v1/reports/export", params={"start_date": today(), "end_date": today()})
    assert exported.status_code == 200 and exported.content.startswith(b"\xef\xbb\xbf")
    assert today() in exported.text and "30.03" in exported.text
    assert (
        client.get("/api/v1/reports", params={"start_date": today(), "end_date": old_day}).status_code == 422
    )


def test_restart_preserves_data_and_migrations_are_not_reapplied(client, scenario):
    patient = scenario.patient()
    db = client.app.state.db
    with db.read() as conn:
        versions = conn.execute("SELECT version FROM schema_migrations").fetchall()
        count = conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
    db.migrate()
    seed_demo(db, "different-password-does-not-reset")
    with db.read() as conn:
        assert conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0] == count
        assert conn.execute("SELECT version FROM schema_migrations").fetchall() == versions
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert (
            conn.execute("SELECT full_name FROM patients WHERE id=?", (patient["id"],)).fetchone()[0]
            == patient["full_name"]
        )
