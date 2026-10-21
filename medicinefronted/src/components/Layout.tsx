import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Command,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageOpen,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Dashboard, Meta, Role, SearchResult } from '../api/types'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { roleNames } from '../lib/format'
import { useDebounce } from '../lib/hooks'
import { Avatar, Badge, Brand, Button, DataState, EmptyState, Modal } from './ui'

interface NavItem {
  path: string
  title: string
  icon: LucideIcon
  roles: Role[]
  group: string
}
const everyone: Role[] = ['admin', 'doctor', 'cashier', 'pharmacist']
const navigation: NavItem[] = [
  { path: '/', title: '工作台', icon: LayoutDashboard, roles: everyone, group: '概览' },
  {
    path: '/registrations',
    title: '门诊挂号',
    icon: ClipboardList,
    roles: ['admin', 'cashier'],
    group: '诊疗服务',
  },
  {
    path: '/patients',
    title: '患者档案',
    icon: Users,
    roles: ['admin', 'doctor', 'cashier'],
    group: '诊疗服务',
  },
  {
    path: '/consultations',
    title: '医生工作站',
    icon: Stethoscope,
    roles: ['admin', 'doctor'],
    group: '诊疗服务',
  },
  { path: '/schedules', title: '医生排班', icon: CalendarDays, roles: everyone, group: '诊疗服务' },
  {
    path: '/billing',
    title: '收费结算',
    icon: Wallet,
    roles: ['admin', 'cashier'],
    group: '诊疗服务',
  },
  {
    path: '/pharmacy',
    title: '药房发药',
    icon: HeartPulse,
    roles: ['admin', 'pharmacist'],
    group: '诊疗服务',
  },
  {
    path: '/inventory',
    title: '药品库存',
    icon: PackageOpen,
    roles: ['admin', 'pharmacist'],
    group: '运营管理',
  },
  {
    path: '/reports',
    title: '统计报表',
    icon: ChartNoAxesCombined,
    roles: ['admin', 'cashier'],
    group: '运营管理',
  },
  { path: '/audit', title: '操作日志', icon: ShieldCheck, roles: ['admin'], group: '运营管理' },
  { path: '/settings', title: '系统设置', icon: Settings2, roles: ['admin'], group: '运营管理' },
]

