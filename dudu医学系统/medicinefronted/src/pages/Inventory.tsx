import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Boxes,
  Check,
  Download,
  FileSpreadsheet,
  Package,
  PackagePlus,
  Plus,
  Upload,
  X,
} from 'lucide-react'
import { api, download } from '../api/client'
import type { Batch, Drug, DrugInput, ImportResult, Page } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { businessDate, money, shiftDate } from '../lib/format'
import { useAction, useDebounce } from '../lib/hooks'
import {
  Badge,
  Button,
  DataState,
  DataTable,
  Field,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  SearchInput,
  StatusBadge,
  Tabs,
} from '../components/ui'

export function Inventory() {
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const filter = params.get('filter') || ''
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<Drug | null | undefined>()
  const [receive, setReceive] = useState<Drug | null>(null)
  const [batchDrug, setBatchDrug] = useState<Drug | null>(null)
  const [importing, setImporting] = useState(false)
  const search = useDebounce(q)
  const query = useQuery({
    queryKey: ['drugs', search, filter, page],
    queryFn: () =>
      api.get<Page<Drug>>('/drugs', {
        q: search,
        low_stock: filter === 'low',
        expiring: filter === 'expiring',
        page,
      }),
  })
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
    setPage(1)
  }
  return (
    <div>
      <PageHeader
        eyebrow="MEDICATION & INVENTORY"
        title="药品库存"
        description="从药品档案到批次效期，让每一份库存都心中有数。"
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload size={16} />
              批量导入
            </Button>
            {admin && (
              <Button onClick={() => setForm(null)}>
                <Plus size={17} />
                新增药品
              </Button>
            )}
          </>
        }
      />
      <div className="inventory-note">
        <div>
          <Package size={20} />
          <span>按批次管理 · 按效期发药</span>
        </div>
        <span>
          <i className="status-dot" />
          可用库存已扣除收费预留
        </span>
        <span>
          <i className="status-dot amber" />
          提前 30 天提醒临期药品
        </span>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <Tabs
            value={filter}
            onChange={(value) => setFilter('filter', value)}
            options={[
              { value: '', label: '全部药品' },
              { value: 'low', label: '库存预警' },
              { value: 'expiring', label: '效期提醒' },
            ]}
          />
          <SearchInput
            value={q}
            onChange={(value) => setFilter('q', value)}
            placeholder="搜索药品名称、商品名、编码…"
          />
        </div>
        <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
          <DataTable<Drug>
            items={query.data?.items || []}
            columns={[
              {
                key: 'name',
                title: '药品信息',
                render: (drug) => (
                  <div className="drug-identity">
                    <span>
                      <Package size={20} strokeWidth={1.5} />
                    </span>
                    <div>
                      <strong>
                        {drug.generic_name}
                        <small>{drug.trade_name}</small>
                      </strong>
                      <p>
                        {drug.drug_code} · {drug.specification}
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'form',
                title: '剂型 / 医保',
                render: (drug) => (
                  <div className="cell-lines">
                    <strong>{drug.dosage_form}</strong>
                    <small>
                      {drug.insurance_category === 'self'
                        ? '自费'
                        : `${drug.insurance_category === 'A' ? '甲' : '乙'}类医保`}
                    </small>
                  </div>
                ),
              },
              {
                key: 'price',
                title: '单价',
                className: 'text-right',
                render: (drug) => (
                  <div className="cell-lines">
                    <b className="money">{money(drug.price_cents)}</b>
                    <small>每{drug.unit}</small>
                  </div>
                ),
              },
              {
                key: 'stock',
                title: '可用库存',
                className: 'text-right',
                render: (drug) => (
                  <div className="cell-lines">
                    <strong
                      className={
                        drug.available_stock <= drug.stock_threshold ? 'stock-low' : 'stock-number'
                      }
                    >
                      {drug.available_stock}
                      <small> {drug.unit}</small>
                    </strong>
                    <small>
                      预留 {drug.reserved_stock} · 总存 {drug.total_stock}
                    </small>
                  </div>
                ),
              },
              {
                key: 'expiry',
                title: '最近有效期',
                render: (drug) => (
                  <span
                    className={
                      drug.nearest_expiry && drug.nearest_expiry <= shiftDate(businessDate(), 30)
                        ? 'text-amber'
                        : 'muted'
                    }
                  >
                    {drug.nearest_expiry || '暂无批次'}
                  </span>
                ),
              },
              {
                key: 'status',
                title: '库存状态',
                render: (drug) => (
                  <StatusBadge
                    status={
                      !drug.active
                        ? 'inactive'
                        : drug.available_stock <= drug.stock_threshold
                          ? 'low'
                          : 'normal'
                    }
                  />
                ),
              },
              {
                key: 'actions',
                title: '操作',
                className: 'text-right',
                render: (drug) => (
                  <div className="row-actions">
                    <Button size="small" variant="ghost" onClick={() => setBatchDrug(drug)}>
                      批次
                    </Button>
                    {admin && (
                      <Button size="small" variant="ghost" onClick={() => setForm(drug)}>
                        编辑
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={!drug.active}
                      onClick={() => setReceive(drug)}
                    >
                      <PackagePlus size={14} />
                      入库
                    </Button>
                  </div>
                ),
              },
            ]}
          />
          <Pagination total={query.data?.total || 0} page={page} onChange={setPage} />
        </DataState>
      </section>
      <div className="page-hint">
        <Boxes size={14} />
        库存只通过入库和发药业务变动，操作均有流水记录。{!admin && '药品价格由管理员统一维护。'}
      </div>
      {form !== undefined && <DrugForm drug={form} onClose={() => setForm(undefined)} />}
      {receive && <ReceiveForm drug={receive} onClose={() => setReceive(null)} />}
      {batchDrug && <BatchModal drug={batchDrug} onClose={() => setBatchDrug(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  )
}

function DrugForm({ drug, onClose }: { drug: Drug | null; onClose: () => void }) {
  const [form, setForm] = useState<DrugInput>({
    drug_code: drug?.drug_code || '',
    generic_name: drug?.generic_name || '',
    trade_name: drug?.trade_name || '',
    specification: drug?.specification || '',
    dosage_form: drug?.dosage_form || '片剂',
    unit: drug?.unit || '盒',
    price_cents: drug?.price_cents || 0,
    insurance_category: drug?.insurance_category || 'self',
    manufacturer: drug?.manufacturer || '',
    stock_threshold: drug?.stock_threshold ?? 20,
    active: drug ? !!drug.active : true,
  })
  const [price, setPrice] = useState(drug ? (drug.price_cents / 100).toFixed(2) : '')
  const action = useAction(
    () =>
      drug
        ? api.patch(`/drugs/${drug.id}`, { ...form, price_cents: Math.round(Number(price) * 100) })
        : api.post('/drugs', { ...form, price_cents: Math.round(Number(price) * 100) }),
    drug ? '药品档案已更新' : '药品已建档，请按批次入库',
  )
  const set = (key: keyof DrugInput, value: string | number | boolean) =>
    setForm((previous) => ({ ...previous, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    action.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Modal
      title={drug ? '编辑药品档案' : '新增药品档案'}
      description="规范维护药品信息，已有处方保留开方时的价格"
      wide
      onClose={onClose}
      busy={action.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="drug-form" loading={action.isPending}>
            保存药品
          </Button>
        </>
      }
    >
      <form id="drug-form" onSubmit={submit} className="form-grid">
        <Field label="药品编码" required>
          <input
            required
            maxLength={32}
            pattern="[A-Za-z0-9_\-]+"
            value={form.drug_code}
            onChange={(event) => set('drug_code', event.target.value)}
            placeholder="如 MED013"
          />
        </Field>
        <Field label="通用名称" required>
          <input
            required
            maxLength={100}
            value={form.generic_name}
            onChange={(event) => set('generic_name', event.target.value)}
            placeholder="请输入药品通用名"
          />
        </Field>
        <Field label="商品名称">
          <input
            maxLength={100}
            value={form.trade_name}
            onChange={(event) => set('trade_name', event.target.value)}
            placeholder="选填"
          />
        </Field>
        <Field label="规格" required>
          <input
            required
            maxLength={100}
            value={form.specification}
            onChange={(event) => set('specification', event.target.value)}
            placeholder="如 0.25g × 24粒"
          />
        </Field>
        <Field label="剂型" required>
          <select
            value={form.dosage_form}
            onChange={(event) => set('dosage_form', event.target.value)}
          >
            {['片剂', '胶囊剂', '颗粒剂', '口服液', '散剂', '注射剂', '外用制剂', '中药饮片'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </Field>
        <Field label="计量单位" required>
          <select value={form.unit} onChange={(event) => set('unit', event.target.value)}>
            {['盒', '瓶', '袋', '支', '片', '克', '包'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <Field label="零售单价（元）" required>
          <input
            required
            type="number"
            min={0}
            max={100000}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="医保类别">
          <select
            value={form.insurance_category}
            onChange={(event) => set('insurance_category', event.target.value)}
          >
            <option value="A">甲类</option>
            <option value="B">乙类</option>
            <option value="self">自费</option>
          </select>
        </Field>
        <Field label="生产厂商">
          <input
            maxLength={120}
            value={form.manufacturer}
            onChange={(event) => set('manufacturer', event.target.value)}
            placeholder="选填"
          />
        </Field>
        <Field label="库存预警阈值" required>
          <input
            type="number"
            required
            min={0}
            max={100000}
            value={form.stock_threshold}
            onChange={(event) => set('stock_threshold', Number(event.target.value))}
          />
        </Field>
        <label className="checkbox-field full-width">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => set('active', event.target.checked)}
          />
          启用该药品，允许医生选择开方
        </label>
        {action.error && (
          <div className="full-width">
            <Notice tone="warning">{action.error.message}</Notice>
          </div>
        )}
      </form>
    </Modal>
  )
}

function ReceiveForm({ drug, onClose }: { drug: Drug; onClose: () => void }) {
  const [batch, setBatch] = useState('')
  const [quantity, setQuantity] = useState(50)
  const [expiry, setExpiry] = useState(shiftDate(businessDate(), 365))
  const action = useAction(
    () =>
      api.post('/stock/receive', {
        drug_id: drug.id,
        batch_no: batch,
        quantity,
        expires_at: expiry,
      }),
    '药品入库成功',
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    action.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Modal
      title="药品批次入库"
      description={`${drug.generic_name} · ${drug.specification}`}
      onClose={onClose}
      busy={action.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button form="receive-form" type="submit" loading={action.isPending}>
            <PackagePlus size={16} />
            确认入库
          </Button>
        </>
      }
    >
      <form id="receive-form" onSubmit={submit} className="form-grid">
        <Field label="生产批号" required className="full-width">
          <input
            required
            autoFocus
            pattern="[A-Za-z0-9_.\-]+"
            maxLength={50}
            value={batch}
            onChange={(event) => setBatch(event.target.value)}
            placeholder="请输入包装上的生产批号"
          />
        </Field>
        <Field label={`入库数量（${drug.unit}）`} required>
          <input
            required
            type="number"
            min={1}
            max={1000000}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
          />
        </Field>
        <Field label="有效期至" required>
          <input
            required
            type="date"
            min={businessDate()}
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          />
        </Field>
        <div className="full-width">
          <Notice>同一批号可追加数量，有效期必须一致。入库后可用库存自动更新。</Notice>
        </div>
        {action.error && (
          <div className="full-width">
            <Notice tone="warning">{action.error.message}</Notice>
          </div>
        )}
      </form>
    </Modal>
  )
}

function BatchModal({ drug, onClose }: { drug: Drug; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['batches', drug.id],
    queryFn: () => api.get<Batch[]>(`/drugs/${drug.id}/batches`),
  })
  return (
    <Modal
      title="库存批次明细"
      description={`${drug.generic_name} · ${drug.specification}`}
      wide
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          关闭
        </Button>
      }
    >
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        <DataTable<Batch>
          items={query.data || []}
          columns={[
            {
              key: 'batch',
              title: '生产批号',
              render: (item) => <b className="mono">{item.batch_no}</b>,
            },
            {
              key: 'expiry',
              title: '有效期至',
              render: (item) => (
                <span className={item.expires_at < businessDate() ? 'text-danger' : ''}>
                  {item.expires_at}
                </span>
              ),
            },
            { key: 'total', title: '实存数量', render: (item) => `${item.quantity} ${drug.unit}` },
            { key: 'reserved', title: '已预留', render: (item) => item.reserved_quantity },
            {
              key: 'available',
              title: '可用数量',
              render: (item) => (
                <b>{item.expires_at >= businessDate() ? item.available_quantity : 0}</b>
              ),
            },
            {
              key: 'status',
              title: '效期状态',
              render: (item) => (
                <Badge
                  tone={
                    item.expires_at < businessDate()
                      ? 'red'
                      : item.expires_at <= shiftDate(businessDate(), 30)
                        ? 'amber'
                        : 'green'
                  }
                >
                  {item.expires_at < businessDate()
                    ? '已过期'
                    : item.expires_at <= shiftDate(businessDate(), 30)
                      ? '临期'
                      : '正常'}
                </Badge>
              ),
            },
          ]}
        />
      </DataState>
    </Modal>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const action = useAction(async () => {
    const form = new FormData()
    if (file) form.append('file', file)
    return api.post<ImportResult>('/drugs/import', form)
  })
  const set = (value: File | null) => {
    setFile(value)
    setResult(null)
    action.reset()
  }
  return (
    <Modal
      title="药品批量导入"
      description="下载模板、填写药品及批次数据，再上传 CSV 文件"
      onClose={onClose}
      busy={action.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {result ? '完成' : '取消'}
          </Button>
          {!result && (
            <Button
              disabled={!file}
              loading={action.isPending}
              onClick={() => action.mutate(undefined, { onSuccess: (value) => setResult(value) })}
            >
              <Upload size={16} />
              开始导入
            </Button>
          )}
        </>
      }
    >
      <Button
        variant="secondary"
        className="template-download"
        onClick={async () => {
          try {
            await download('/drugs/import-template', '药品导入模板.csv')
          } catch (err) {
            toast((err as Error).message, 'error')
          }
        }}
      >
        <Download size={17} />
        下载 CSV 模板<span>含一行填写示例</span>
      </Button>
      <input
        type="file"
        ref={ref}
        className="sr-only"
        accept=".csv"
        aria-label="选择药品 CSV 文件"
        onChange={(event) => set(event.target.files?.[0] || null)}
      />
      <div
        className={`upload-zone ${file ? 'has-file' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          set(event.dataTransfer.files[0] || null)
        }}
      >
        {file ? (
          <>
            <FileSpreadsheet size={35} />
            <strong>{file.name}</strong>
            <small>{(file.size / 1024).toFixed(1)} KB</small>
            <button
              className="icon-button"
              aria-label="移除文件"
              onClick={() => {
                set(null)
                if (ref.current) ref.current.value = ''
              }}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <Upload size={30} strokeWidth={1.5} />
            <strong>将 CSV 文件拖放到这里</strong>
            <small>UTF-8 或 GB18030，最大 2MB、2000 行</small>
            <Button variant="secondary" size="small" onClick={() => ref.current?.click()}>
              选择文件
            </Button>
          </>
        )}
      </div>
      <Notice>
        合法行独立入库，错误行返回具体原因；相同药品与批号会跳过，不会重复增加库存。价格字段单位为“分”。
      </Notice>
      {result && (
        <div className="import-result">
          <h3>
            <Check size={19} />
            导入处理完成
          </h3>
          <div>
            <span>
              <b>{result.success_count}</b> 成功
            </span>
            <span>
              <b>{result.skipped_count}</b> 跳过
            </span>
            <span>
              <b>{result.failed_count}</b> 失败
            </span>
          </div>
          {result.errors.length > 0 && (
            <ul>
              {result.errors.map((item) => (
                <li key={item.row}>
                  <b>第 {item.row} 行</b>
                  <span>{item.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {action.error && <Notice tone="warning">{action.error.message}</Notice>}
    </Modal>
  )
}
