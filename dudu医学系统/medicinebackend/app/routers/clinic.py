from datetime import date

from fastapi import APIRouter, Depends, Query, Request

from app import schemas
from app.security import current_user, require_roles
from app.services import catalog, clinic, finance
from app.services.common import Actor

router = APIRouter(tags=["门诊业务"])
patient_roles = require_roles("admin", "cashier", "doctor")
registration_roles = require_roles("admin", "cashier")
doctor_roles = require_roles("admin", "doctor")


@router.get("/departments")
def departments(request: Request, actor: Actor = Depends(current_user)):
    with request.app.state.db.read() as conn:
        return catalog.departments(conn)


@router.get("/doctors")
def doctors(request: Request, department_id: int | None = None, actor: Actor = Depends(current_user)):
    with request.app.state.db.read() as conn:
        return catalog.doctors(conn, department_id)


@router.get("/patients")
def patients(
    request: Request,
    q: str = Query("", max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: Actor = Depends(patient_roles),
):
    with request.app.state.db.read() as conn:
        return catalog.list_patients(conn, actor, q, page, page_size)


@router.post("/patients", status_code=201)
def create_patient(
    payload: schemas.PatientInput, request: Request, actor: Actor = Depends(registration_roles)
):
    with request.app.state.db.transaction() as conn:
        return catalog.save_patient(conn, payload, actor)


@router.get("/patients/{patient_id}")
def patient(patient_id: int, request: Request, actor: Actor = Depends(patient_roles)):
    with request.app.state.db.read() as conn:
        return catalog.patient_detail(conn, patient_id, actor)


@router.patch("/patients/{patient_id}")
def update_patient(
    patient_id: int,
    payload: schemas.PatientInput,
    request: Request,
    actor: Actor = Depends(registration_roles),
):
    with request.app.state.db.transaction() as conn:
        return catalog.save_patient(conn, payload, actor, patient_id)


@router.get("/schedules")
def schedules(
    request: Request,
    date: date | None = None,
    department_id: int | None = None,
    doctor_id: int | None = None,
    actor: Actor = Depends(current_user),
):
    with request.app.state.db.read() as conn:
        return clinic.schedule_list(conn, date.isoformat() if date else None, department_id, doctor_id)


@router.post("/schedules", status_code=201)
def create_schedule(
    payload: schemas.ScheduleInput, request: Request, actor: Actor = Depends(require_roles("admin"))
):
    with request.app.state.db.transaction() as conn:
        return clinic.save_schedule(conn, payload, actor)


@router.patch("/schedules/{schedule_id}")
def update_schedule(
    schedule_id: int,
    payload: schemas.ScheduleUpdate,
    request: Request,
    actor: Actor = Depends(require_roles("admin")),
):
    with request.app.state.db.transaction() as conn:
        return clinic.save_schedule(conn, payload, actor, schedule_id)


@router.get("/registrations")
def registrations(
    request: Request,
    date: date | None = None,
    q: str = Query("", max_length=100),
    status: str = Query("", pattern=r"^(waiting|in_progress|completed|cancelled)?$"),
    doctor_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    pending_only: bool = False,
    actor: Actor = Depends(patient_roles),
):
    with request.app.state.db.read() as conn:
        return clinic.registration_list(
            conn,
            actor,
            date.isoformat() if date else None,
            q,
            status,
            doctor_id,
            page,
            page_size,
            pending_only,
        )


@router.post("/registrations", status_code=201)
def create_registration(
    payload: schemas.RegistrationInput, request: Request, actor: Actor = Depends(registration_roles)
):
    with request.app.state.db.transaction() as conn:
        return clinic.register(conn, payload, actor)


@router.post("/registrations/{registration_id}/cancel")
def cancel_registration(registration_id: int, request: Request, actor: Actor = Depends(registration_roles)):
    with request.app.state.db.transaction() as conn:
        return clinic.cancel_registration(conn, registration_id, actor)


@router.post("/registrations/{registration_id}/start")
def start_consultation(registration_id: int, request: Request, actor: Actor = Depends(doctor_roles)):
    with request.app.state.db.transaction() as conn:
        return clinic.start_consultation(conn, registration_id, actor)


@router.get("/prescriptions")
def prescriptions(
    request: Request,
    status: str = Query("", pattern=r"^(unpaid|paid|dispensed|refunded|voided)?$"),
    q: str = Query("", max_length=100),
    date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor: Actor = Depends(current_user),
):
    with request.app.state.db.read() as conn:
        return clinic.prescription_list(
            conn, actor, status, q, date.isoformat() if date else None, page, page_size
        )


@router.post("/prescriptions", status_code=201)
def create_prescription(
    payload: schemas.PrescriptionInput, request: Request, actor: Actor = Depends(doctor_roles)
):
    with request.app.state.db.transaction() as conn:
        return clinic.create_prescription(conn, payload, actor)


@router.get("/prescriptions/{prescription_id}")
def prescription(prescription_id: int, request: Request, actor: Actor = Depends(current_user)):
    with request.app.state.db.read() as conn:
        return clinic.prescription_detail(conn, prescription_id, actor)


@router.post("/prescriptions/{prescription_id}/void")
def void_prescription(
    prescription_id: int, payload: schemas.ReasonInput, request: Request, actor: Actor = Depends(doctor_roles)
):
    with request.app.state.db.transaction() as conn:
        return clinic.void_prescription(conn, prescription_id, payload.reason, actor)


@router.post("/prescriptions/{prescription_id}/charge")
def charge_prescription(
    prescription_id: int,
    payload: schemas.ChargeInput,
    request: Request,
    actor: Actor = Depends(registration_roles),
):
    with request.app.state.db.transaction() as conn:
        return finance.charge_prescription(conn, prescription_id, payload.payment_method, actor)


@router.post("/prescriptions/{prescription_id}/refund")
def refund_prescription(
    prescription_id: int,
    payload: schemas.ReasonInput,
    request: Request,
    actor: Actor = Depends(registration_roles),
):
    with request.app.state.db.transaction() as conn:
        return finance.refund_prescription(conn, prescription_id, payload.reason, actor)


@router.post("/prescriptions/{prescription_id}/dispense")
def dispense_prescription(
    prescription_id: int, request: Request, actor: Actor = Depends(require_roles("admin", "pharmacist"))
):
    with request.app.state.db.transaction() as conn:
        return finance.dispense_prescription(conn, prescription_id, actor)
