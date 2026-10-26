import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Bell,
  Building2,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Command,
  LayoutGrid,
  LogOut,
  Menu,
  Pill,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Dashboard, Meta, Role, SearchResult } from '../api/types'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { roleNames } from '../lib/format'
import { useDebounce } from '../lib/hooks'
import { Avatar, Brand, Button, DataState, EmptyState, Modal } from './ui'

type LinkItem = { path: string; label: string; roles: Role[] }
type NavGroup = { label: string; icon: LucideIcon; links: LinkItem[] }
const all: Role[] = ['admin', 'doctor', 'cashier', 'pharmacist']
const groups: NavGroup[] = [
  { label: '工作台', icon: LayoutGrid, links: [{ path: '/', label: '工作台', roles: all }] },
  {
    label: '门诊服务',
    icon: Stethoscope,
    links: [
      { path: '/registrations', label: '门诊挂号', roles: ['admin', 'cashier'] },
      { path: '/patients', label: '患者档案', roles: ['admin', 'doctor', 'cashier'] },
      { path: '/consultations', label: '医生工作站', roles: ['admin', 'doctor'] },
      { path: '/schedules', label: '医生排班', roles: all },
      { path: '/billing', label: '收费结算', roles: ['admin', 'cashier'] },
    ],
  },
  {
    label: '药房中心',
    icon: Pill,
    links: [
      { path: '/pharmacy', label: '药房发药', roles: ['admin', 'pharmacist'] },
      { path: '/inventory', label: '药品库存', roles: ['admin', 'pharmacist'] },
    ],
  },
  {
    label: '运营管理',
    icon: ChartNoAxesCombined,
    links: [
      { path: '/reports', label: '统计报表', roles: ['admin', 'cashier'] },
      { path: '/audit', label: '操作日志', roles: ['admin'] },
      { path: '/settings', label: '系统设置', roles: ['admin'] },
    ],
  },
]

