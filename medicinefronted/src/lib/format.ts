import type { Role } from '../api/types'

export const roleNames: Record<Role, string> = {
  admin: '系统管理员',
  doctor: '门诊医生',
  cashier: '收费员',
  pharmacist: '药师',
}
export const genderNames = { male: '男', female: '女', other: '其他' }
export const paymentNames: Record<string, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  card: '银行卡',
}
export const money = (cents: number | null | undefined) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format((cents ?? 0) / 100)
export const number = (value: number) => new Intl.NumberFormat('zh-CN').format(value)
export function businessDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+08:00`)
  date.setTime(date.getTime() + days * 86400000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
export function dateTime(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
export function age(value: string) {
  const current = businessDate()
  let years = Number(current.slice(0, 4)) - Number(value.slice(0, 4))
  if (current.slice(5) < value.slice(5)) years--
  return years
}
export function phoneMasked(value: string) {
  return value.length === 11 ? `${value.slice(0, 3)} **** ${value.slice(-4)}` : value || '未填写'
}
export function periodName(value: string) {
  return value === 'morning' ? '上午 08:00–12:00' : '下午 14:00–17:30'
}
export const actionNames: Record<string, string> = {
  'auth.login': '账户登录',
  'auth.logout': '安全退出',
  'patient.create': '患者建档',
  'patient.update': '更新档案',
  'registration.create': '门诊挂号',
  'registration.cancel': '取消挂号',
  'consultation.start': '开始接诊',
  'prescription.create': '开具处方',
  'prescription.void': '作废处方',
  'charge.confirm': '确认收费',
  'charge.refund': '处方退费',
  'pharmacy.dispense': '药房发药',
  'stock.receive': '药品入库',
  'drug.create': '新增药品',
  'drug.update': '更新药品',
  'drug.import': '批量导入',
  'schedule.save': '维护排班',
  'settings.update': '更新机构信息',
  'user.create': '新建账户',
  'user.update': '更新账户',
}
