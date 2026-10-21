import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Check, ChevronRight, Clock3, Plus, Ticket, UserPlus } from 'lucide-react'
import { api } from '../api/client'
import type { Department, Page, Patient, Registration, Schedule } from '../api/types'
import { age, businessDate, genderNames, money, periodName } from '../lib/format'
import { useAction, useDebounce } from '../lib/hooks'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataState,
  DataTable,
  Field,
  Identity,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  Tabs,
} from '../components/ui'
import { PatientForm } from './Patients'

export function Registrations() {
  const [params, setParams] = useSearchParams()
  const [date, setDate] = useState(businessDate())
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(params.get('new') === '1')
  const [cancel, setCancel] = useState<Registration | null>(null)
  const [receipt, setReceipt] = useState<Registration | null>(null)
  const debounced = useDebounce(q)
  const query = useQuery({
    queryKey: ['registrations', date, debounced, status, page],
    queryFn: () =>
      api.get<Page<Registration>>('/registrations', { date, q: debounced, status, page }),
  })
  const cancelAction = useAction(
    (id: number) => api.post(`/registrations/${id}/cancel`),
    '挂号已取消，号源已释放',
  )
  const close = () => {
    setOpen(false)
    setParams({})
  }
  return (
    <div>
      <PageHeader
        eyebrow="OUTPATIENT REGISTRATION"
        title="门诊挂号"
        description="从一次有序的预约，开始安心的就诊。"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} />
            新建挂号
          </Button>
        }
      />
      <section className="panel">
        <div className="table-toolbar">
          <Tabs
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={[
              { value: '', label: '全部挂号' },
              { value: 'waiting', label: '待就诊' },
              { value: 'in_progress', label: '就诊中' },
              { value: 'completed', label: '已完成' },
              { value: 'cancelled', label: '已取消' },
            ]}
          />
          <div className="toolbar-controls">
            <div className="date-control">
              <CalendarDays size={16} />
              <input
                type="date"
                aria-label="就诊日期"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>
        </div>
        <div className="sub-toolbar">
          <p>
            <Ticket size={16} />
            {date} <span className="muted">·</span> {query.data?.total || 0} 条挂号记录
          </p>
          <SearchInput
            value={q}
            onChange={(value) => {
              setQ(value)
              setPage(1)
            }}
          />
        </div>
        <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
          <DataTable<Registration>
            items={query.data?.items || []}
            columns={[
              {
                key: 'patient',
                title: '患者',
                render: (item) => (
                  <Identity
                    name={item.patient_name}
                    sub={`${genderNames[item.gender]} · ${age(item.birth_date)}岁`}
                  />
                ),
              },
              {
                key: 'number',
                title: '挂号信息',
                render: (item) => (
                  <div className="cell-lines">
                    <strong className="mono">{item.registration_no}</strong>
                    <small>{item.patient_no}</small>
                  </div>
                ),
              },
              {
                key: 'doctor',
                title: '科室 / 医生',
                render: (item) => (
                  <div className="cell-lines">
                    <strong>{item.department_name}</strong>
                    <small>
                      {item.doctor_name} · {item.doctor_title}
                    </small>
                  </div>
                ),
              },
              {
                key: 'time',
                title: '时段 / 队列',
                render: (item) => (
                  <div className="cell-lines">
                    <strong>{item.period === 'morning' ? '上午门诊' : '下午门诊'}</strong>
                    <small>
                      排队号 <b className="mono">{String(item.queue_no).padStart(3, '0')}</b>
                    </small>
                  </div>
                ),
              },
              {
                key: 'status',
                title: '状态',
                render: (item) => <StatusBadge status={item.status} />,
              },
              {
                key: 'actions',
                title: '操作',
                className: 'text-right',
                render: (item) => (
                  <div className="row-actions">
                    <Button size="small" variant="ghost" onClick={() => setReceipt(item)}>
                      挂号凭证
                    </Button>
                    {['waiting', 'in_progress'].includes(item.status) && !item.prescription_id && (
                      <Button
                        size="small"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setCancel(item)}
                      >
                        退号
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <Pagination total={query.data?.total || 0} page={page} onChange={setPage} />
        </DataState>
      </section>
      <div className="page-hint">
        <Clock3 size={14} />
        号源按医生及上下午时段独立管理，退号后自动释放，排队号不重复使用。
      </div>
      {open && (
        <RegistrationForm
          patientId={Number(params.get('patient')) || undefined}
          onClose={close}
          onSaved={(value) => {
            close()
            setReceipt(value)
          }}
        />
      )}
      {cancel && (
        <ConfirmDialog
          title="确认取消挂号？"
          confirmLabel="确认退号"
          danger
          loading={cancelAction.isPending}
          onClose={() => setCancel(null)}
          onConfirm={() => cancelAction.mutate(cancel.id, { onSuccess: () => setCancel(null) })}
        >
          <p>
            将取消 <b>{cancel.patient_name}</b> 在 <b>{cancel.department_name}</b>{' '}
            的预约，并释放该时段 1 个号源。
          </p>
          <p className="muted">挂号编号：{cancel.registration_no}</p>
          {cancelAction.error && <Notice tone="warning">{cancelAction.error.message}</Notice>}
        </ConfirmDialog>
      )}
      {receipt && (
        <Modal
          title="门诊挂号凭证"
          onClose={() => setReceipt(null)}
          footer={<Button onClick={() => setReceipt(null)}>完成</Button>}
        >
          <div className="registration-receipt">
            <span className="receipt-check">
              <Check size={27} />
            </span>
            <h3>{receipt.status === 'cancelled' ? '此挂号已取消' : '预约信息已确认'}</h3>
            <p>{receipt.registration_no}</p>
            <div className="receipt-queue">
              <small>排队号</small>
              <strong>{String(receipt.queue_no).padStart(3, '0')}</strong>
              <span>
                {receipt.department_name} · {receipt.doctor_name}
              </span>
            </div>
            <div className="receipt-details">
              <div>
                <span>患者姓名</span>
                <b>{receipt.patient_name}</b>
              </div>
              <div>
                <span>就诊日期</span>
                <b>{receipt.visit_date}</b>
              </div>
              <div>
                <span>门诊时段</span>
                <b>{periodName(receipt.period)}</b>
              </div>
              <div>
                <span>当前状态</span>
                <StatusBadge status={receipt.status} />
              </div>
              <div>
                <span>门诊诊查标准</span>
                <b>{money(receipt.fee_cents)}</b>
              </div>
            </div>
            <small className="muted">诊查标准供参考，处方费用在收费台另行核对。</small>
          </div>
        </Modal>
      )}
    </div>
  )
}

function RegistrationForm({
  patientId,
  onClose,
  onSaved,
}: {
  patientId?: number
  onClose: () => void
  onSaved: (registration: Registration) => void
}) {
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<number | undefined>(patientId)
  const [date, setDate] = useState(businessDate())
  const [department, setDepartment] = useState('')
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [newPatient, setNewPatient] = useState(false)
  const search = useDebounce(patientSearch)
  const patients = useQuery({
    queryKey: ['patients', 'picker', search],
    queryFn: () => api.get<Page<Patient>>('/patients', { q: search, page_size: 100 }),
  })
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
  })
  const schedules = useQuery({
    queryKey: ['schedules', date, department],
    queryFn: () => api.get<Schedule[]>('/schedules', { date, department_id: department }),
  })
  const action = useAction(
    (payload: { patient_id: number; schedule_id: number }) =>
      api.post<Registration>('/registrations', payload),
    '挂号成功',
  )
  const selected = patients.data?.items.find((patient) => patient.id === selectedPatient)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (selectedPatient && schedule)
      action.mutate(
        { patient_id: selectedPatient, schedule_id: schedule.id },
        { onSuccess: onSaved },
      )
  }
  return (
    <>
      <Modal
        title="新建门诊挂号"
        description="选择患者、就诊科室与合适的医生时段"
        wide
        onClose={onClose}
        busy={action.isPending}
        footer={
          <>
            <div className="modal-footer-summary">
              {schedule ? (
                <>
                  <span>诊查标准</span>
                  <strong>{money(schedule.consultation_fee_cents)}</strong>
                </>
              ) : (
                <span>请选择一个可用时段</span>
              )}
            </div>
            <Button variant="secondary" onClick={onClose} disabled={action.isPending}>
              取消
            </Button>
            <Button
              type="submit"
              form="registration-form"
              disabled={!selectedPatient || !schedule}
              loading={action.isPending}
            >
              确认挂号
              <ChevronRight size={16} />
            </Button>
          </>
        }
      >
        <form id="registration-form" onSubmit={submit}>
          <div className="form-section-title">
            <span>01</span>
            <h3>选择患者</h3>
            <Button variant="ghost" size="small" onClick={() => setNewPatient(true)}>
              <UserPlus size={15} />
              新建患者
            </Button>
          </div>
          <div className="form-grid">
            <Field label="检索患者">
              <input
                placeholder="输入姓名或编号"
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
              />
            </Field>
            <Field label="患者档案" required>
              <select
                required
                value={selectedPatient || ''}
                onChange={(event) => setSelectedPatient(Number(event.target.value))}
              >
                <option value="">请选择患者</option>
                {patients.data?.items.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name} · {patient.patient_no}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {patients.error && <Notice tone="warning">{patients.error.message}</Notice>}
          {selected && (
            <div className="selected-patient">
              <Identity
                name={selected.full_name}
                sub={`${genderNames[selected.gender]} · ${age(selected.birth_date)}岁 · ${selected.patient_no}`}
              />
              <Badge tone={selected.allergies.startsWith('无') ? 'gray' : 'amber'}>
                {selected.allergies}
              </Badge>
            </div>
          )}
          <div className="form-section-title">
            <span>02</span>
            <h3>选择就诊时段</h3>
          </div>
          <div className="form-grid">
            <Field label="就诊日期" required>
              <input
                type="date"
                required
                min={businessDate()}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value)
                  setSchedule(null)
                }}
              />
            </Field>
            <Field label="就诊科室">
              <select
                value={department}
                onChange={(event) => {
                  setDepartment(event.target.value)
                  setSchedule(null)
                }}
              >
                <option value="">全部科室</option>
                {departments.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <DataState
            pending={schedules.isPending}
            error={schedules.error}
            onRetry={() => schedules.refetch()}
          >
            <div className="schedule-options">
              {schedules.data?.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={!item.remaining_slots}
                  className={`schedule-option ${schedule?.id === item.id ? 'selected' : ''}`}
                  onClick={() => setSchedule(item)}
                >
                  <div>
                    <strong>
                      {item.doctor_name}
                      <small>{item.title}</small>
                    </strong>
                    <span>{item.department_name}</span>
                  </div>
                  <div>
                    <small>
                      {item.period === 'morning' ? '上午 08:00–12:00' : '下午 14:00–17:30'}
                    </small>
                    <Badge tone={item.remaining_slots ? 'green' : 'gray'}>
                      {item.remaining_slots ? `余 ${item.remaining_slots} 号` : '已约满'}
                    </Badge>
                  </div>
                  {schedule?.id === item.id && (
                    <span className="option-check">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            {!schedules.data?.length && (
              <Notice>此日期暂无排班，请更换日期或联系管理员安排号源。</Notice>
            )}
          </DataState>
          {action.error && <Notice tone="warning">{action.error.message}</Notice>}
        </form>
      </Modal>
      {newPatient && (
        <PatientForm
          patient={null}
          onClose={() => setNewPatient(false)}
          onSaved={(value) => {
            setPatientSearch('')
            setSelectedPatient(value.id)
          }}
        />
      )}
    </>
  )
}