export function Layout() {
  const { user, logout } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
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
  useEffect(() => {
    setMenu(false)
    const active = groups
      .flatMap((group) => group.links)
      .find((link) => link.path === location.pathname)
    document.title = (active?.label || '工作空间') + ' · dudu 医疗'
    window.scrollTo({ top: 0 })
  }, [location.pathname])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') setMenu(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  if (!user) return null
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => link.roles.includes(user.role)),
    }))
    .filter((group) => group.links.length)
  const activeGroup =
    visibleGroups.find((group) => group.links.some((link) => link.path === location.pathname)) ||
    visibleGroups[0]
  const homeLinks = visibleGroups
    .flatMap((group) => group.links)
    .filter((link) =>
      [
        '/',
        '/patients',
        '/registrations',
        '/consultations',
        '/billing',
        '/pharmacy',
        '/inventory',
      ].includes(link.path),
    )
  const links = activeGroup.label === '工作台' ? homeLinks : activeGroup.links
  const alerts = dashboard.data?.alerts || []
  const signOut = async () => {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/')
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setLoggingOut(false)
    }
  }
  return (
    <div className="dudu-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="dudu-header">
        <div className="header-inner">
          <NavLink to="/" className="brand-link" aria-label="dudu 医疗工作台">
            <Brand />
          </NavLink>
          <span className="brand-separator" />
          <nav className="primary-nav" aria-label="主导航">
            {visibleGroups.map((group) => (
              <button
                key={group.label}
                className={activeGroup.label === group.label ? 'active' : ''}
                onClick={() => navigate(group.links[0].path)}
                aria-current={activeGroup.label === group.label ? 'true' : undefined}
              >
                <group.icon size={18} strokeWidth={1.8} />
                {group.label}
              </button>
            ))}
          </nav>
          <div className="header-tools">
            <button
              className="global-search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="搜索患者或药品"
            >
              <Search size={17} />
              <span>搜索</span>
              <kbd>
                <Command size={11} /> K
              </kbd>
            </button>
            <button
              className="icon-button help-trigger"
              onClick={() => setHelpOpen(true)}
              aria-label="使用帮助"
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-button notification-button"
              onClick={() => setNoticeOpen(true)}
              aria-label="消息与待办"
            >
              <Bell size={19} />
              {alerts.length > 0 && <i />}
            </button>
            <div className="header-user">
              <Avatar name={user.display_name} small />
              <div>
                <strong>{user.display_name}</strong>
                <small>{roleNames[user.role]}</small>
              </div>
            </div>
            <button
              className="icon-button logout-button"
              onClick={signOut}
              disabled={loggingOut}
              aria-label="安全退出"
              title="安全退出"
            >
              <LogOut size={18} />
            </button>
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? '收起导航' : '展开导航'}
              aria-expanded={menu}
            >
              {menu ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="mobile-nav" aria-label="移动导航">
            {visibleGroups.map((group) => (
              <div key={group.label}>
                <p>{group.label}</p>
                {group.links.map((link) => (
                  <NavLink key={link.path} to={link.path} end>
                    {link.label}
                    <ChevronRight size={15} />
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        )}
      </header>
      <div className="subnav-shell">
        <div className="subnav-inner">
          <nav className="secondary-nav" aria-label="业务导航">
            {links.map((link) => (
              <NavLink key={link.path} to={link.path} end>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="facility">
            <Building2 size={14} />
            <span>{meta.data?.hospital_name || '嘟嘟社区医疗中心'}</span>
            <span className="demo-tag">演示空间</span>
          </div>
        </div>
      </div>
      <main id="main-content" className="workspace">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>
          <strong>dudu</strong> 医疗 · 让诊疗回归简单
        </span>
        <span className="footer-status">
          <i className={health.data?.status === 'ok' ? 'online' : ''} />
          {health.isPending
            ? '正在连接服务'
            : health.data?.status === 'ok'
              ? '服务连接正常'
              : '服务暂未连接'}
          <span className="footer-dot">·</span>仅使用虚构演示数据
        </span>
      </footer>
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {noticeOpen && (
        <Modal
          title="消息与待办"
          description="当前工作空间中需要关注的事项"
          onClose={() => setNoticeOpen(false)}
        >
          <DataState
            pending={dashboard.isPending}
            error={dashboard.error}
            onRetry={() => dashboard.refetch()}
          >
            {alerts.length ? (
              <div className="notification-list">
                {alerts.map((alert) => (
                  <button
                    key={alert.id}
                    onClick={() => {
                      setNoticeOpen(false)
                      navigate(alert.path)
                    }}
                  >
                    <span className={'alert-dot ' + alert.type} />
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.description}</p>
                    </div>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="暂时没有待处理提醒"
                description="新的库存和业务提醒会出现在这里。"
              />
            )}
          </DataState>
        </Modal>
      )}
      {helpOpen && (
        <Modal
          title="一起完成一次门诊"
          description="各角色在同一个工作空间中协作"
          onClose={() => setHelpOpen(false)}
          footer={<Button onClick={() => setHelpOpen(false)}>我知道了</Button>}
        >
          <div className="help-steps">
            {[
              ['建档与挂号', '管理员或收费员建立患者档案，选择医生、日期和时段，生成挂号凭证。'],
              ['接诊与开方', '医生在候诊队列接诊，核对过敏信息，填写主诉、诊断与处方。'],
              ['确认收款', '收费员核对药品明细和应收金额，记录线下收款方式。'],
              ['核对并发药', '药师核对患者、药品和批次，确认后扣减实际库存，完成就诊。'],
            ].map(([title, description], index) => (
              <div key={title}>
                <span>{'0' + (index + 1)}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="help-note">
            <ShieldCheck size={19} />
            <p>尚未发药的处方可由收费员退费；管理员可以在操作日志中追溯挂号、收款和发药记录。</p>
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
    queryKey: ['global-search', debounced],
    queryFn: () => api.get<SearchResult[]>('/search', { q: debounced }),
    enabled: debounced.trim().length > 0,
  })
  return (
    <Modal title="搜索工作空间" description="按姓名、编号或药品名称查找" onClose={onClose}>
      <div className="command-search">
        <Search size={22} />
        <input
          autoFocus
          aria-label="全局搜索"
          placeholder="搜索患者、药品…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      {debounced.trim() ? (
        <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
          {query.data?.length ? (
            <div className="search-results">
              {query.data.map((result) => (
                <button
                  key={result.type + result.id}
                  onClick={() => {
                    navigate(result.path + '?q=' + encodeURIComponent(result.query))
                    onClose()
                  }}
                >
                  <span className="search-result-icon">
                    {result.type === 'patient' ? <Users size={20} /> : <Pill size={20} />}
                  </span>
                  <span>
                    <strong>{result.title}</strong>
                    <small>{result.subtitle}</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="没有找到匹配记录" description="试试姓名、患者编号或药品通用名。" />
          )}
        </DataState>
      ) : (
        <div className="search-prompt">
          <ClipboardList size={32} />
          <p>从一个名字，找到所需信息</p>
          <small>只显示当前角色有权限查看的记录</small>
        </div>
      )}
    </Modal>
  )
}
