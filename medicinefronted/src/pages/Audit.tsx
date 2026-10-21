import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { api } from '../api/client'
import type { AuditLog, Page } from '../api/types'
import { actionNames, dateTime, money } from '../lib/format'
import { useDebounce } from '../lib/hooks'
import {
  Badge,
  Button,
  DataState,
  DataTable,
  Identity,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
} from '../components/ui'

const entities: Record<string, string> = {
  user: '账户',
  patient: '患者',
  registration: '挂号单',
  prescription: '处方',
  drug: '药品',
  batch: '库存批次',
  schedule: '排班',
  settings: '机构信息',
  import: '导入记录',
}
const detailLabels: Record<string, string> = {
  prescription_no: '处方编号',
  registration_no: '挂号编号',
  patient_no: '患者编号',
  charge_no: '收费单号',
  dispense_no: '发药单号',
  amount_cents: '金额',
  payment_method: '付款方式',
  reason: '原因',
  quantity: '数量',
  batch_no: '生产批号',
  drug_name: '药品名称',
  item_count: '药品种数',
  old_price_cents: '原单价',
  new_price_cents: '新单价',
  price_cents: '单价',
  name: '药品名称',
  fields: '变更字段',
  username: '账户名',
  role: '角色',
  password_changed: '已更新密码',
  total_slots: '总号源数',
  queue_no: '排队号',
  success_count: '成功行数',
  skipped_count: '跳过行数',
  failed_count: '失败行数',
}
function objectLabel(item: AuditLog) {
  return String(
    item.details.prescription_no ||
      item.details.registration_no ||
      item.details.drug_name ||
      `${entities[item.entity_type] || item.entity_type} #${item.entity_id}`,
  )
}

export function Audit() {
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditLog | null>(null)
  const search = useDebounce(q)
  const query = useQuery({
    queryKey: ['audit', search, action, page],
    queryFn: () => api.get<Page<AuditLog>>('/audit-logs', { q: search, action, page }),
  })
  return (
    <div>
      <PageHeader
        eyebrow="AUDIT TRAIL"
        title="操作日志"
        description="记录每一次关键操作，让业务有据可查。"
      />
      <div className="audit-intro">
        <span>
          <ShieldCheck size={24} />
        </span>
        <div>
          <h3>完整留痕，清晰追溯</h3>
          <p>挂号、开方、收款、发药与账户变更都会自动记录，日志仅供授权管理员查询。</p>
        </div>
        <Badge>审计已启用</Badge>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="toolbar-title">
            <Activity size={18} />
            <h2>操作记录</h2>
            <span className="count-pill">{query.data?.total || 0}</span>
          </div>
          <div className="toolbar-controls">
            <select
              aria-label="筛选操作类型"
              value={action}
              onChange={(event) => {
                setAction(event.target.value)
                setPage(1)
              }}
            >
              <option value="">全部操作类型</option>
              {Object.entries(actionNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <SearchInput
              value={q}
              onChange={(value) => {
                setQ(value)
                setPage(1)
              }}
              placeholder="搜索操作人、业务编号…"
            />
          </div>
        </div>
        <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
          <DataTable<AuditLog>
            items={query.data?.items || []}
            columns={[
              {
                key: 'time',
                title: '操作时间',
                render: (item) => <span className="mono">{dateTime(item.created_at)}</span>,
              },
              {
                key: 'actor',
                title: '操作人员',
                render: (item) => <Identity name={item.actor_name} />,
              },
              {
                key: 'action',
                title: '操作类型',
                render: (item) => (
                  <Badge
                    tone={
                      item.action.includes('refund') ||
                      item.action.includes('cancel') ||
                      item.action.includes('void')
                        ? 'amber'
                        : item.action.includes('auth')
                          ? 'gray'
                          : 'green'
                    }
                  >
                    {actionNames[item.action] || item.action}
                  </Badge>
                ),
              },
              {
                key: 'object',
                title: '业务对象',
                render: (item) => (
                  <div className="cell-lines">
                    <strong className="mono">{objectLabel(item)}</strong>
                    <small>{entities[item.entity_type] || item.entity_type}</small>
                  </div>
                ),
              },
              {
                key: 'source',
                title: '操作来源',
                render: (item) => (
                  <span className="muted mono">{item.ip_address || '本地服务'}</span>
                ),
              },
              {
                key: 'details',
                title: '详情',
                className: 'text-right',
                render: (item) => (
                  <Button size="small" variant="ghost" onClick={() => setSelected(item)}>
                    查看
                    <ArrowUpRight size={14} />
                  </Button>
                ),
              },
            ]}
          />
          <Pagination total={query.data?.total || 0} page={page} onChange={setPage} />
        </DataState>
      </section>
      {selected && (
        <Modal
          title="操作记录详情"
          description={`事件 #${selected.id} · ${actionNames[selected.action] || selected.action}`}
          onClose={() => setSelected(null)}
          footer={
            <Button variant="secondary" onClick={() => setSelected(null)}>
              关闭
            </Button>
          }
        >
          <div className="audit-detail-header">
            <Identity name={selected.actor_name} sub={dateTime(selected.created_at)} />
            <Badge>{entities[selected.entity_type] || selected.entity_type}</Badge>
          </div>
          <dl className="audit-detail-list">
            <div>
              <dt>业务对象</dt>
              <dd>{objectLabel(selected)}</dd>
            </div>
            <div>
              <dt>操作来源</dt>
              <dd>{selected.ip_address}</dd>
            </div>
            {Object.entries(selected.details).map(([key, value]) => (
              <div key={key}>
                <dt>{detailLabels[key] || key}</dt>
                <dd>
                  {key.endsWith('_cents') && typeof value === 'number'
                    ? money(value)
                    : Array.isArray(value)
                      ? value.join('、')
                      : typeof value === 'boolean'
                        ? value
                          ? '是'
                          : '否'
                        : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </div>
  )
}
