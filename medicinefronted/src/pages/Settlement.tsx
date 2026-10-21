import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Banknote,
  Check,
  CircleCheck,
  CreditCard,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Wallet,
} from 'lucide-react'
import { api } from '../api/client'
import type { Dashboard, Page, Prescription, PrescriptionSummary } from '../api/types'
import { businessDate, dateTime, money } from '../lib/format'
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
  StatCard,
  StatusBadge,
  Tabs,
} from '../components/ui'
import { PrescriptionContent, PrescriptionModal } from '../components/PrescriptionDetail'

type Mode = 'billing' | 'pharmacy'
type Operation = 'charge' | 'refund' | 'dispense'
export function Settlement({ mode }: { mode: Mode }) {
  const pharmacy = mode === 'pharmacy'
  const [status, setStatus] = useState(pharmacy ? 'paid' : 'unpaid')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [operation, setOperation] = useState<{ id: number; type: Operation } | null>(null)
  const search = useDebounce(q)
  const query = useQuery({
    queryKey: ['prescriptions', mode, status, search, page],
    queryFn: () =>
      api.get<Page<PrescriptionSummary>>('/prescriptions', { status, q: search, page }),
  })
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
  })
  const stats = dashboard.data?.stats
  return (
    <div>
      <PageHeader
        eyebrow={pharmacy ? 'PHARMACY WORKSPACE' : 'BILLING & SETTLEMENT'}
        title={pharmacy ? '药房发药' : '收费结算'}
        description={
          pharmacy
            ? '仔细核对每一张处方，让用药交付更安心。'
            : '费用清晰，结算有序，每笔收支都可追溯。'
        }
        actions={
          <Button variant="secondary" onClick={() => query.refetch()}>
            <RefreshCw size={16} />
            刷新列表
          </Button>
        }
      />
      <div className="stats-grid three-stats">
        <StatCard
          label={pharmacy ? '待发药处方' : '待收费处方'}
          value={pharmacy ? (stats?.pending_dispense ?? '—') : (stats?.unpaid ?? '—')}
          unit="张"
          icon={pharmacy ? <PackageCheck size={20} /> : <Wallet size={20} />}
          sub={pharmacy ? '已缴费并完成库存预留' : '等待核对并确认线下收款'}
        />
        <StatCard
          label={pharmacy ? '低库存提醒' : '今日净收入'}
          value={pharmacy ? (stats?.low_stock ?? '—') : money(stats?.today_revenue_cents)}
          unit={pharmacy ? '种' : undefined}
          icon={pharmacy ? <ScanLine size={20} /> : <Banknote size={20} />}
          tone="amber"
          sub={pharmacy ? '低于药品档案设定的安全库存' : '当日收款减去当日退费'}
        />
        <StatCard
          label="今日完成就诊"
          value={stats?.completed ?? '—'}
          unit="人"
          icon={<CircleCheck size={20} />}
          tone="blue"
          sub="诊疗与药品交付已完成"
        />
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <Tabs
            value={status}
            onChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
            options={
              pharmacy
                ? [
                    { value: 'paid', label: '待发药' },
                    { value: 'dispensed', label: '已发药' },
                    { value: '', label: '全部记录' },
                  ]
                : [
                    { value: 'unpaid', label: '待收费' },
                    { value: 'paid', label: '已缴费' },
                    { value: 'dispensed', label: '已发药' },
                    { value: 'refunded', label: '已退费' },
                    { value: '', label: '全部处方' },
                  ]
            }
          />
          <SearchInput
            value={q}
            onChange={(value) => {
              setQ(value)
              setPage(1)
            }}
            placeholder="搜索患者姓名、处方编号…"
          />
        </div>
        <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
          <DataTable<PrescriptionSummary>
            items={query.data?.items || []}
            emptyTitle={pharmacy ? '暂无待处理处方' : '暂无相关收费记录'}
            emptyDescription={
              pharmacy ? '收费完成后，处方会自动流转到这里。' : '医生开具处方后，可在此核对并收款。'
            }
            columns={[
              {
                key: 'patient',
                title: '患者',
                render: (item) => <Identity name={item.patient_name} sub={item.patient_no} />,
              },
              {
                key: 'rx',
                title: '处方信息',
                render: (item) => (
                  <div className="cell-lines">
                    <strong className="mono">{item.prescription_no}</strong>
                    <small>{dateTime(item.created_at)}</small>
                  </div>
                ),
              },
              {
                key: 'doctor',
                title: '开方科室',
                render: (item) => (
                  <div className="cell-lines">
                    <strong>{item.department_name}</strong>
                    <small>{item.doctor_name} 医生</small>
                  </div>
                ),
              },
              { key: 'diagnosis', title: '临床诊断', render: (item) => item.diagnosis },
              {
                key: 'amount',
                title: '处方金额',
                className: 'text-right',
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
                className: 'text-right',
                render: (item) => (
                  <div className="row-actions">
                    <Button size="small" variant="ghost" onClick={() => setDetailId(item.id)}>
                      明细
                      <ArrowUpRight size={13} />
                    </Button>
                    {pharmacy && item.status === 'paid' && (
                      <Button
                        size="small"
                        onClick={() => setOperation({ id: item.id, type: 'dispense' })}
                      >
                        核对发药
                      </Button>
                    )}
                    {!pharmacy && item.status === 'unpaid' && (
                      <Button
                        size="small"
                        onClick={() => setOperation({ id: item.id, type: 'charge' })}
                      >
                        确认收款
                      </Button>
                    )}
                    {!pharmacy && item.status === 'paid' && (
                      <Button
                        size="small"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setOperation({ id: item.id, type: 'refund' })}
                      >
                        退费
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
        <Check size={14} />
        {pharmacy
          ? '发药时按预留批次出库，已过期批次会被拦截，重复确认不会重复扣减。'
          : '本工作区记录线下收款结果；已收费未发药的处方可退费，已发药的处方不支持直接退费。'}
      </div>
      {detailId && <PrescriptionModal id={detailId} onClose={() => setDetailId(null)} />}
      {operation && (
        <SettlementModal
          id={operation.id}
          operation={operation.type}
          onClose={() => setOperation(null)}
        />
      )}
    </div>
  )
}

function SettlementModal({
  id,
  operation,
  onClose,
}: {
  id: number
  operation: Operation
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: ['prescription', id],
    queryFn: () => api.get<Prescription>(`/prescriptions/${id}`),
  })
  const [payment, setPayment] = useState('wechat')
  const [confirmed, setConfirmed] = useState(false)
  const [reason, setReason] = useState('')
  const title =
    operation === 'charge'
      ? '核对处方并确认收款'
      : operation === 'refund'
        ? '处方退费'
        : '处方核对与发药'
  const message =
    operation === 'charge'
      ? '收款已确认，药品已预留'
      : operation === 'refund'
        ? '退费已记录，预留库存已释放'
        : '发药完成，库存已更新'
  const action = useAction(
    () =>
      api.post(
        `/prescriptions/${id}/${operation}`,
        operation === 'charge'
          ? { payment_method: payment }
          : operation === 'refund'
            ? { reason }
            : undefined,
      ),
    message,
  )
  const expired = query.data?.reservations.some(
    (item) => item.status === 'reserved' && item.expires_at < businessDate(),
  )
  const canSubmit =
    !!query.data &&
    (operation === 'refund' ? reason.trim().length >= 2 : confirmed) &&
    !(operation === 'dispense' && expired)
  return (
    <Modal
      title={title}
      wide
      busy={action.isPending}
      onClose={onClose}
      footer={
        <>
          <div className="modal-footer-summary">
            <span>{operation === 'refund' ? '本次退费' : '处方金额'}</span>
            <strong>{money(query.data?.total_amount_cents)}</strong>
          </div>
          <Button variant="secondary" onClick={onClose} disabled={action.isPending}>
            取消
          </Button>
          <Button
            variant={operation === 'refund' ? 'danger' : 'primary'}
            loading={action.isPending}
            disabled={!canSubmit}
            onClick={() => action.mutate(undefined, { onSuccess: onClose })}
          >
            {operation === 'charge'
              ? '确认已收款'
              : operation === 'refund'
                ? '确认退费'
                : '确认发药'}
          </Button>
        </>
      }
    >
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {query.data && <PrescriptionContent prescription={query.data} />}
      </DataState>
      {query.data && (
        <div className="settlement-confirmation">
          {operation === 'charge' && (
            <>
              <h3>线下收款方式</h3>
              <div className="payment-options">
                {[
                  { value: 'wechat', label: '微信', icon: ScanLine },
                  { value: 'alipay', label: '支付宝', icon: Wallet },
                  { value: 'cash', label: '现金', icon: Banknote },
                  { value: 'card', label: '银行卡', icon: CreditCard },
                ].map((item) => (
                  <button
                    type="button"
                    className={payment === item.value ? 'selected' : ''}
                    key={item.value}
                    onClick={() => setPayment(item.value)}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                    {payment === item.value && <Check size={12} />}
                  </button>
                ))}
              </div>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                我已核对金额，并确认收到线下款项
              </label>
            </>
          )}
          {operation === 'refund' && (
            <>
              <Notice tone="warning">
                仅记录线下退费结果，并释放药品预留。请先完成实际退款，再确认此操作。
              </Notice>
              <Field label="退费原因" required>
                <textarea
                  rows={3}
                  maxLength={200}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="请写明退费原因，至少 2 个字"
                />
              </Field>
            </>
          )}
          {operation === 'dispense' && (
            <>
              <h3>
                预留批次核对 <Badge tone="gray">{query.data.reservations.length} 个批次</Badge>
              </h3>
              <div className="batch-check-list">
                {query.data.reservations.map((batch) => (
                  <div key={batch.id}>
                    <div>
                      <strong>{batch.drug_name}</strong>
                      <small>批号 {batch.batch_no}</small>
                    </div>
                    <span>
                      数量 <b>{batch.quantity}</b>
                    </span>
                    <span className={batch.expires_at < businessDate() ? 'text-danger' : 'muted'}>
                      有效期 {batch.expires_at}
                    </span>
                  </div>
                ))}
              </div>
              {expired && (
                <Notice tone="warning">存在已过期预留批次，请联系收费台退费后重新处理。</Notice>
              )}
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                已核对患者身份、药品明细、数量与有效期
              </label>
            </>
          )}
        </div>
      )}
      {action.error && <Notice tone="warning">{action.error.message}</Notice>}
    </Modal>
  )
}
