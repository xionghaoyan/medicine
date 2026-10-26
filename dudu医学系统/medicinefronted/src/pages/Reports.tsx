import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Download,
  ReceiptText,
  Users,
  Wallet,
} from 'lucide-react'
import { api, download } from '../api/client'
import type { DailyReport, Report } from '../api/types'
import { useToast } from '../context/ToastContext'
import { businessDate, money, paymentNames, shiftDate } from '../lib/format'
import {
  Button,
  DataState,
  DataTable,
  PageHeader,
  SectionHeading,
  StatCard,
} from '../components/ui'

export function Reports() {
  const [start, setStart] = useState(shiftDate(businessDate(), -6))
  const [end, setEnd] = useState(businessDate())
  const [exporting, setExporting] = useState(false)
  const toast = useToast()
  const query = useQuery({
    queryKey: ['report', start, end],
    queryFn: () => api.get<Report>('/reports', { start_date: start, end_date: end }),
    enabled: !!start && !!end,
  })
  const data = query.data
  const exportReport = async () => {
    setExporting(true)
    try {
      await download('/reports/export', `门诊统计_${start}_${end}.csv`, {
        start_date: start,
        end_date: end,
      })
      toast('统计报表已导出')
    } catch (error) {
      toast((error as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow="INSIGHTS & REPORTS"
        title="统计报表"
        description="读懂每一天的诊疗与收支，为运营提供清晰依据。"
        actions={
          <Button
            variant="secondary"
            disabled={!data || query.isError}
            loading={exporting}
            onClick={exportReport}
          >
            <Download size={16} />
            导出报表
          </Button>
        }
      />
      <div className="panel report-filter">
        <div>
          <CalendarDays size={18} />
          <span>统计区间</span>
          <input
            aria-label="统计开始日期"
            type="date"
            value={start}
            max={end}
            onChange={(event) => setStart(event.target.value)}
          />
          <span className="muted">至</span>
          <input
            aria-label="统计结束日期"
            type="date"
            min={start}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
        <div>
          <Button
            size="small"
            variant="ghost"
            onClick={() => {
              setStart(businessDate())
              setEnd(businessDate())
            }}
          >
            今日
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => {
              setStart(shiftDate(businessDate(), -6))
              setEnd(businessDate())
            }}
          >
            近 7 天
          </Button>
          <Button
            size="small"
            variant="ghost"
            onClick={() => {
              setStart(`${businessDate().slice(0, 7)}-01`)
              setEnd(businessDate())
            }}
          >
            本月
          </Button>
        </div>
      </div>
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {data && (
          <>
            <div className="stats-grid">
              <StatCard
                label="门诊就诊人次"
                value={data.summary.visits}
                unit="人次"
                icon={<Users size={20} />}
                sub="统计区间内的有效挂号"
              />
              <StatCard
                label="净收入"
                value={money(data.summary.revenue_cents)}
                icon={<Wallet size={20} />}
                tone="blue"
                sub={
                  <>
                    <ArrowUpRight size={13} />
                    收款减去退费
                  </>
                }
              />
              <StatCard
                label="退费金额"
                value={money(data.summary.refund_cents)}
                icon={<ArrowDownLeft size={20} />}
                tone="amber"
                sub="按实际退费日期统计"
              />
              <StatCard
                label="平均每笔净收入"
                value={money(data.summary.average_cents)}
                icon={<ReceiptText size={20} />}
                tone="purple"
                sub={`期间累计收款 ${data.summary.charges} 笔`}
              />
            </div>
            <div className="report-charts">
              <section className="panel">
                <SectionHeading
                  title="每日收入"
                  subtitle="收款与退费按发生日期归集，单位：元"
                  action={
                    <span className="chart-legend">
                      <i />
                      净收入
                    </span>
                  }
                />
                <div className="report-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.daily.map((day) => ({ ...day, amount: day.revenue_cents / 100 }))}
                      margin={{ top: 10, left: -10, right: 18, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#ebeff8" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => value.slice(5).replace('-', '/')}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#71829f' }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#71829f' }}
                      />
                      <Tooltip
                        cursor={{ fill: '#f2f5ff' }}
                        contentStyle={{
                          borderRadius: 12,
                          fontSize: 12,
                          border: '1px solid #e5ebf6',
                        }}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="amount"
                        name="净收入（元）"
                        fill="#5074f5"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={37}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="panel report-departments">
                <SectionHeading title="科室运营情况" subtitle="就诊量与处方净收入" />
                <div className="report-department-list">
                  {data.departments.map((item) => (
                    <div key={item.id}>
                      <div>
                        <i style={{ background: item.color }} />
                        <strong>{item.name}</strong>
                        <span>{item.visits} 人次</span>
                      </div>
                      <div className="department-bar">
                        <i
                          style={{
                            width: `${data.summary.visits ? (item.visits / data.summary.visits) * 100 : 0}%`,
                            background: item.color,
                          }}
                        />
                      </div>
                      <strong>{money(item.revenue_cents)}</strong>
                    </div>
                  ))}
                </div>
                <div className="payment-method-summary">
                  <small>收款渠道</small>
                  {data.payment_methods.map((method) => (
                    <span key={method.payment_method}>
                      {paymentNames[method.payment_method]} <b>{method.count}</b> 笔
                    </span>
                  ))}
                </div>
              </section>
            </div>
            <section className="panel report-daily">
              <SectionHeading
                title="每日明细"
                subtitle={`${start} 至 ${end} · 共 ${data.daily.length} 天`}
              />
              <DataTable<DailyReport & { id: string }>
                items={data.daily.map((item) => ({ ...item, id: item.date }))}
                columns={[
                  { key: 'date', title: '统计日期', render: (item) => <b>{item.date}</b> },
                  { key: 'visits', title: '就诊人次', render: (item) => `${item.visits} 人次` },
                  { key: 'charges', title: '收款笔数', render: (item) => `${item.charges} 笔` },
                  {
                    key: 'paid',
                    title: '收款金额',
                    className: 'text-right',
                    render: (item) => money(item.paid_cents),
                  },
                  {
                    key: 'refund',
                    title: '退费金额',
                    className: 'text-right',
                    render: (item) => <span className="muted">{money(item.refund_cents)}</span>,
                  },
                  {
                    key: 'net',
                    title: '净收入',
                    className: 'text-right',
                    render: (item) => (
                      <b className="money text-green">{money(item.revenue_cents)}</b>
                    ),
                  },
                ]}
              />
            </section>
          </>
        )}
      </DataState>
      <div className="page-hint">
        <ReceiptText size={14} />
        收入为处方药品线下收款记录，不包含尚未收费的处方和挂号诊查标准金额。
      </div>
    </div>
  )
}
