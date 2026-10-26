import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  Settings2,
  Sun,
  Sunset,
} from 'lucide-react'
import { api } from '../api/client'
import type { Department, Doctor, Schedule } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { businessDate, money, shiftDate } from '../lib/format'
import { useAction } from '../lib/hooks'
import {
  Avatar,
  Badge,
  Button,
  DataState,
  EmptyState,
  Field,
  Modal,
  Notice,
  PageHeader,
} from '../components/ui'

export function Schedules() {
  const { user } = useAuth()
  const [date, setDate] = useState(businessDate())
  const [department, setDepartment] = useState('')
  const [form, setForm] = useState<Schedule | null | undefined>()
  const query = useQuery({
    queryKey: ['schedules', date, department],
    queryFn: () => api.get<Schedule[]>('/schedules', { date, department_id: department }),
  })
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
  })
  const grouped = (query.data || []).reduce<Record<number, Schedule[]>>((all, item) => {
    ;(all[item.doctor_id] ||= []).push(item)
    return all
  }, {})
  return (
    <div>
      <PageHeader
        eyebrow="DOCTOR SCHEDULES"
        title="医生排班"
        description="清晰安排每个出诊时段，合理分配门诊号源。"
        actions={
          user?.role === 'admin' && (
            <Button onClick={() => setForm(null)}>
              <Plus size={17} />
              新增排班
            </Button>
          )
        }
      />
      <div className="schedule-toolbar panel">
        <div className="date-stepper">
          <button
            className="icon-button bordered"
            aria-label="前一天"
            onClick={() => setDate(shiftDate(date, -1))}
          >
            <ChevronLeft size={17} />
          </button>
          <div className="date-control">
            <CalendarDays size={17} />
            <input
              aria-label="排班日期"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <button
            className="icon-button bordered"
            aria-label="后一天"
            onClick={() => setDate(shiftDate(date, 1))}
          >
            <ChevronRight size={17} />
          </button>
          <Button size="small" variant="ghost" onClick={() => setDate(businessDate())}>
            今天
          </Button>
        </div>
        <div className="department-filter">
          <select
            aria-label="筛选科室"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="">全部科室</option>
            {departments.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span>{Object.keys(grouped).length} 位出诊医生</span>
        </div>
      </div>
      <DataState pending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {Object.keys(grouped).length ? (
          <div className="doctor-cards">
            {Object.values(grouped).map((slots) => {
              const doctor = slots[0]
              return (
                <article className="panel doctor-card" key={doctor.doctor_id}>
                  <div className="doctor-card-header">
                    <Avatar name={doctor.doctor_name} color={doctor.avatar_color} />
                    <div>
                      <h3>
                        {doctor.doctor_name}
                        <span>{doctor.title}</span>
                      </h3>
                      <p>{doctor.department_name}</p>
                    </div>
                    <Badge tone="green">出诊</Badge>
                  </div>
                  <p className="doctor-specialty">{doctor.specialty}</p>
                  <div className="doctor-location">
                    <MapPin size={14} />
                    {doctor.location}
                    <span>诊查标准 {money(doctor.consultation_fee_cents)}</span>
                  </div>
                  <div className="doctor-slots">
                    {slots.map((slot) => (
                      <div className="doctor-slot" key={slot.id}>
                        <div>
                          {slot.period === 'morning' ? <Sun size={18} /> : <Sunset size={18} />}
                          <strong>{slot.period === 'morning' ? '上午门诊' : '下午门诊'}</strong>
                          <small>{slot.period === 'morning' ? '08:00–12:00' : '14:00–17:30'}</small>
                          {user?.role === 'admin' && date >= businessDate() && (
                            <button
                              aria-label={`调整${slot.doctor_name}${slot.period === 'morning' ? '上午' : '下午'}号源`}
                              className="icon-button"
                              onClick={() => setForm(slot)}
                            >
                              <Settings2 size={15} />
                            </button>
                          )}
                        </div>
                        <div className="slot-capacity">
                          <div className="capacity-track">
                            <i
                              style={{
                                width: `${((slot.total_slots - slot.remaining_slots) / slot.total_slots) * 100}%`,
                              }}
                            />
                          </div>
                          <span>
                            余 <b>{slot.remaining_slots}</b> / {slot.total_slots} 号
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <section className="panel">
            <EmptyState title="当天暂无出诊安排" description="更换日期查看，或由管理员新增排班。" />
          </section>
        )}
      </DataState>
      <div className="page-hint">
        <Clock3 size={14} />
        调整总号源时，已挂号人数会被保留；历史排班仅支持查看。
      </div>
      {form !== undefined && (
        <ScheduleForm schedule={form} initialDate={date} onClose={() => setForm(undefined)} />
      )}
    </div>
  )
}

function ScheduleForm({
  schedule,
  initialDate,
  onClose,
}: {
  schedule: Schedule | null
  initialDate: string
  onClose: () => void
}) {
  const [doctor, setDoctor] = useState(schedule?.doctor_id || 0)
  const [date, setDate] = useState(
    schedule?.date || (initialDate < businessDate() ? businessDate() : initialDate),
  )
  const [period, setPeriod] = useState(schedule?.period || 'morning')
  const [total, setTotal] = useState(schedule?.total_slots || 24)
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => api.get<Doctor[]>('/doctors') })
  const action = useAction(
    () =>
      schedule
        ? api.patch(`/schedules/${schedule.id}`, { total_slots: total })
        : api.post('/schedules', { doctor_id: doctor, date, period, total_slots: total }),
    '排班已保存',
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    action.mutate(undefined, { onSuccess: onClose })
  }
  return (
    <Modal
      title={schedule ? '调整号源数量' : '新增医生排班'}
      description="同一医生、日期与时段仅有一条排班记录"
      onClose={onClose}
      busy={action.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="schedule-form" loading={action.isPending}>
            保存排班
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={submit} className="form-grid">
        <Field label="出诊医生" required className="full-width">
          <select
            required
            value={doctor || ''}
            disabled={!!schedule}
            onChange={(event) => setDoctor(Number(event.target.value))}
          >
            <option value="">请选择医生</option>
            {doctors.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.department_name} · {item.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="出诊日期" required>
          <input
            required
            type="date"
            disabled={!!schedule}
            min={businessDate()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="出诊时段" required>
          <select
            value={period}
            disabled={!!schedule}
            onChange={(event) => setPeriod(event.target.value as 'morning' | 'afternoon')}
          >
            <option value="morning">上午 08:00–12:00</option>
            <option value="afternoon">下午 14:00–17:30</option>
          </select>
        </Field>
        <Field
          label="总号源数量"
          required
          className="full-width"
          hint={
            schedule
              ? `当前已挂号 ${schedule.total_slots - schedule.remaining_slots} 人，调整后自动重算剩余号源。`
              : '每时段 1–200 个号源'
          }
        >
          <input
            required
            type="number"
            min={Math.max(1, schedule ? schedule.total_slots - schedule.remaining_slots : 1)}
            max={200}
            value={total}
            onChange={(event) => setTotal(Number(event.target.value))}
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
