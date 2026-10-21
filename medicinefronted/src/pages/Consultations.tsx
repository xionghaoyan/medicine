import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardPlus,
  FileText,
  HeartPulse,
  Plus,
  Search,
  Stethoscope,
  Trash2,
} from 'lucide-react'
import { api } from '../api/client'
import type { Drug, Page, Prescription, PrescriptionSummary, Registration } from '../api/types'
import { age, businessDate, genderNames, money } from '../lib/format'
import { useAction, useDebounce } from '../lib/hooks'
import {
  Button,
  DataState,
  DataTable,
  EmptyState,
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
import { PrescriptionModal } from '../components/PrescriptionDetail'

export function Consultations() {
  const [tab, setTab] = useState('queue')
  const [date, setDate] = useState(businessDate())
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [rxId, setRxId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [queuePage, setQueuePage] = useState(1)
  const debounced = useDebounce(search)
  const queue = useQuery({
    queryKey: ['consultation-queue', date, debounced, queuePage],
    queryFn: () =>
      api.get<Page<Registration>>('/registrations', {
        date,
        q: debounced,
        page: queuePage,
        page_size: 20,
        pending_only: true,
      }),
  })
  const prescriptions = useQuery({
    queryKey: ['consultation-rx', date, page],
    queryFn: () => api.get<Page<PrescriptionSummary>>('/prescriptions', { date, page }),
    enabled: tab === 'prescriptions',
  })
  const waiting = queue.data?.items || []
  const selected = waiting.find((item) => item.id === selectedId) || waiting[0]
  return (
    <div>
      <PageHeader
        eyebrow="DOCTOR WORKSPACE"
        title="医生工作站"
        description="专注诊疗，让记录与处方自然衔接。"
        actions={
          <div className="date-control">
            <CalendarDays size={16} />
            <input
              aria-label="工作站日期"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value)
                setSelectedId(null)
                setPage(1)
                setQueuePage(1)
              }}
            />
          </div>
        }
      />
      <div className="workspace-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'queue', label: '候诊队列', count: queue.data?.total || 0 },
            { value: 'prescriptions', label: '今日处方' },
          ]}
        />
        <span>
          <span className="status-dot" />
          诊疗工作区
        </span>
      </div>
      {tab === 'queue' ? (
        <DataState pending={queue.isPending} error={queue.error} onRetry={() => queue.refetch()}>
          <div className="consultation-layout">
            <aside className="panel patient-queue">
              <header>
                <h2>
                  待接诊患者 <span>{queue.data?.total || 0}</span>
                </h2>
                <SearchInput
                  value={search}
                  onChange={(value) => {
                    setSearch(value)
                    setQueuePage(1)
                    setSelectedId(null)
                  }}
                  placeholder="搜索候诊患者…"
                />
              </header>
              <div className="patient-queue-list">
                {waiting.length ? (
                  waiting.map((item) => (
                    <button
                      key={item.id}
                      className={`patient-queue-item ${selected?.id === item.id ? 'selected' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="queue-item-top">
                        <span className="queue-number">
                          {String(item.queue_no).padStart(3, '0')}
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="queue-patient-name">
                        <strong>{item.patient_name}</strong>
                        <span>
                          {genderNames[item.gender]} · {age(item.birth_date)}岁
                        </span>
                      </div>
                      <div className="queue-item-bottom">
                        <span>
                          {item.department_name} · {item.doctor_name}
                        </span>
                        <ChevronRight size={15} />
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyState title="暂无待接诊患者" description="新的挂号会出现在这里。" />
                )}
              </div>
              {(queue.data?.total || 0) > 20 && (
                <Pagination
                  total={queue.data?.total || 0}
                  page={queuePage}
                  onChange={(value) => {
                    setQueuePage(value)
                    setSelectedId(null)
                  }}
                />
              )}
              <footer>
                <HeartPulse size={16} />
                每一份等待，都值得认真对待。
              </footer>
            </aside>
            {selected ? (
              <ConsultationEditor
                key={selected.id}
                registration={selected}
                onCreated={(rx) => {
                  setSelectedId(null)
                  setQueuePage(1)
                  setRxId(rx.id)
                }}
              />
            ) : (
              <section className="panel consultation-empty">
                <Stethoscope size={54} strokeWidth={1} />
                <h2>从一位患者开始</h2>
                <p>选择候诊患者，即可记录诊断与开具处方。</p>
                <span>当前队列已全部处理</span>
              </section>
            )}
          </div>
        </DataState>
      ) : (
        <section className="panel">
          <DataState
            pending={prescriptions.isPending}
            error={prescriptions.error}
            onRetry={() => prescriptions.refetch()}
          >
            <DataTable<PrescriptionSummary>
              items={prescriptions.data?.items || []}
              columns={[
                {
                  key: 'patient',
                  title: '患者',
                  render: (item) => <Identity name={item.patient_name} sub={item.patient_no} />,
                },
                {
                  key: 'rx',
                  title: '处方编号',
                  render: (item) => <span className="mono">{item.prescription_no}</span>,
                },
                {
                  key: 'diagnosis',
                  title: '诊断',
                  render: (item) => (
                    <div className="cell-lines">
                      <strong>{item.diagnosis}</strong>
                      <small>{item.diagnosis_code}</small>
                    </div>
                  ),
                },
                {
                  key: 'amount',
                  title: '金额',
                  render: (item) => <b className="money">{money(item.total_amount_cents)}</b>,
                },
                {
                  key: 'status',
                  title: '状态',
                  render: (item) => <StatusBadge status={item.status} />,
                },
                {
                  key: 'actions',
                  title: '操作',
                  render: (item) => (
                    <Button size="small" variant="ghost" onClick={() => setRxId(item.id)}>
                      查看处方
                    </Button>
                  ),
                },
              ]}
            />
            <Pagination total={prescriptions.data?.total || 0} page={page} onChange={setPage} />
          </DataState>
        </section>
      )}
      {rxId && <PrescriptionModal id={rxId} canVoid onClose={() => setRxId(null)} />}
    </div>
  )
}

interface RxDraftItem {
  drug: Drug
  quantity: number
  dosage: string
  frequency: string
}
function ConsultationEditor({
  registration: reg,
  onCreated,
}: {
  registration: Registration
  onCreated: (rx: Prescription) => void
}) {
  const [complaint, setComplaint] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [code, setCode] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<RxDraftItem[]>([])
  const [picker, setPicker] = useState(false)
  const start = useAction(() => api.post(`/registrations/${reg.id}/start`), '已开始接诊')
  const create = useAction(
    () =>
      api.post<Prescription>('/prescriptions', {
        registration_id: reg.id,
        diagnosis,
        diagnosis_code: code,
        chief_complaint: complaint,
        notes,
        items: items.map((item) => ({
          drug_id: item.drug.id,
          quantity: item.quantity,
          dosage: item.dosage,
          frequency: item.frequency,
        })),
      }),
    '处方已开具，可前往收费台结算',
  )
  const updateItem = (
    id: number,
    field: 'quantity' | 'dosage' | 'frequency',
    value: string | number,
  ) =>
    setItems((previous) =>
      previous.map((item) => (item.drug.id === id ? { ...item, [field]: value } : item)),
    )
  const total = items.reduce((sum, item) => sum + item.drug.price_cents * item.quantity, 0)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (items.length) create.mutate(undefined, { onSuccess: onCreated })
  }
  return (
    <section className="panel consultation-editor">
      <div className="consultation-patient">
        <Identity
          name={reg.patient_name}
          sub={`${genderNames[reg.gender]} · ${age(reg.birth_date)}岁 · ${reg.patient_no}`}
        />
        <div>
          <StatusBadge status={reg.status} />
          {reg.status === 'waiting' && (
            <Button
              size="small"
              variant="secondary"
              loading={start.isPending}
              onClick={() => start.mutate(undefined)}
            >
              开始接诊
            </Button>
          )}
        </div>
      </div>
      <div className="consultation-meta">
        <span>
          <Stethoscope size={15} />
          {reg.department_name} · {reg.doctor_name}
        </span>
        <span>
          <CalendarDays size={15} />
          {reg.visit_date}
        </span>
        <span>挂号单 {reg.registration_no}</span>
      </div>
      {reg.allergies && !reg.allergies.startsWith('无') && (
        <div className="consultation-allergy">
          <Notice tone="warning">{reg.allergies}，开方前请核对过敏史。</Notice>
        </div>
      )}
      <form onSubmit={submit} className="consultation-form">
        <div className="editor-section">
          <div className="editor-section-title">
            <FileText size={18} />
            <h3>诊疗记录</h3>
            <span>记录当前就诊情况</span>
          </div>
          <Field label="患者主诉" required>
            <textarea
              required
              maxLength={1000}
              rows={2}
              value={complaint}
              onChange={(event) => setComplaint(event.target.value)}
              placeholder="记录主要症状、持续时间及相关情况…"
            />
          </Field>
          <div className="form-grid diagnosis-grid">
            <Field label="临床诊断" required>
              <input
                required
                maxLength={200}
                value={diagnosis}
                onChange={(event) => setDiagnosis(event.target.value)}
                placeholder="请输入诊断名称"
              />
            </Field>
            <Field label="诊断编码" hint="选填，请使用核对后的 ICD-10 编码">
              <input
                maxLength={20}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="如 J06.9"
              />
            </Field>
          </div>
        </div>
        <div className="editor-section prescription-editor">
          <div className="editor-section-title">
            <ClipboardPlus size={18} />
            <h3>处方用药</h3>
            <span>{items.length} 种药品</span>
            <Button variant="secondary" size="small" onClick={() => setPicker(true)}>
              <Plus size={15} />
              添加药品
            </Button>
          </div>
          {items.length ? (
            <div className="prescription-entry-list">
              {items.map((item, index) => (
                <div className="prescription-entry" key={item.drug.id}>
                  <div className="entry-heading">
                    <span className="entry-index">{index + 1}</span>
                    <div>
                      <strong>{item.drug.generic_name}</strong>
                      <small>
                        {item.drug.specification} · {money(item.drug.price_cents)} /{' '}
                        {item.drug.unit}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`移除${item.drug.generic_name}`}
                      onClick={() =>
                        setItems((previous) =>
                          previous.filter((row) => row.drug.id !== item.drug.id),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="entry-fields">
                    <Field label="数量" required>
                      <div className="unit-input">
                        <input
                          aria-label={`${item.drug.generic_name}数量`}
                          type="number"
                          required
                          min={1}
                          max={999}
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(item.drug.id, 'quantity', Number(event.target.value))
                          }
                        />
                        <span>{item.drug.unit}</span>
                      </div>
                    </Field>
                    <Field label="每次用量" required>
                      <input
                        aria-label={`${item.drug.generic_name}用量`}
                        required
                        maxLength={80}
                        value={item.dosage}
                        onChange={(event) => updateItem(item.drug.id, 'dosage', event.target.value)}
                        placeholder="请填写医嘱用量"
                      />
                    </Field>
                    <Field label="用药频次" required>
                      <select
                        aria-label={`${item.drug.generic_name}频次`}
                        required
                        value={item.frequency}
                        onChange={(event) =>
                          updateItem(item.drug.id, 'frequency', event.target.value)
                        }
                      >
                        <option value="">选择频次</option>
                        <option>每日一次</option>
                        <option>每日两次</option>
                        <option>每日三次</option>
                        <option>必要时</option>
                        <option>遵医嘱</option>
                      </select>
                    </Field>
                    <div className="entry-subtotal">
                      <small>小计</small>
                      <strong>{money(item.drug.price_cents * item.quantity)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="prescription-placeholder">
              <span>℞</span>
              <h4>处方从这里开始</h4>
              <p>点击“添加药品”，填写用量与频次。</p>
              <Button variant="ghost" onClick={() => setPicker(true)}>
                <Plus size={15} />
                选择药品
              </Button>
            </div>
          )}
          <Field label="医嘱备注">
            <textarea
              maxLength={2000}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="选填，补充注意事项或复诊安排…"
            />
          </Field>
        </div>
        {create.error && <Notice tone="warning">{create.error.message}</Notice>}
        <footer className="consultation-footer">
          <div>
            <span>
              处方金额合计 <small>共 {items.length} 种药品</small>
            </span>
            <strong>{money(total)}</strong>
          </div>
          <Button type="submit" disabled={!items.length} loading={create.isPending}>
            <Check size={17} />
            确认并开具处方
          </Button>
        </footer>
      </form>
      {picker && (
        <DrugPicker
          selectedIds={items.map((item) => item.drug.id)}
          onClose={() => setPicker(false)}
          onSelect={(drug) => {
            setItems((previous) => [...previous, { drug, quantity: 1, dosage: '', frequency: '' }])
            setPicker(false)
          }}
        />
      )}
    </section>
  )
}

function DrugPicker({
  selectedIds,
  onSelect,
  onClose,
}: {
  selectedIds: number[]
  onSelect: (drug: Drug) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const search = useDebounce(q)
  const query = useQuery({
    queryKey: ['drugs', 'picker', search],
    queryFn: () => api.get<Page<Drug>>('/drugs', { q: search, active_only: true, page_size: 100 }),
  })
  return (
    <Modal
      title="选择处方药品"
      description="选择药品后，请填写医嘱用量及频次"
      onClose={onClose}
      wide
    >
      <SearchInput value={q} onChange={setQ} placeholder="搜索药品通用名、商品名或编码…" />
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        <div className="drug-picker-list">
          {query.data?.items.map((drug) => (
            <button
              key={drug.id}
              className="drug-picker-item"
              disabled={selectedIds.includes(drug.id) || drug.available_stock <= 0}
              onClick={() => onSelect(drug)}
            >
              <span className="drug-picker-icon">
                <Plus size={18} />
              </span>
              <div>
                <strong>
                  {drug.generic_name}
                  <small>{drug.trade_name}</small>
                </strong>
                <p>
                  {drug.specification} · {drug.dosage_form}
                </p>
              </div>
              <div>
                <strong>{money(drug.price_cents)}</strong>
                <small>
                  {selectedIds.includes(drug.id)
                    ? '已添加'
                    : `可用 ${drug.available_stock} ${drug.unit}`}
                </small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
          {!query.data?.items.length && (
            <EmptyState title="暂无匹配的药品" description="请调整关键词后重试。" />
          )}
        </div>
      </DataState>
      <div className="page-hint">
        <Search size={14} />
        只显示已启用药品，可用库存扣除了已收费处方预留。
      </div>
    </Modal>
  )
}
