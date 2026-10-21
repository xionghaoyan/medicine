import type { ReactNode } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import type { Role } from './api/types'
import { Layout } from './components/Layout'
import { Brand, Button } from './components/ui'
import { useAuth } from './context/AuthContext'
import { Audit } from './pages/Audit'
import { Consultations } from './pages/Consultations'
import { Dashboard } from './pages/Dashboard'
import { Inventory } from './pages/Inventory'
import { Login } from './pages/Login'
import { Patients } from './pages/Patients'
import { Registrations } from './pages/Registrations'
import { Reports } from './pages/Reports'
import { Schedules } from './pages/Schedules'
import { Settings } from './pages/Settings'
import { Settlement } from './pages/Settlement'

function Allowed({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <Unavailable title="当前角色无权访问此工作区" />
  return children
}

function Unavailable({ title = '没有找到这个页面' }: { title?: string }) {
  const navigate = useNavigate()
  return (
    <section className="panel unavailable-page">
      <ShieldX size={44} strokeWidth={1.2} />
      <h1>{title}</h1>
      <p>请返回工作台，或联系管理员核对访问权限。</p>
      <Button onClick={() => navigate('/')}>返回工作台</Button>
    </section>
  )
}

export function App() {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="app-splash">
        <Brand />
        <div className="splash-line" />
        <p>正在连接您的工作空间</p>
      </div>
    )
  if (!user) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route
          path="patients"
          element={
            <Allowed roles={['admin', 'doctor', 'cashier']}>
              <Patients />
            </Allowed>
          }
        />
        <Route
          path="registrations"
          element={
            <Allowed roles={['admin', 'cashier']}>
              <Registrations />
            </Allowed>
          }
        />
        <Route
          path="consultations"
          element={
            <Allowed roles={['admin', 'doctor']}>
              <Consultations />
            </Allowed>
          }
        />
        <Route path="schedules" element={<Schedules />} />
        <Route
          path="billing"
          element={
            <Allowed roles={['admin', 'cashier']}>
              <Settlement key="billing" mode="billing" />
            </Allowed>
          }
        />
        <Route
          path="pharmacy"
          element={
            <Allowed roles={['admin', 'pharmacist']}>
              <Settlement key="pharmacy" mode="pharmacy" />
            </Allowed>
          }
        />
        <Route
          path="inventory"
          element={
            <Allowed roles={['admin', 'pharmacist']}>
              <Inventory />
            </Allowed>
          }
        />
        <Route
          path="reports"
          element={
            <Allowed roles={['admin', 'cashier']}>
              <Reports />
            </Allowed>
          }
        />
        <Route
          path="audit"
          element={
            <Allowed roles={['admin']}>
              <Audit />
            </Allowed>
          }
        />
        <Route
          path="settings"
          element={
            <Allowed roles={['admin']}>
              <Settings />
            </Allowed>
          }
        />
        <Route path="*" element={<Unavailable />} />
      </Route>
    </Routes>
  )
}
