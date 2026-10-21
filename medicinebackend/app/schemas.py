from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.services.common import today

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Role = Literal["admin", "doctor", "cashier", "pharmacist"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=72)


class UserCreate(Input):
    username: str = Field(min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: Text
    password: str = Field(min_length=10, max_length=72)
    role: Role
    doctor_id: int | None = Field(default=None, gt=0)


class UserUpdate(Input):
    display_name: Text | None = None
    password: str | None = Field(default=None, min_length=10, max_length=72)
    role: Role | None = None
    doctor_id: int | None = Field(default=None, gt=0)
    active: bool | None = None


class PatientInput(Input):
    full_name: str = Field(min_length=1, max_length=40)
    gender: Literal["male", "female", "other"]
    birth_date: date
    phone: str = Field(default="", max_length=24, pattern=r"^[0-9+* -]*$")
    allergies: str = Field(default="无已知过敏", max_length=300)
    address: str = Field(default="", max_length=200)

    @field_validator("birth_date")
    @classmethod
    def valid_birth_date(cls, value):
        current = date.fromisoformat(today())
        if value > current or value < current - timedelta(days=130 * 366):
            raise ValueError("出生日期应在今天之前的合理范围内")
        return value


class ScheduleInput(Input):
    doctor_id: int = Field(gt=0)
    date: date
    period: Literal["morning", "afternoon"]
    total_slots: int = Field(ge=1, le=200)

    @field_validator("date")
    @classmethod
    def valid_schedule_date(cls, value):
        current = date.fromisoformat(today())
        if not current <= value <= current + timedelta(days=180):
            raise ValueError("排班日期应在今天起 180 天内")
        return value


class ScheduleUpdate(Input):
    total_slots: int = Field(ge=1, le=200)


class RegistrationInput(Input):
    patient_id: int = Field(gt=0)
    schedule_id: int = Field(gt=0)


class PrescriptionItemInput(Input):
    drug_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=999)
    dosage: str = Field(min_length=1, max_length=80)
    frequency: str = Field(min_length=1, max_length=80)


class PrescriptionInput(Input):
    registration_id: int = Field(gt=0)
    diagnosis: str = Field(min_length=1, max_length=200)
    diagnosis_code: str = Field(default="", max_length=20, pattern=r"^([A-Za-z][0-9]{2}[A-Za-z0-9.\-]*)?$")
    chief_complaint: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=2000)
    items: list[PrescriptionItemInput] = Field(min_length=1, max_length=20)

    @field_validator("items")
    @classmethod
    def unique_drugs(cls, value):
        if len({item.drug_id for item in value}) != len(value):
            raise ValueError("同一处方不能重复选择药品，请合并数量")
        return value


class ChargeInput(Input):
    payment_method: Literal["cash", "wechat", "alipay", "card"]


class ReasonInput(Input):
    reason: str = Field(min_length=2, max_length=200)


class DrugInput(Input):
    drug_code: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    generic_name: Text
    trade_name: str = Field(default="", max_length=100)
    specification: Text
    dosage_form: str = Field(min_length=1, max_length=30)
    unit: str = Field(default="盒", min_length=1, max_length=10)
    price_cents: int = Field(ge=0, le=10_000_000)
    insurance_category: Literal["A", "B", "self"] = "self"
    manufacturer: str = Field(default="", max_length=120)
    stock_threshold: int = Field(default=20, ge=0, le=100_000)
    active: bool = True


class ReceiveInput(Input):
    drug_id: int = Field(gt=0)
    batch_no: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    quantity: int = Field(ge=1, le=1_000_000)
    expires_at: date

    @field_validator("expires_at")
    @classmethod
    def not_expired(cls, value):
        if value < date.fromisoformat(today()):
            raise ValueError("不能入库已过期药品")
        return value


class HospitalInput(Input):
    hospital_name: str = Field(min_length=2, max_length=60)
    phone: str = Field(default="", max_length=30)
    address: str = Field(default="", max_length=200)
