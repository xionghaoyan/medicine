import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Check, LockKeyhole, Plus, ShieldCheck, Users } from 'lucide-react'
import { api } from '../api/client'
import type { Doctor, HospitalSettings, Role, User } from '../api/types'
import { roleNames } from '../lib/format'
import { useAction } from '../lib/hooks'
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
  SectionHeading,
  StatusBadge,
  Tabs,
} from '../components/ui'

export function Settings() {
  const [tab, setTab] = useState('hospital')
  const [form, setForm] = useState<User | null | undefined>()
  const [toggle, setToggle] = useState<User | null>(null)
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<HospitalSettings>('/settings'),
  })
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
    enabled: tab === 'users',
  })
  const change = useAction(
    (user: User) => api.patch(`/users/${user.id}`, { active: !user.active }),
    '账户状态已更新',
  )
  return (
    <div>
      <PageHeader
        eyebrow="WORKSPACE SETTINGS"
        title="系统设置"
        description="管理机构信息与团队权限，保持协作空间清晰有序。"
      />
      <div className="workspace-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'hospital', label: '机构信息' },
            { value: 'users', label: '账户与权限' },
          ]}
        />
        <span>
          <ShieldCheck size={14} />
          仅管理员可维护
        </span>
      </div>
      {tab === 'hospital' ? (
        <DataState
          pending={settings.isPending}
          error={settings.error}
          onRetry={() => settings.refetch()}
        >
          {settings.data && (
            <HospitalForm key={JSON.stringify(settings.data)} initial={settings.data} />
          )}
        </DataState>
      ) : (
        <section className="panel">
          <div className="table-toolbar">
            <div className="toolbar-title">
              <Users size={18} />
              <h2>团队账户</h2>
              <span className="count-pill">{users.data?.length || 0}</span>
            </div>
            <Button onClick={() => setForm(null)}>
              <Plus size={16} />
              新建账户
            </Button>
          </div>
          <DataState pending={users.isPending} error={users.error} onRetry={() => users.refetch()}>
            <DataTable<User>
              items={users.data || []}
              columns={[
                {
                  key: 'name',
                  title: '团队成员',
                  render: (item) => <Identity name={item.display_name} sub={item.username} />,
                },
                {
                  key: 'role',
                  title: '角色',
                  render: (item) => (
                    <Badge tone={item.role === 'admin' ? 'purple' : 'green'}>
                      {roleNames[item.role]}
                    </Badge>
                  ),
                },
                {
                  key: 'doctor',
                  title: '关联医生',
                  render: (item) => <span className="muted">{item.doctor_name || '—'}</span>,
                },
                {
                  key: 'active',
                  title: '账户状态',
                  render: (item) => <StatusBadge status={item.active ? 'active' : 'inactive'} />,
                },
                {
                  key: 'actions',
                  title: '操作',
                  className: 'text-right',
                  render: (item) => (
                    <div className="row-actions">
                      <Button size="small" variant="ghost" onClick={() => setForm(item)}>
                        编辑账户
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        className={item.active ? 'text-danger' : ''}
                        onClick={() => setToggle(item)}
                      >
                        {item.active ? '停用' : '启用'}
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </DataState>
        </section>
      )}
      {form !== undefined && <UserForm user={form} onClose={() => setForm(undefined)} />}
      {toggle && (
        <ConfirmDialog
          title={`${toggle.active ? '停用' : '启用'}此账户？`}
          confirmLabel={toggle.active ? '确认停用' : '确认启用'}
          danger={!!toggle.active}
          loading={change.isPending}
          onClose={() => setToggle(null)}
          onConfirm={() => change.mutate(toggle, { onSuccess: () => setToggle(null) })}
        >
          <p>
            {toggle.active
              ? '停用后，此账户的当前会话将立即失效，且无法再次登录。'
              : '启用后，此账户可以按所分配的角色重新登录。'}
          </p>
          <div className="confirm-identity">
            <Identity name={toggle.display_name} sub={toggle.username} />
          </div>
          {change.error && <Notice tone="warning">{change.error.message}</Notice>}
        </ConfirmDialog>
      )}
    </div>
  )
}

function HospitalForm({ initial }: { initial: HospitalSettings }) {
  const [form, setForm] = useState(initial)
  const action = useAction(() => api.put<HospitalSettings>('/settings', form), '机构信息已保存')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    action.mutate(undefined)
  }
  return (
    <div className="settings-layout">
      <section className="panel settings-form-panel">
        <SectionHeading title="基本信息" subtitle="此信息将显示在登录页与工作空间中" />
        <form onSubmit={submit}>
          <div className="institution-identity">
            <div className="institution-logo">
              <Building2 size={30} strokeWidth={1.4} />
            </div>
            <div>
              <strong>{initial.hospital_name}</strong>
              <small>门诊医疗服务机构</small>
            </div>
          </div>
          <Field label="机构名称" required>
            <input
              required
              minLength={2}
              maxLength={60}
              value={form.hospital_name}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, hospital_name: event.target.value }))
              }
            />
          </Field>
          <Field label="联系电话">
            <input
              maxLength={30}
              value={form.phone}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, phone: event.target.value }))
              }
            />
          </Field>
          <Field label="机构地址">
            <textarea
              rows={3}
              maxLength={200}
              value={form.address}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, address: event.target.value }))
              }
            />
          </Field>
          {action.error && <Notice tone="warning">{action.error.message}</Notice>}
          <div className="settings-form-footer">
            <Button type="submit" loading={action.isPending}>
              <Check size={16} />
              保存修改
            </Button>
            <small>修改将同步到整个工作空间</small>
          </div>
        </form>
      </section>
      <aside className="settings-aside">
        <div className="settings-info-card">
          <ShieldCheck size={27} strokeWidth={1.4} />
          <h3>各司其职，协作有序</h3>
          <p>角色决定可访问的工作区和业务操作。</p>
          <ul>
            <li>
              <strong>管理员</strong>
              <span>业务管理、账户与机构设置</span>
            </li>
            <li>
              <strong>门诊医生</strong>
              <span>本人患者接诊、诊断与处方</span>
            </li>
            <li>
              <strong>收费员</strong>
              <span>建档挂号、线下收费与退费</span>
            </li>
            <li>
              <strong>药师</strong>
              <span>库存入库、处方核对与发药</span>
            </li>
          </ul>
        </div>
        <div className="settings-security-note">
          <LockKeyhole size={19} />
          <div>
            <strong>关键操作全程留痕</strong>
            <p>账户变更与机构信息修改均记录在操作日志中。</p>
          </div>
        </div>
      </aside>
    </div>
  )
}

