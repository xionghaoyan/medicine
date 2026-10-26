export type Role = 'admin' | 'doctor' | 'cashier' | 'pharmacist'
export type Gender = 'male' | 'female' | 'other'
export interface User {
  id: number
  username: string
  display_name: string
  role: Role
  doctor_id: number | null
  active: number
  doctor_name?: string
}
export interface Meta {
  hospital_name: string
  date: string
  demo_mode: boolean
}
export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
export interface Department {
  id: number
  name: string
  location: string
  color: string
}
export interface Doctor {
  id: number
  name: string
  title: string
  department_id: number
  department_name: string
  specialty: string
  consultation_fee_cents: number
  avatar_color: string
  location: string
}
export interface Patient {
  id: number
  patient_no: string
  full_name: string
  gender: Gender
  birth_date: string
  phone: string
  allergies: string
  address: string
  created_at: string
  visits?: Visit[]
}
export interface Visit {
  id: number
  registration_no: string
  visit_date: string
  period: string
  status: string
  doctor_name: string
  department_name: string
  diagnosis: string | null
  prescription_id: number | null
  prescription_status: string | null
}
export interface PatientInput {
  full_name: string
  gender: Gender
  birth_date: string
  phone: string
  allergies: string
  address: string
}
export interface Schedule {
  id: number
  doctor_id: number
  date: string
  period: 'morning' | 'afternoon'
  total_slots: number
  remaining_slots: number
  next_queue_no: number
  doctor_name: string
  title: string
  specialty: string
  consultation_fee_cents: number
  avatar_color: string
  department_id: number
  department_name: string
  location: string
}
export interface Registration {
  id: number
  registration_no: string
  patient_id: number
  schedule_id: number
  queue_no: number
  status: 'waiting' | 'in_progress' | 'completed' | 'cancelled'
  fee_cents: number
  created_at: string
  patient_name: string
  patient_no: string
  gender: Gender
  birth_date: string
  phone: string
  allergies: string
  visit_date: string
  period: string
  doctor_id: number
  doctor_name: string
  doctor_title: string
  department_id: number
  department_name: string
  prescription_id: number | null
  prescription_status: string | null
  total_amount_cents: number | null
}
export type PrescriptionStatus = 'unpaid' | 'paid' | 'dispensed' | 'refunded' | 'voided'
export interface PrescriptionSummary {
  id: number
  prescription_no: string
  registration_id: number
  doctor_id: number
  diagnosis: string
  diagnosis_code: string
  chief_complaint: string
  notes: string
  total_amount_cents: number
  status: PrescriptionStatus
  created_at: string
  patient_id: number
  patient_name: string
  patient_no: string
  gender: Gender
  birth_date: string
  phone: string
  allergies: string
  registration_no: string
  queue_no: number
  registration_status: string
  visit_date: string
  period: string
  doctor_name: string
  department_name: string
}
export interface PrescriptionItem {
  id: number
  drug_id: number
  drug_name: string
  specification: string
  unit: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  dosage: string
  frequency: string
}
export interface Prescription extends PrescriptionSummary {
  items: PrescriptionItem[]
  charge: Charge | null
  dispensation: Dispensation | null
  reservations: Reservation[]
}
export interface Charge {
  id: number
  charge_no: string
  amount_cents: number
  payment_method: string
  status: string
  paid_at: string
  refunded_at: string | null
  refund_reason: string
  cashier_name: string
}
export interface Dispensation {
  id: number
  dispense_no: string
  pharmacist_name: string
  created_at: string
}
export interface Reservation {
  id: number
  batch_no: string
  expires_at: string
  quantity: number
  drug_name: string
  status: string
}
export interface DrugInput {
  drug_code: string
  generic_name: string
  trade_name: string
  specification: string
  dosage_form: string
  unit: string
  price_cents: number
  insurance_category: 'A' | 'B' | 'self'
  manufacturer: string
  stock_threshold: number
  active: boolean
}
export interface Drug extends Omit<DrugInput, 'active'> {
  id: number
  active: number
  total_stock: number
  reserved_stock: number
  available_stock: number
  nearest_expiry: string | null
  expiring_stock: number
  created_at: string
}
export interface Batch {
  id: number
  drug_id: number
  batch_no: string
  quantity: number
  reserved_quantity: number
  available_quantity: number
  expires_at: string
  created_at: string
}
export interface ImportResult {
  success_count: number
  skipped_count: number
  failed_count: number
  errors: { row: number; message: string }[]
}
export interface Alert {
  id: string
  type: 'warning' | 'info'
  title: string
  description: string
  path: string
}
export interface Dashboard {
  date: string
  stats: {
    today_visits: number
    yesterday_visits: number
    waiting: number
    in_progress: number
    completed: number
    today_revenue_cents: number | null
    unpaid: number
    pending_dispense: number
    low_stock: number
    total_patients: number | null
  }
  trend: { date: string; visits: number }[]
  departments: { id: number; name: string; color: string; visits: number }[]
  waiting_list: Registration[]
  alerts: Alert[]
  activity: { action: string; actor_name: string; entity_type: string; created_at: string }[]
}
export interface DailyReport {
  date: string
  visits: number
  paid_cents: number
  refund_cents: number
  revenue_cents: number
  charges: number
}
export interface Report {
  start_date: string
  end_date: string
  summary: Omit<DailyReport, 'date'> & { average_cents: number }
  daily: DailyReport[]
  departments: { id: number; name: string; color: string; visits: number; revenue_cents: number }[]
  payment_methods: { payment_method: string; count: number; amount_cents: number }[]
}
export interface AuditLog {
  id: number
  actor_name: string
  action: string
  entity_type: string
  entity_id: string
  details: Record<string, string | number | boolean | string[]>
  ip_address: string
  created_at: string
}
export interface HospitalSettings {
  hospital_name: string
  phone: string
  address: string
}
export interface SearchResult {
  id: number
  title: string
  subtitle: string
  path: string
  query: string
  type: string
}
