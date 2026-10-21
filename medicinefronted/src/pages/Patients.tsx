import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarPlus,
  FileHeart,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { Page, Patient, PatientInput, Visit } from '../api/types'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { age, businessDate, dateTime, genderNames, phoneMasked } from '../lib/format'
import { useAction, useDebounce } from '../lib/hooks'
import {
  Badge,
  Button,
  DataState,
  DataTable,
  Field,
  Identity,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  SectionHeading,
  StatusBadge,
} from '../components/ui'

export function Patients() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin' || user?.role === 'cashier'
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const debounced = useDebounce(q)
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<Patient | null | undefined>()
  const [detailId, setDetailId] = useState<number | null>(null)
  const query = useQuery({
    queryKey: ['patients', debounced, page],
    queryFn: () => api.get<Page<Patient>>('/patients', { q: debounced, page }),
  })
  return (
    <div>
      <PageHeader
        eyebrow="PATIENT RECORDS"
        title="患者档案"
        description="让每一份健康信息，清晰可查、持续相伴。"
        actions={
          canEdit && (
            <Button onClick={() => setForm(null)}>
              <Plus size={17} />
              新建患者
            </Button>
          )
        }
      />
      <div className="context-strip">
        <div>
          <span className="context-icon">
            <Users size={22} />
          </span>
          <div>
            <small>{q ? '符合搜索条件' : '已建立健康档案'}</small>
            <strong>
              {query.data?.total ?? '—'}
              <em>位患者</em>
            </strong>
          </div>
        </div>
        <span className="context-separator" />
        <p>
          <ShieldCheck size={17} />
          {canEdit
            ? '统一维护基础信息与过敏记录，支持全流程追溯。'
            : '仅展示您负责诊疗的患者档案。'}
        </p>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="toolbar-title">
            <FileHeart size={18} />
            <h2>患者列表</h2>
            <span className="count-pill">{query.data?.total || 0}</span>
          </div>
          <SearchInput
            value={q}
            onChange={(value) => {
              setParams(value ? { q: value } : {})
              setPage(1)
            }}
            placeholder="搜索姓名、患者编号、手机号…"
          />
        </div>
        <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
          <DataTable<Patient>
            items={query.data?.items || []}
            columns={[
              {
                key: 'name',
                title: '患者信息',
                render: (patient) => (
                  <button className="identity-button" onClick={() => setDetailId(patient.id)}>
                    <Identity name={patient.full_name} sub={patient.patient_no} />
                  </button>
                ),
              },
              {
                key: 'gender',
                title: '性别 / 年龄',
                render: (patient) => (
                  <span>
                    {genderNames[patient.gender]}
                    <span className="cell-separator">/</span>
                    {age(patient.birth_date)}岁
                  </span>
                ),
              },
              {
                key: 'phone',
                title: '联系电话',
                render: (patient) => <span className="mono">{phoneMasked(patient.phone)}</span>,
              },
              {
                key: 'allergies',
                title: '过敏信息',
                render: (patient) =>
                  patient.allergies && !patient.allergies.startsWith('无') ? (
                    <Badge tone="amber">{patient.allergies}</Badge>
                  ) : (
                    <span className="muted">无已知过敏</span>
                  ),
              },
              {
                key: 'date',
                title: '建档时间',
                render: (patient) => <span className="muted">{dateTime(patient.created_at)}</span>,
              },
              {
                key: 'actions',
                title: '操作',
                className: 'text-right',
                render: (patient) => (
                  <div className="row-actions">
                    <Button size="small" variant="ghost" onClick={() => setDetailId(patient.id)}>
                      查看档案
                      <ArrowUpRight size={14} />
                    </Button>
                    {canEdit && (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => navigate(`/registrations?new=1&patient=${patient.id}`)}
                      >
                        <CalendarPlus size={14} />
                        挂号
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
        <Search size={14} />
        手机号在列表中脱敏显示，完整资料请在有权限的档案中查看。
      </div>
      {form !== undefined && <PatientForm patient={form} onClose={() => setForm(undefined)} />}
      {detailId && (
        <PatientDetail
          id={detailId}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={(patient) => {
            setDetailId(null)
            setForm(patient)
          }}
        />
      )}
    </div>
  )
}

export function PatientForm({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient | null
  onClose: () => void
  onSaved?: (patient: Patient) => void
}) {
  const [form, setForm] = useState<PatientInput>({
    full_name: patient?.full_name || '',
    gender: patient?.gender || 'male',
    birth_date: patient?.birth_date || '',
    phone: patient?.phone || '',
    allergies: patient?.allergies || '无已知过敏',
    address: patient?.address || '',
  })
  const action = useAction(
    (payload: PatientInput) =>
      patient
        ? api.patch<Patient>(`/patients/${patient.id}`, payload)
        : api.post<Patient>('/patients', payload),
    patient ? '患者档案已更新' : '患者档案已建立',
  )
  const set = (key: keyof PatientInput, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    action.mutate(form, {
      onSuccess: (value) => {
        onSaved?.(value)
        onClose()
      },
    })
  }
  return (
    <Modal
      title={patient ? '编辑患者档案' : '新建患者档案'}
      description="准确记录基础信息，为后续诊疗做好准备。"
      onClose={onClose}
      busy={action.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={action.isPending}>
            取消
          </Button>
          <Button type="submit" form="patient-form" loading={action.isPending}>
            {patient ? '保存修改' : '建立档案'}
          </Button>
        </>
      }
    >
      <form id="patient-form" onSubmit={submit} className="form-grid">
        <Field label="患者姓名" required>
          <input
            required
            autoFocus
            maxLength={40}
            value={form.full_name}
            onChange={(event) => set('full_name', event.target.value)}
            placeholder="请输入患者姓名"
          />
        </Field>
        <Field label="性别" required>
          <select value={form.gender} onChange={(event) => set('gender', event.target.value)}>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </Field>
        <Field label="出生日期" required>
          <input
            type="date"
            required
            max={businessDate()}
            value={form.birth_date}
            onChange={(event) => set('birth_date', event.target.value)}
          />
        </Field>
        <Field label="联系电话">
          <input
            type="tel"
            maxLength={24}
            pattern="[0-9+* \-]*"
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            placeholder="请输入联系电话"
          />
        </Field>
        <Field
          label="过敏信息"
          className="full-width"
          hint="无已知过敏请明确填写；未知情况请记录为“待确认”。"
        >
          <input
            required
            maxLength={300}
            value={form.allergies}
            onChange={(event) => set('allergies', event.target.value)}
            placeholder="如：青霉素过敏"
          />
        </Field>
        <Field label="联系地址" className="full-width">
          <textarea
            rows={2}
            maxLength={200}
            value={form.address}
            onChange={(event) => set('address', event.target.value)}
            placeholder="选填，填写联系地址"
          />
        </Field>
        {action.error && (
          <div className="full-width">
            <Notice tone="warning">{action.error.message}</Notice>
          </div>
        )}
      </form>
    </Modal>
  )
}

function PatientDetail({
  id,
  canEdit,
  onClose,
  onEdit,
}: {
  id: number
  canEdit: boolean
  onClose: () => void
  onEdit: (patient: Patient) => void
}) {
  const query = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get<Patient>(`/patients/${id}`),
  })
  const patient = query.data
  return (
    <Modal
      title="患者健康档案"
      description={patient?.patient_no}
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          {canEdit && patient && <Button onClick={() => onEdit(patient)}>编辑档案</Button>}
        </>
      }
    >
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {patient && (
          <>
            <div className="patient-detail-heading">
              <Identity
                name={patient.full_name}
                sub={`${genderNames[patient.gender]} · ${age(patient.birth_date)}岁 · ${patient.birth_date}`}
              />
              <Badge>在册患者</Badge>
            </div>
            <div className="detail-grid">
              <div>
                <small>联系电话</small>
                <strong>{patient.phone || '未填写'}</strong>
              </div>
              <div>
                <small>联系地址</small>
                <strong>{patient.address || '未填写'}</strong>
              </div>
            </div>
            <Notice tone={patient.allergies.startsWith('无') ? 'info' : 'warning'}>
              过敏信息：{patient.allergies || '待确认'}
            </Notice>
            <SectionHeading title="就诊记录" subtitle="最近 50 次门诊就诊" />
            <DataTable<Visit>
              compact
              items={patient.visits || []}
              columns={[
                { key: 'date', title: '就诊日期', render: (visit) => visit.visit_date },
                {
                  key: 'doctor',
                  title: '科室 / 医生',
                  render: (visit) => (
                    <div className="cell-lines">
                      <strong>{visit.department_name}</strong>
                      <small>{visit.doctor_name}</small>
                    </div>
                  ),
                },
                { key: 'diagnosis', title: '诊断', render: (visit) => visit.diagnosis || '待接诊' },
                {
                  key: 'status',
                  title: '状态',
                  render: (visit) => <StatusBadge status={visit.status} />,
                },
              ]}
            />
          </>
        )}
      </DataState>
    </Modal>
  )
}
