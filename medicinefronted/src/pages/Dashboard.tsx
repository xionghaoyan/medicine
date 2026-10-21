import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ClipboardPlus,
  Clock3,
  HeartPulse,
  Leaf,
  PackageCheck,
  PackagePlus,
  Stethoscope,
  Users,
  Wallet,
} from 'lucide-react'
import type { Dashboard as DashboardData, Registration } from '../api/types'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { actionNames, age, dateTime, genderNames, money, number } from '../lib/format'
import {
  Avatar,
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

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  })
  const dateLabel = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
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
  const role = user!.role
  const financial = role === 'admin' || role === 'cashier'
  const pharmacist = role === 'pharmacist'
  const mainAction =
    role === 'doctor' ? '/consultations' : pharmacist ? '/pharmacy' : '/registrations?new=1'
  const quickActions = [
    {
      label: '门诊挂号',
      description: '预约医生与时段',
      icon: ClipboardPlus,
      path: '/registrations?new=1',
      roles: ['admin', 'cashier'],
      tone: 'green',
    },
    {
      label: '接诊开方',
      description: '进入医生工作站',
      icon: Stethoscope,
      path: '/consultations',
      roles: ['admin', 'doctor'],
      tone: 'blue',
    },
    {
      label: '收费结算',
      description: '核对并确认收款',
      icon: Wallet,
      path: '/billing',
      roles: ['admin', 'cashier'],
      tone: 'amber',
    },
    {
      label: '药房发药',
      description: '核对处方与出库',
      icon: PackageCheck,
      path: '/pharmacy',
      roles: ['admin', 'pharmacist'],
      tone: 'purple',
    },
    {
      label: '药品入库',
      description: '管理药品与批次',
      icon: PackagePlus,
      path: '/inventory',
      roles: ['pharmacist'],
      tone: 'green',
    },
    {
      label: '患者档案',
      description: '查看患者与病史',
      icon: Users,
      path: '/patients',
      roles: ['doctor', 'cashier'],
      tone: 'purple',
    },
    {
      label: '医生排班',
      description: '查看门诊安排',
      icon: CalendarDays,
      path: '/schedules',
      roles: ['doctor', 'pharmacist'],
      tone: 'amber',
    },
  ]
    .filter((item) => item.roles.includes(role))
    .slice(0, 4)
  const data = query.data
  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">WORKSPACE OVERVIEW</span>
          <h1>工作台</h1>
        </div>
        <span className="date-chip">
          <CalendarDays size={15} />
          {dateLabel}
        </span>
      </div>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="welcome-kicker">
            <Leaf size={14} /> 每一份关怀，都值得用心
          </span>
          <h2>
            {greeting}，{user?.display_name}
            <span>。</span>
          </h2>
          <p>诊疗有序进行，让今天的协作更从容。</p>
          <Button onClick={() => navigate(mainAction)}>
            {role === 'doctor' ? '开始接诊' : pharmacist ? '进入药房' : '新建挂号'}
            <ArrowRight size={16} />
          </Button>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-ring ring-one" />
          <div className="art-ring ring-two" />
          <div className="art-heart">
            <HeartPulse size={88} strokeWidth={1.1} />
          </div>
          <div className="art-leaf leaf-one" />
          <div className="art-leaf leaf-two" />
          <span>CARE, WITH CLARITY.</span>
          <div className="art-plus">+</div>
        </div>
        <div className="welcome-corner">QINGHE / OUTPATIENT CARE</div>
      </section>
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {data && (
          <>
            <div className="stats-grid">
              <StatCard
                label="今日门诊"
                value={number(data.stats.today_visits)}
                unit="人次"
                icon={<Users size={20} />}
                sub={
                  <>
                    <span className="stat-change">
                      {data.stats.today_visits >= data.stats.yesterday_visits ? (
                        <ArrowUpRight size={13} />
                      ) : (
                        <ArrowDownRight size={13} />
                      )}
                      {Math.abs(data.stats.today_visits - data.stats.yesterday_visits)} 人次
                    </span>
                    <span>较昨日</span>
                  </>
                }
              />
              <StatCard
                label={pharmacist ? '待发药处方' : '当前候诊'}
                value={pharmacist ? data.stats.pending_dispense : data.stats.waiting}
                unit={pharmacist ? '张' : '人'}
                icon={<Clock3 size={20} />}
                tone="amber"
                sub={
                  <>
                    <i className="status-dot amber" />
                    {pharmacist ? '已缴费，等待药房核对' : `${data.stats.in_progress} 人正在就诊`}
                  </>
                }
              />
              <StatCard
                label={financial ? '今日净收入' : pharmacist ? '低库存药品' : '今日已完成'}
                value={
                  financial
                    ? money(data.stats.today_revenue_cents)
                    : pharmacist
                      ? data.stats.low_stock
                      : data.stats.completed
                }
                unit={financial ? undefined : pharmacist ? '种' : '人'}
                icon={financial ? <Wallet size={20} /> : <PackageCheck size={20} />}
                tone="blue"
                sub={
                  <>
                    {financial ? (
                      <>
                        <Check size={13} /> 已扣除当日退费
                      </>
                    ) : pharmacist ? (
                      '建议及时安排采购补货'
                    ) : (
                      '已完成本次诊疗流程'
                    )}
                  </>
                }
              />
              <StatCard
                label={pharmacist ? '今日完成就诊' : '患者档案'}
                value={pharmacist ? data.stats.completed : number(data.stats.total_patients || 0)}
                unit={pharmacist ? '人' : '份'}
                icon={<HeartPulse size={20} />}
                tone="purple"
                sub={
                  <>
                    <span className="muted-dot" />
                    {role === 'doctor' ? '本人关联的患者档案' : '每一份记录，都是一份关怀'}
                  </>
                }
              />
            </div>
            <section className="quick-section">
              <SectionHeading title="快捷工作" subtitle="常用操作，一步直达" />
              <div className="quick-actions">
                {quickActions.map((item) => (
                  <button
                    className={`quick-action quick-${item.tone}`}
                    key={item.path}
                    onClick={() => navigate(item.path)}
                  >
                    <i>
                      <item.icon size={22} strokeWidth={1.6} />
                    </i>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            </section>
            <div className="dashboard-charts">
              <section className="panel trend-panel">
                <SectionHeading
                  title="门诊趋势"
                  subtitle={role === 'doctor' ? '近 7 天本人接诊情况' : '近 7 天门诊就诊情况'}
                  action={
                    <span className="chart-legend">
                      <i />
                      门诊人次<span className="plain-chip">近 7 天</span>
                    </span>
                  }
                />
                <div className="trend-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={data.trend}
                      margin={{ top: 10, right: 15, left: -26, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="visitGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4a9074" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#4a9074" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8ece8" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => value.slice(5).replace('-', '/')}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#66776b', fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#66776b', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          border: '1px solid #e5eae4',
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelFormatter={(value) => String(value)}
                      />
                      <Area
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="visits"
                        name="门诊人次"
                        stroke="#3c816a"
                        strokeWidth={2.5}
                        fill="url(#visitGradient)"
                        dot={{ r: 3, fill: '#fff', strokeWidth: 2 }}
                        activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="panel department-panel">
                <SectionHeading title="科室分布" subtitle="近 7 天有效挂号" />
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={data.departments.filter((item) => item.visits > 0)}
                        dataKey="visits"
                        nameKey="name"
                        innerRadius={67}
                        outerRadius={89}
                        paddingAngle={4}
                        cornerRadius={5}
                        stroke="none"
                      >
                        {data.departments
                          .filter((item) => item.visits > 0)
                          .map((item) => (
                            <Cell key={item.id} fill={item.color} />
                          ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <strong>{data.departments.reduce((sum, item) => sum + item.visits, 0)}</strong>
                    <small>总就诊人次</small>
                  </div>
                </div>
                <div className="department-legend">
                  {data.departments.map((item) => (
                    <div key={item.id}>
                      <i style={{ background: item.color }} />
                      <span>{item.name}</span>
                      <b>{item.visits}</b>
                      <small>人次</small>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="dashboard-bottom">
              <section className="panel waiting-panel">
                <SectionHeading
                  title={pharmacist ? '协作动态' : '今日候诊'}
                  subtitle={pharmacist ? '及时处理库存与发药待办' : '关注每一位等待中的患者'}
                  action={
                    !pharmacist && (
                      <TextLink
                        onClick={() =>
                          navigate(role === 'doctor' ? '/consultations' : '/registrations')
                        }
                      >
                        查看全部
                      </TextLink>
                    )
                  }
                />
                {pharmacist ? (
                  <div className="pharmacy-home">
                    <PackageCheck size={44} strokeWidth={1.2} />
                    <h3>{data.stats.pending_dispense} 张处方等待发药</h3>
                    <p>在药房工作区核对患者、药品及批次有效期。</p>
                    <Button onClick={() => navigate('/pharmacy')}>
                      处理发药
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                ) : (
                  <DataTable<Registration>
                    compact
                    items={data.waiting_list}
                    emptyTitle="暂无候诊患者"
                    emptyDescription="今天的候诊队列已处理完毕。"
                    columns={[
                      {
                        key: 'patient',
                        title: '患者',
                        render: (item) => (
                          <Identity
                            name={item.patient_name}
                            sub={`${genderNames[item.gender]} · ${age(item.birth_date)}岁`}
                          />
                        ),
                      },
                      {
                        key: 'department',
                        title: '就诊科室',
                        render: (item) => (
                          <div className="cell-lines">
                            <strong>{item.department_name}</strong>
                            <small>{item.doctor_name} 医生</small>
                          </div>
                        ),
                      },
                      {
                        key: 'queue',
                        title: '排队号',
                        render: (item) => (
                          <span className="queue-number">
                            {String(item.queue_no).padStart(3, '0')}
                          </span>
                        ),
                      },
                      {
                        key: 'status',
                        title: '状态',
                        render: (item) => <StatusBadge status={item.status} />,
                      },
                    ]}
                  />
                )}
              </section>
              <section className="panel reminders-panel">
                <SectionHeading
                  title="待办提醒"
                  action={<span className="count-pill">{data.alerts.length}</span>}
                />
                {data.alerts.length ? (
                  <div className="reminder-list">
                    {data.alerts.slice(0, 4).map((alert) => (
                      <button key={alert.id} onClick={() => navigate(alert.path)}>
                        <div className={`reminder-icon ${alert.type}`}>
                          {alert.type === 'warning' ? (
                            <PackagePlus size={17} />
                          ) : (
                            <Clock3 size={17} />
                          )}
                        </div>
                        <div>
                          <strong>{alert.title}</strong>
                          <p>{alert.description}</p>
                        </div>
                        <ChevronIcon />
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="一切井然有序" description="暂无需要处理的提醒。" />
                )}
                {data.activity[0] && (
                  <div className="latest-activity">
                    <Avatar name={data.activity[0].actor_name} small />
                    <div>
                      <strong>
                        {data.activity[0].actor_name} ·{' '}
                        {actionNames[data.activity[0].action] || '业务操作'}
                      </strong>
                      <small>{dateTime(data.activity[0].created_at)}</small>
                    </div>
                    <Badge tone="gray">最近</Badge>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </DataState>
    </div>
  )
}

function ChevronIcon() {
  return <ArrowUpRight size={16} className="reminder-arrow" />
}
