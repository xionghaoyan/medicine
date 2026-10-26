-- Qinghe HIS / SQLite schema. Monetary values are integer cents.
CREATE TABLE departments (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, location TEXT NOT NULL,
 color TEXT NOT NULL DEFAULT '#32796a'
);
CREATE TABLE doctors (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, title TEXT NOT NULL,
 department_id INTEGER NOT NULL REFERENCES departments(id), specialty TEXT NOT NULL DEFAULT '',
 consultation_fee_cents INTEGER NOT NULL DEFAULT 1500 CHECK(consultation_fee_cents >= 0),
 avatar_color TEXT NOT NULL DEFAULT '#e6f0e9'
);
CREATE INDEX idx_doctor_department ON doctors(department_id);
CREATE TABLE users (
 id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','doctor','cashier','pharmacist')),
 doctor_id INTEGER REFERENCES doctors(id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL, CHECK(role != 'doctor' OR doctor_id IS NOT NULL)
);
CREATE TABLE patients (
 id INTEGER PRIMARY KEY, patient_no TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL,
 gender TEXT NOT NULL CHECK(gender IN ('male','female','other')), birth_date TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '', allergies TEXT NOT NULL DEFAULT '无已知过敏',
 address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX idx_patient_name ON patients(full_name);
CREATE TABLE schedules (
 id INTEGER PRIMARY KEY, doctor_id INTEGER NOT NULL REFERENCES doctors(id), date TEXT NOT NULL,
 period TEXT NOT NULL CHECK(period IN ('morning','afternoon')),
 total_slots INTEGER NOT NULL CHECK(total_slots BETWEEN 1 AND 200),
 remaining_slots INTEGER NOT NULL CHECK(remaining_slots >= 0 AND remaining_slots <= total_slots),
 next_queue_no INTEGER NOT NULL DEFAULT 0 CHECK(next_queue_no >= 0),
 UNIQUE(doctor_id,date,period)
);
CREATE INDEX idx_schedule_date ON schedules(date);
CREATE TABLE registrations (
 id INTEGER PRIMARY KEY, registration_no TEXT NOT NULL UNIQUE,
 patient_id INTEGER NOT NULL REFERENCES patients(id), schedule_id INTEGER NOT NULL REFERENCES schedules(id),
 queue_no INTEGER NOT NULL CHECK(queue_no > 0),
 status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','in_progress','completed','cancelled')),
 fee_cents INTEGER NOT NULL CHECK(fee_cents >= 0), created_at TEXT NOT NULL,
 UNIQUE(schedule_id,queue_no)
);
CREATE UNIQUE INDEX uk_active_registration ON registrations(patient_id,schedule_id) WHERE status != 'cancelled';
CREATE INDEX idx_reg_schedule ON registrations(schedule_id,status);
CREATE INDEX idx_reg_patient ON registrations(patient_id);
CREATE TABLE drugs (
 id INTEGER PRIMARY KEY, drug_code TEXT NOT NULL UNIQUE, generic_name TEXT NOT NULL,
 trade_name TEXT NOT NULL DEFAULT '', specification TEXT NOT NULL, dosage_form TEXT NOT NULL,
 unit TEXT NOT NULL DEFAULT '盒', price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
 insurance_category TEXT NOT NULL DEFAULT 'self' CHECK(insurance_category IN ('A','B','self')),
 manufacturer TEXT NOT NULL DEFAULT '', stock_threshold INTEGER NOT NULL DEFAULT 20 CHECK(stock_threshold >= 0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL
);
CREATE INDEX idx_drug_name ON drugs(generic_name);
CREATE TABLE stock_batches (
 id INTEGER PRIMARY KEY, drug_id INTEGER NOT NULL REFERENCES drugs(id), batch_no TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity >= 0), reserved_quantity INTEGER NOT NULL DEFAULT 0,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
 CHECK(reserved_quantity >= 0 AND reserved_quantity <= quantity), UNIQUE(drug_id,batch_no)
);
CREATE INDEX idx_batch_expiry ON stock_batches(drug_id,expires_at);
CREATE TABLE prescriptions (
 id INTEGER PRIMARY KEY, prescription_no TEXT NOT NULL UNIQUE,
 registration_id INTEGER NOT NULL UNIQUE REFERENCES registrations(id), doctor_id INTEGER NOT NULL REFERENCES doctors(id),
 diagnosis TEXT NOT NULL, diagnosis_code TEXT NOT NULL DEFAULT '', chief_complaint TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '', total_amount_cents INTEGER NOT NULL CHECK(total_amount_cents >= 0),
 status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid','dispensed','voided','refunded')),
 created_at TEXT NOT NULL
);
CREATE INDEX idx_rx_status ON prescriptions(status,created_at);
CREATE TABLE prescription_items (
 id INTEGER PRIMARY KEY, prescription_id INTEGER NOT NULL REFERENCES prescriptions(id),
 drug_id INTEGER NOT NULL REFERENCES drugs(id), drug_name TEXT NOT NULL, specification TEXT NOT NULL,
 unit TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
 line_total_cents INTEGER NOT NULL CHECK(line_total_cents = unit_price_cents * quantity),
 dosage TEXT NOT NULL, frequency TEXT NOT NULL, UNIQUE(prescription_id,drug_id)
);
CREATE INDEX idx_rx_item_parent ON prescription_items(prescription_id);
CREATE TABLE charges (
 id INTEGER PRIMARY KEY, charge_no TEXT NOT NULL UNIQUE, prescription_id INTEGER NOT NULL UNIQUE REFERENCES prescriptions(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
 payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','wechat','alipay','card')),
 cashier_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','refunded')),
 paid_at TEXT NOT NULL, refunded_at TEXT, refund_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_charge_paid_at ON charges(paid_at);
CREATE TABLE stock_reservations (
 id INTEGER PRIMARY KEY, prescription_id INTEGER NOT NULL REFERENCES prescriptions(id),
 batch_id INTEGER NOT NULL REFERENCES stock_batches(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','released','dispensed')),
 UNIQUE(prescription_id,batch_id)
);
CREATE INDEX idx_reservation_rx ON stock_reservations(prescription_id,status);
CREATE TABLE dispensations (
 id INTEGER PRIMARY KEY, dispense_no TEXT NOT NULL UNIQUE,
 prescription_id INTEGER NOT NULL UNIQUE REFERENCES prescriptions(id),
 pharmacist_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE INDEX idx_dispense_time ON dispensations(created_at);
CREATE TABLE stock_movements (
 id INTEGER PRIMARY KEY, drug_id INTEGER NOT NULL REFERENCES drugs(id),
 batch_id INTEGER NOT NULL REFERENCES stock_batches(id), quantity_delta INTEGER NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('receive','dispense')), reference_no TEXT NOT NULL,
 operator_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE INDEX idx_movement_batch ON stock_movements(batch_id,created_at);
CREATE TABLE audit_logs (
 id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), actor_name TEXT NOT NULL,
 action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '{}', ip_address TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);
CREATE TABLE auth_sessions (
 jti TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
);
CREATE INDEX idx_session_user ON auth_sessions(user_id);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
