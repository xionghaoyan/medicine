import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import Database
from app.main import create_app
from app.seed import seed_demo
from app.services.common import today

PASSWORD = "DuduDemo2026!"
HEADERS = {"X-Requested-With": "his-web"}


@pytest.fixture(scope="session")
def seeded_database(tmp_path_factory):
    db = Database(tmp_path_factory.mktemp("his-seed") / "seed.sqlite3")
    db.migrate()
    seed_demo(db, PASSWORD)
    return db


@pytest.fixture
def client(tmp_path, seeded_database):
    path = tmp_path / "test.sqlite3"
    with seeded_database.read() as source, sqlite3.connect(path) as target:
        source.backup(target)
    application = create_app(Settings(database_path=path, jwt_secret="isolated-test-secret-" * 3))
    with TestClient(application, headers=HEADERS) as api:
        response = api.post("/api/v1/auth/login", json={"username": "admin", "password": PASSWORD})
        assert response.status_code == 200, response.text
        yield api


@pytest.fixture
def role_client(client):
    clients = []

    def login(role):
        api = TestClient(client.app, headers=HEADERS)
        clients.append(api)
        response = api.post("/api/v1/auth/login", json={"username": role, "password": PASSWORD})
        assert response.status_code == 200, response.text
        return api

    yield login
    for api in clients:
        api.close()


@dataclass
class Scenario:
    api: TestClient

    def post(self, path, payload=None):
        response = self.api.post("/api/v1" + path, json=payload)
        assert response.status_code in (200, 201), response.text
        return response.json()

    def get(self, path, **params):
        response = self.api.get("/api/v1" + path, params=params)
        assert response.status_code == 200, response.text
        return response.json()

    def patient(self):
        return self.post(
            "/patients",
            {
                "full_name": "测试患者" + uuid4().hex[:6],
                "gender": "female",
                "birth_date": "1992-05-10",
                "phone": "13900009999",
                "allergies": "无已知过敏",
            },
        )

    def visit(self, doctor_id=1, patient=None):
        patient = patient or self.patient()
        schedule = next(
            s for s in self.get("/schedules", date=today(), doctor_id=doctor_id) if s["remaining_slots"] > 0
        )
        return self.post("/registrations", {"patient_id": patient["id"], "schedule_id": schedule["id"]})

    def drug(self, quantity=20, price_cents=1234, expiry_days=365):
        drug = self.post(
            "/drugs",
            {
                "drug_code": "TEST" + uuid4().hex[:10],
                "generic_name": "测试药品",
                "specification": "10mg × 10片",
                "dosage_form": "片剂",
                "unit": "盒",
                "price_cents": price_cents,
                "insurance_category": "self",
            },
        )
        if quantity:
            self.post(
                "/stock/receive",
                {
                    "drug_id": drug["id"],
                    "batch_no": "B-TEST",
                    "quantity": quantity,
                    "expires_at": (date.fromisoformat(today()) + timedelta(days=expiry_days)).isoformat(),
                },
            )
        return drug

    def prescription(self, drug=None, quantity=2, visit=None, items=None):
        visit = visit or self.visit()
        drug = drug or self.drug()
        items = items or [
            {"drug_id": drug["id"], "quantity": quantity, "dosage": "测试用法", "frequency": "测试频次"}
        ]
        return self.post(
            "/prescriptions",
            {
                "registration_id": visit["id"],
                "diagnosis": "教学测试诊断",
                "diagnosis_code": "J06.9",
                "chief_complaint": "自动化测试虚构数据",
                "items": items,
            },
        )

    def stock(self, drug_id):
        return self.get(f"/drugs/{drug_id}/batches")

    def patch_drug(self, drug, **changes):
        fields = (
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
            "active",
        )
        payload = {key: drug[key] for key in fields}
        return self.api.patch(f"/api/v1/drugs/{drug['id']}", json={**payload, **changes})


@pytest.fixture
def scenario(client):
    return Scenario(client)