export function Layout() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobile, setMobile] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const [help, setHelp] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/meta') })
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ status: string }>('/health'),
    refetchInterval: 60000,
  })
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
    refetchInterval: 60000,
  })
  const active = navigation.find((item) => item.path === location.pathname)
  useEffect(() => {
    setMobile(false)
    setNotifications(false)
    window.scrollTo({ top: 0 })
    document.title = `${navigation.find((item) => item.path === location.pathname)?.title || '青禾医疗'} · 青禾 HIS`
  }, [location.pathname])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  if (!user) return null
  const items = navigation.filter((item) => item.roles.includes(user.role))
  const alerts = dashboard.data?.alerts || []
  const handleLogout = async () => {
    setLogoutBusy(true)
    try {
      await logout()
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setLogoutBusy(false)
    }
  }
  return (
    <div className="app-shell">
      {mobile && (
        <button className="sidebar-scrim" aria-label="收起导航" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label="收起导航"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-name">
          <span className="workspace-avatar">青</span>
          <div>
            <strong>{meta.data?.hospital_name || '青禾社区医疗中心'}</strong>
            <small>门诊协作空间</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <nav className="main-navigation" aria-label="主导航">
          {['概览', '诊疗服务', '运营管理'].map((group) => (
            <div className="nav-group" key={group}>
              {items.some((item) => item.group === group) && (
                <span className="nav-label">{group}</span>
              )}
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <NavLink
                    end={item.path === '/'}
                    to={item.path}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    key={item.path}
                  >
                    <item.icon size={19} strokeWidth={1.7} />
                    <span>{item.title}</span>
                    {item.path === '/pharmacy' && !!dashboard.data?.stats.pending_dispense && (
                      <small>{dashboard.data.stats.pending_dispense}</small>
                    )}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            <span>使用帮助</span>
            <ArrowUpRight size={15} />
          </button>
          <div className="service-status">
            <i className={health.data ? '' : 'offline'} />
            <span>{health.data ? '系统运行正常' : '正在连接服务'}</span>
            <small>v1.0</small>
          </div>
          <div className="sidebar-user">
            <Avatar name={user.display_name} />
            <div>
              <strong>{user.display_name}</strong>
              <small>{roleNames[user.role]}</small>
            </div>
            <button
              className="icon-button"
              title="安全退出"
              aria-label="安全退出"
              disabled={logoutBusy}
              onClick={handleLogout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="展开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>门诊管理</span>
            <ChevronRight size={14} />
            <strong>{active?.title || '工作台'}</strong>
          </div>
          <div className="topbar-actions">
            <button className="global-search-trigger" onClick={() => setSearchOpen(true)}>
              <Search size={16} />
              <span>{user.role === 'pharmacist' ? '搜索药品、编号…' : '搜索患者、编号…'}</span>
              <kbd>
                <Command size={11} /> K
              </kbd>
            </button>
            <span className="topbar-divider" />
            <div className="notification-anchor">
              <button
                className={`icon-button notification-button ${notifications ? 'selected' : ''}`}
                aria-label="通知中心"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={20} />
                {alerts.length > 0 && <i />}
              </button>
              {notifications && (
                <div className="notification-popover">
                  <div className="popover-heading">
                    <strong>待办与提醒</strong>
                    <Badge tone="gray">{alerts.length} 项</Badge>
                  </div>
                  {alerts.length ? (
                    alerts.map((alert) => (
                      <button
                        key={alert.id}
                        onClick={() => {
                          navigate(alert.path)
                          setNotifications(false)
                        }}
                      >
                        <span className={`alert-dot ${alert.type}`} />
                        <div>
                          <strong>{alert.title}</strong>
                          <small>{alert.description}</small>
                        </div>
                        <ChevronRight size={14} />
                      </button>
                    ))
                  ) : (
                    <p className="muted empty-popover">暂无待处理提醒</p>
                  )}
                </div>
              )}
            </div>
            <Avatar name={user.display_name} small />
          </div>
        </header>
        <main className="workspace">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>青禾 HIS · 让诊疗协作更从容</span>
          <span>{meta.data?.demo_mode ? '教学演示环境 · 数据均为虚构' : '门诊信息管理系统'}</span>
        </footer>
      </div>
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {help && (
        <Modal
          title="欢迎使用青禾 HIS"
          description="按业务顺序完成一次门诊诊疗"
          onClose={() => setHelp(false)}
          footer={<Button onClick={() => setHelp(false)}>开始使用</Button>}
        >
          <div className="help-steps">
            {[
              ['01', '建档与挂号', '在患者档案建档，然后选择医生和时段完成挂号。'],
              ['02', '医生接诊', '在医生工作站选择候诊患者，填写诊断与处方。'],
              ['03', '确认收费', '收费员核对明细、确认线下收款，系统预留药品。'],
              ['04', '药房发药', '药师核对处方与有效期，发药后库存自动更新。'],
            ].map(([n, title, copy]) => (
              <div key={n}>
                <span>{n}</span>
                <section>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </section>
              </div>
            ))}
          </div>
          <div className="help-note">
            <ShieldCheck size={18} />
            每位成员使用自己的角色账户，所有关键操作均可在日志中追溯。
          </div>
        </Modal>
      )}
    </div>
  )
}

function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('')
  const debounced = useDebounce(value)
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResult[]>('/search', { q: debounced }),
    enabled: !!debounced,
  })
  return (
    <Modal title="快捷搜索" description="搜索当前角色可访问的档案与业务数据" onClose={onClose}>
      <div className="command-search">
        <Search size={20} />
        <input
          autoFocus
          aria-label="快捷搜索"
          placeholder="输入姓名或编号…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      {debounced ? (
        <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
          {query.data?.length ? (
            <div className="search-results">
              {query.data.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    navigate(`${item.path}?q=${encodeURIComponent(item.query)}`)
                    onClose()
                  }}
                >
                  <Avatar name={item.title} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="没有找到相关记录" description="试试其他姓名、患者编号或药品编号。" />
          )}
        </DataState>
      ) : (
        <div className="search-prompt">
          <Activity size={22} />
          <p>让信息触手可及</p>
          <small>输入关键词，快速找到您需要的记录</small>
        </div>
      )}
    </Modal>
  )
}
