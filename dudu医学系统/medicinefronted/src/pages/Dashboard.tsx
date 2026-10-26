import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ClipboardPlus,
  Clock3,
  FileText,
  Layers3,
  PackageCheck,
  PackagePlus,
  Plus,
  Sparkles,
  Stethoscope,
  Users,
  Wallet,
} from 'lucide-react'
import { api } from '../api/client'
import type { Dashboard as DashboardData, Registration } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { actionNames, age, dateTime, genderNames, money, number } from '../lib/format'
import {
  Badge,
  Button,
  DataState,
  DataTable,
  EmptyState,
  Identity,
  SectionHeading,
  StatCard,
  StatusBadge,
  TextLink,
} from '../components/ui'

const chartColors = ['#345cf3', '#8b88f0', '#5bb8c5', '#efa85e']

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })
  const role = user!.role
  const financial = role === 'admin' || role === 'cashier'
  const pharmacist = role === 'pharmacist'
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  )
  const greeting = hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好'
  const data = query.data
  const stats = data?.stats
  const difference = stats ? stats.today_visits - stats.yesterday_visits : 0
  const weeklyTotal = data?.trend.reduce((sum, day) => sum + day.visits, 0) || 0
  const departmentTotal =
    data?.departments.reduce((sum, department) => sum + department.visits, 0) || 0
  const quickActions = [
    {
      title: '门诊挂号',
      sub: '选医生，安排就诊',
      path: '/registrations?new=1',
      icon: ClipboardPlus,
      tone: 'blue',
      roles: ['admin', 'cashier'],
    },
    {
      title: '接诊开方',
      sub: '查看候诊与病历',
      path: '/consultations',
      icon: Stethoscope,
      tone: 'purple',
      roles: ['admin', 'doctor'],
    },
    {
      title: '收费结算',
      sub: '核对费用，确认收款',
      path: '/billing',
      icon: Wallet,
      tone: 'amber',
      roles: ['admin', 'cashier'],
    },
    {
      title: '药房发药',
      sub: '核对处方，完成发药',
      path: '/pharmacy',
      icon: PackageCheck,
      tone: 'teal',
      roles: ['admin', 'pharmacist'],
    },
    {
      title: '患者档案',
      sub: '查看档案与就诊记录',
      path: '/patients',
      icon: Users,
      tone: 'blue',
      roles: ['doctor', 'cashier'],
    },
    {
      title: '医生排班',
      sub: '查看医生与出诊时间',
      path: '/schedules',
      icon: CalendarDays,
      tone: 'purple',
      roles: ['doctor', 'cashier', 'pharmacist'],
    },
    {
      title: '药品入库',
      sub: '管理库存与药品批次',
      path: '/inventory',
      icon: PackagePlus,
      tone: 'blue',
      roles: ['pharmacist'],
    },
  ]
    .filter((action) => action.roles.includes(role))
    .slice(0, 4)
  const tasks = [
    {
      title: '等候接诊',
      detail: '今日候诊患者',
      count: stats?.waiting || 0,
      path: '/consultations',
      icon: Stethoscope,
      roles: ['admin', 'doctor'],
    },
    {
      title: '等待收费',
      detail: '尚未结算的处方',
      count: stats?.unpaid || 0,
      path: '/billing',
      icon: Wallet,
      roles: ['admin', 'cashier'],
    },
    {
      title: '等待发药',
      detail: '已付款待核对',
      count: stats?.pending_dispense || 0,
      path: '/pharmacy',
      icon: PackageCheck,
      roles: ['admin', 'pharmacist'],
    },
    {
      title: '库存预警',
      detail: '低于库存阈值',
      count: stats?.low_stock || 0,
      path: '/inventory?filter=low',
      icon: Layers3,
      roles: ['pharmacist'],
    },
    {
      title: '今日挂号',
      detail: '查看当日挂号记录',
      count: stats?.today_visits || 0,
      path: '/registrations',
      icon: ClipboardPlus,
      roles: ['cashier'],
    },
  ].filter((task) => task.roles.includes(role))
  return (
    <div className="home-page">
      <div className="home-heading">
        <div>
          <div className="home-eyebrow">
            <span /> CARE IN SYNC
          </div>
          <div className="home-title">
            <h1>工作台</h1>
            <span className="heading-slash">/</span>
            <span className="greeting">
              {greeting}，{user?.display_name}
            </span>
          </div>
          <p>连接每一个诊疗环节，让今天的工作井然有序。</p>
        </div>
        <div className="home-heading-actions">
          <span className="date-chip">
            <CalendarDays size={16} />
            {dateLabel}
          </span>
          <Button
            onClick={() =>
              navigate(
                role === 'doctor'
                  ? '/consultations'
                  : pharmacist
                    ? '/pharmacy'
                    : '/registrations?new=1',
              )
            }
          >
            <Plus size={17} />
            {role === 'doctor' ? '开始接诊' : pharmacist ? '进入药房' : '新建挂号'}
          </Button>
        </div>
      </div>
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {data && stats && (
          <>
            <section className="stats-grid home-stats" aria-label="今日业务指标">
              <StatCard
                label={role === 'doctor' ? '今日本人门诊' : '今日门诊人次'}
                value={number(stats.today_visits)}
                unit="人次"
                icon={<Users size={20} />}
                tone="primary"
                sub={
                  <>
                    <span className="metric-delta">
                      {difference >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {Math.abs(difference)} 人次
                    </span>
                    <span>较昨日</span>
                  </>
                }
              />
              <StatCard
                label={pharmacist ? '待核对发药' : '等候接诊'}
                value={number(pharmacist ? stats.pending_dispense : stats.waiting)}
                unit={pharmacist ? '张处方' : '位患者'}
                icon={<Clock3 size={20} />}
                tone="amber"
                sub={
                  <>
                    <span className="metric-dot amber" />
                    {pharmacist ? '全部已缴费、未发药处方' : '今日候诊队列，实时更新'}
                  </>
                }
              />
              <StatCard
                label={financial ? '今日实收净额' : pharmacist ? '库存预警' : '当前接诊中'}
                value={
                  financial
                    ? money(stats.today_revenue_cents)
                    : number(pharmacist ? stats.low_stock : stats.in_progress)
                }
                unit={financial ? undefined : pharmacist ? '种药品' : '位患者'}
                icon={financial ? <Wallet size={20} /> : <Activity size={20} />}
                tone="purple"
                sub={
                  <>
                    <span className="metric-dot purple" />
                    {financial
                      ? '处方实收金额，已扣除退费'
                      : pharmacist
                        ? '可用数量低于库存阈值'
                        : '已开始、尚未完成的就诊'}
                  </>
                }
              />
              <StatCard
                label={financial ? '待发药处方' : '今日完成就诊'}
                value={number(financial ? stats.pending_dispense : stats.completed)}
                unit={financial ? '张' : '人次'}
                icon={<PackageCheck size={20} />}
                tone="teal"
                sub={
                  <>
                    <span className="metric-dot teal" />
                    {financial ? '已缴费，等待药房处理' : '已完成的门诊记录'}
                  </>
                }
              />
            </section>
            <section className="shortcut-strip" aria-label="常用功能">
              <div className="shortcut-label">
                <span>快速开始</span>
                <small>QUICK ACCESS</small>
              </div>
              <div className="shortcut-links">
                {quickActions.map((action) => (
                  <button
                    key={action.path}
                    className={'shortcut-item tone-' + action.tone}
                    onClick={() => navigate(action.path)}
                  >
                    <i>
                      <action.icon size={21} strokeWidth={1.8} />
                    </i>
                    <div>
                      <strong>{action.title}</strong>
                      <small>{action.sub}</small>
                    </div>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
            </section>
            <div className="home-main-grid">
              <section className="panel trend-panel">
                <SectionHeading
                  title="就诊趋势"
                  subtitle="掌握近 7 日门诊服务情况"
                  action={
                    <span className="period-label">
                      近 7 天<CalendarDays size={14} />
                    </span>
                  }
                />
                <div className="trend-summary">
                  <strong>
                    {number(weeklyTotal)}
                    <small>人次</small>
                  </strong>
                  <span>
                    <i />
                    门诊量
                  </span>
                </div>
                <div
                  className="visit-chart"
                  role="img"
                  aria-label={'近七日门诊共 ' + weeklyTotal + ' 人次'}
                >
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart
                      data={data.trend}
                      margin={{ top: 12, right: 24, left: -19, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="dudu-area" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#456af7" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#456af7" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#edf0f6" />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tickMargin={13}
                        tick={{ fill: '#8490a6', fontSize: 11 }}
                        tickFormatter={(value: string) => value.slice(5).replace('-', '/')}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#8490a6', fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e8edf5',
                          fontSize: 12,
                          boxShadow: '0 8px 24px #17285512',
                        }}
                        labelFormatter={(label) => String(label)}
                        formatter={(value) => [String(value) + ' 人次', '门诊量']}
                      />
                      <Area
                        type="monotone"
                        dataKey="visits"
                        stroke="#345cf3"
                        strokeWidth={2.8}
                        fill="url(#dudu-area)"
                        dot={{ r: 3, fill: 'white', strokeWidth: 2 }}
                        activeDot={{ r: 6, strokeWidth: 3, stroke: 'white' }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="task-panel">
                <div className="task-title">
                  <span className="task-symbol">
                    <Sparkles size={18} />
                  </span>
                  <span>
                    工作待办<small>每一步，都有条不紊</small>
                  </span>
                  <span className="task-label">LIVE</span>
                </div>
                <div className="task-list">
                  {tasks.map((task) => (
                    <button key={task.title} onClick={() => navigate(task.path)}>
                      <span className="task-icon">
                        <task.icon size={20} />
                      </span>
                      <span className="task-copy">
                        <strong>{task.title}</strong>
                        <small>{task.detail}</small>
                      </span>
                      <b>{task.count.toString().padStart(2, '0')}</b>
                      <ChevronArrow />
                    </button>
                  ))}
                </div>
                <div className="task-foot">
                  <span className="pulse-dot" />
                  与业务数据同步更新
                </div>
              </section>
            </div>
            <div className="home-main-grid home-bottom-grid">
              <section className="panel today-patients">
                <SectionHeading
                  title={pharmacist ? '药房提醒' : '今日候诊'}
                  subtitle={pharmacist ? '及时处理库存和待发药事项' : '有序接诊，让等待少一点'}
                  action={
                    <TextLink
                      onClick={() =>
                        navigate(
                          pharmacist
                            ? '/inventory'
                            : role === 'doctor'
                              ? '/consultations'
                              : '/registrations',
                        )
                      }
                    >
                      查看全部
                    </TextLink>
                  }
                />
                {pharmacist ? (
                  <div className="home-alert-list">
                    {data.alerts.length ? (
                      data.alerts.slice(0, 4).map((alert) => (
                        <button key={alert.id} onClick={() => navigate(alert.path)}>
                          <span className={'alert-dot ' + alert.type} />
                          <div>
                            <strong>{alert.title}</strong>
                            <small>{alert.description}</small>
                          </div>
                          <ArrowRight size={16} />
                        </button>
                      ))
                    ) : (
                      <EmptyState title="药房运行平稳" description="暂无库存或发药提醒。" />
                    )}
                  </div>
                ) : (
                  <DataTable<Registration>
                    compact
                    items={data.waiting_list}
                    emptyTitle="今日候诊已处理完毕"
                    emptyDescription="新挂号的患者将在这里出现。"
                    columns={[
                      {
                        key: 'patient',
                        title: '患者',
                        render: (item) => (
                          <Identity
                            name={item.patient_name}
                            sub={genderNames[item.gender] + ' · ' + age(item.birth_date) + '岁'}
                          />
                        ),
                      },
                      {
                        key: 'department',
                        title: '就诊科室',
                        render: (item) => (
                          <div className="cell-lines">
                            <b>{item.department_name}</b>
                            <small>{item.doctor_name}</small>
                          </div>
                        ),
                      },
                      {
                        key: 'queue',
                        title: '排队号',
                        render: (item) => (
                          <span className="queue-pill">
                            {String(item.queue_no).padStart(3, '0')}
                          </span>
                        ),
                      },
                      {
                        key: 'status',
                        title: '就诊状态',
                        render: (item) => <StatusBadge status={item.status} />,
                      },
                      {
                        key: 'action',
                        title: '操作',
                        className: 'text-right',
                        render: (item) => (
                          <button
                            className="table-link"
                            onClick={() =>
                              navigate('/patients?q=' + encodeURIComponent(item.patient_name))
                            }
                          >
                            查看档案
                            <ArrowUpRight size={13} />
                          </button>
                        ),
                      },
                    ]}
                  />
                )}
                {!pharmacist && (
                  <div className="table-note">
                    <Clock3 size={13} />
                    展示最新 5 位候诊患者，完整队列见医生工作站
                  </div>
                )}
              </section>
              <section className="panel department-panel">
                <SectionHeading title="科室分布" action={<Badge tone="gray">近 7 日</Badge>} />
                <div className="department-total">
                  <span>门诊人次分布</span>
                  <strong>
                    {number(departmentTotal)}
                    <small>人次</small>
                  </strong>
                </div>
                <div className="department-stack" aria-hidden="true">
                  {data.departments.map((department, index) => (
                    <span
                      key={department.id}
                      style={{
                        width:
                          (departmentTotal ? (department.visits / departmentTotal) * 100 : 0) + '%',
                        background: chartColors[index % chartColors.length],
                      }}
                    />
                  ))}
                </div>
                <div className="department-bars">
                  {data.departments.map((department, index) => (
                    <div key={department.id}>
                      <div className="department-bar-label">
                        <span>
                          <i style={{ background: chartColors[index % chartColors.length] }} />
                          {department.name}
                        </span>
                        <strong>
                          {department.visits}
                          <small>人次</small>
                        </strong>
                      </div>
                      <div className="department-track">
                        <span
                          style={{
                            width:
                              (departmentTotal ? (department.visits / departmentTotal) * 100 : 0) +
                              '%',
                            background: chartColors[index % chartColors.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="department-caption">
                  <Check size={13} />
                  统计已排除取消的挂号记录
                </p>
              </section>
            </div>
            {role === 'admin' && (
              <section className="activity-strip">
                <span className="activity-label">
                  <FileText size={16} />
                  最近动态
                </span>
                <div>
                  {data.activity.slice(0, 3).map((item, index) => (
                    <span key={item.created_at + index}>
                      <b>{item.actor_name}</b>
                      {actionNames[item.action] || item.action}
                      <small>{dateTime(item.created_at)}</small>
                    </span>
                  ))}
                </div>
                <button onClick={() => navigate('/audit')} aria-label="查看操作日志">
                  <ArrowRight size={17} />
                </button>
              </section>
            )}
          </>
        )}
      </DataState>
    </div>
  )
}

function ChevronArrow() {
  return <ArrowUpRight className="task-arrow" size={17} />
}