function UserForm({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [username, setUsername] = useState(user?.username || '')
  const [name, setName] = useState(user?.display_name || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(user?.role || 'cashier')
  const [doctor, setDoctor] = useState(user?.doctor_id || 0)
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => api.get<Doctor[]>('/doctors') })
  const action = useAction(
    () => {
      const payload = {
        display_name: name,
        role,
        doctor_id: role === 'doctor' ? doctor : null,
        ...(password ? { password } : {}),
      }
      return user
        ? api.patch(`/users/${user.id}`, payload)
        : api.post('/users', { ...payload, username, password })
    },
    user ? '账户已更新' : '新账户已创建',
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    action.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Modal
      title={user ? '编辑团队账户' : '新建团队账户'}
      description="为成员分配与职责相符的最小权限"
      onClose={onClose}
      busy={action.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="user-form" loading={action.isPending}>
            保存账户
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="form-grid">
        <Field label="登录账号" required>
          <input
            required
            disabled={!!user}
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_.\-]+"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="字母、数字或下划线"
          />
        </Field>
        <Field label="成员姓名" required>
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="工作角色" required className="full-width">
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {Object.entries(roleNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {role === 'doctor' && (
          <Field label="关联医生档案" required className="full-width">
            <select
              required
              value={doctor || ''}
              onChange={(event) => setDoctor(Number(event.target.value))}
            >
              <option value="">请选择医生档案</option>
              {doctors.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.department_name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label={user ? '重置密码' : '初始密码'}
          required={!user}
          className="full-width"
          hint={
            user
              ? '留空则保留原密码。修改密码或角色后，现有会话将退出。'
              : '至少 10 位字符，请使用字母与数字组合。'
          }
        >
          <input
            type="password"
            autoComplete="new-password"
            required={!user}
            minLength={10}
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={user ? '留空则不修改' : '请输入初始密码'}
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
