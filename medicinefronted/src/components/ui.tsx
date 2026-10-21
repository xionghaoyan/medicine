import { useEffect, useId, useRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Inbox,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react'

export function Brand({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''}`}>
      <div className="brand-mark">
        <span />
        <i />
      </div>
      {!compact && (
        <div>
          <strong>青禾医疗</strong>
          <small>QINGHE MEDICAL</small>
        </div>
      )}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  size = 'normal',
  loading,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'normal' | 'small'
  loading?: boolean
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      className={`button button-${variant} button-${size} ${className}`}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

const statuses: Record<string, [string, string]> = {
  waiting: ['待就诊', 'amber'],
  in_progress: ['就诊中', 'blue'],
  completed: ['已完成', 'green'],
  cancelled: ['已取消', 'gray'],
  unpaid: ['待收费', 'amber'],
  paid: ['待发药', 'blue'],
  dispensed: ['已发药', 'green'],
  refunded: ['已退费', 'gray'],
  voided: ['已作废', 'gray'],
  active: ['启用中', 'green'],
  inactive: ['已停用', 'gray'],
  low: ['库存偏低', 'amber'],
  normal: ['库存充足', 'green'],
}
export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={`badge badge-${tone}`}>
      <i />
      {children}
    </span>
  )
}
export function StatusBadge({ status }: { status: string }) {
  const info = statuses[status] || [status, 'gray']
  return <Badge tone={info[1]}>{info[0]}</Badge>
}
export function Avatar({
  name,
  color,
  small = false,
}: {
  name: string
  color?: string
  small?: boolean
}) {
  const colors = ['#e7eee7', '#e8edf4', '#f3e9df', '#eae6f1']
  return (
    <span
      className={`avatar ${small ? 'avatar-small' : ''}`}
      style={{ background: color || colors[(name.charCodeAt(0) || 0) % colors.length] }}
    >
      {name.slice(-2, -1) || name[0]}
    </span>
  )
}
export function Identity({ name, sub, color }: { name: string; sub?: string; color?: string }) {
  return (
    <div className="identity">
      <Avatar name={name} color={color} />
      <span>
        <strong>{name}</strong>
        {sub && <small>{sub}</small>}
      </span>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = '搜索姓名、编号…',
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`search-input ${className}`}>
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button className="icon-button" aria-label="清空搜索" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function Tabs({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; count?: number }[]
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((option) => (
        <button
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
          key={option.value}
        >
          {option.label}
          {option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Loading({ label = '正在加载数据…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={25} className="spin" />
      <p>{label}</p>
      <div className="loading-lines">
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}
export function EmptyState({
  title = '暂无相关记录',
  description = '调整筛选条件，或新增一条记录开始使用。',
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span>
        <Inbox size={30} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <CircleAlert size={28} />
      <h3>数据暂时未能加载</h3>
      <p>{error.message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          重新加载
        </Button>
      )}
    </div>
  )
}
export function DataState({
  pending,
  error,
  onRetry,
  children,
}: {
  pending: boolean
  error: Error | null
  onRetry?: () => void
  children: ReactNode
}) {
  if (pending) return <Loading />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  return children
}

export interface Column<T> {
  key: string
  title: string
  render: (item: T) => ReactNode
  className?: string
}
export function DataTable<T extends { id: number | string }>({
  columns,
  items,
  emptyTitle,
  emptyDescription,
  compact = false,
}: {
  columns: Column<T>[]
  items: T[]
  emptyTitle?: string
  emptyDescription?: string
  compact?: boolean
}) {
  if (!items.length) return <EmptyState title={emptyTitle} description={emptyDescription} />
  return (
    <div className={`table-scroll ${compact ? 'table-compact' : ''}`}>
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th className={col.className} key={col.key}>
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {columns.map((col) => (
                <td className={col.className} key={col.key}>
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({
  page,
  total,
  pageSize = 20,
  onChange,
}: {
  page: number
  total: number
  pageSize?: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pagination">
      <span>
        共 <b>{total}</b> 条记录
        {total > 0 &&
          `，当前 ${Math.min((page - 1) * pageSize + 1, total)}–${Math.min(page * pageSize, total)} 条`}
      </span>
      <div>
        <button
          className="icon-button bordered"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          <b>{page}</b> / {pages}
        </span>
        <button
          className="icon-button bordered"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  )
}

export function Modal({
  title,
  description,
  children,
  footer,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  wide?: boolean
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )
  const headingId = useId()
  useEffect(() => {
    const dialog = ref.current
    const trigger = returnFocus.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="modal-inner">
        <header>
          <div>
            <h2 id={headingId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" aria-label="关闭弹窗" onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </dialog>
  )
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel = '确认操作',
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  title: string
  children: ReactNode
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-copy">{children}</div>
    </Modal>
  )
}

export function Field({
  label,
  required,
  hint,
  children,
  className = '',
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`field ${className}`}>
      <span>
        {label}
        {required && <i>*</i>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'warning' | 'success'
}) {
  return (
    <div className={`notice notice-${tone}`}>
      <CircleAlert size={17} />
      <div>{children}</div>
    </div>
  )
}
export function StatCard({
  label,
  value,
  unit,
  sub,
  icon,
  tone = 'green',
}: {
  label: string
  value: ReactNode
  unit?: string
  sub: ReactNode
  icon: ReactNode
  tone?: string
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-heading">
        <span>{label}</span>
        <i>{icon}</i>
      </div>
      <div className="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="stat-sub">{sub}</div>
    </article>
  )
}
export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
export function TextLink({
  children,
  onClick,
  back = false,
}: {
  children: ReactNode
  onClick: () => void
  back?: boolean
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {back && <ArrowLeft size={15} />}
      {children}
      {!back && <ArrowRight size={15} />}
    </button>
  )
}
