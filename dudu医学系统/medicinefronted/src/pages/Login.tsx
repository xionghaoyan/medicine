import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  HeartPulse,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Wallet,
  Pill,
  Building2,
} from 'lucide-react'
import { api } from '../api/client'
import type { Meta } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { Brand, Button, Notice } from '../components/ui'

export function Login() {
  const { login, connectionError } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/meta'), retry: false })
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="login-page">
      <header className="login-topbar">
        <Brand />
        <span>
          <ShieldCheck size={15} />
          安心协作，从这里开始
        </span>
      </header>
      <main className="login-main">
        <div className="login-intro">
          <span className="login-kicker">
            <i /> A LITTLE CARE. A BETTER DAY.
          </span>
          <h1>
            让诊疗，<span>简单一点。</span>
          </h1>
          <p>从第一声问候，到每一份安心。dudu 连接你的日常医疗工作。</p>
        </div>
        <div className="login-card">
          <section className="login-visual" aria-label="门诊协作流程">
            <div className="visual-topline">
              <span>dudu CARE</span>
              <span>门诊协作空间</span>
            </div>
            <div className="care-illustration" aria-hidden="true">
              <div className="illustration-grid" />
              <div className="care-cross">
                <span />
                <span />
              </div>
              <div className="care-orbit orbit-a" />
              <div className="care-orbit orbit-b" />
              <div className="floating-note note-one">
                <span>
                  <Check size={16} />
                </span>
                <div>
                  <strong>每一步，清晰有序</strong>
                  <small>CONNECTED CARE</small>
                </div>
              </div>
              <div className="floating-note note-two">
                <HeartPulse size={24} />
                <div>
                  <strong>关怀，始终在线</strong>
                  <small>CARE THAT CONNECTS</small>
                </div>
              </div>
              <div className="floating-pill pill-one" />
              <div className="floating-pill pill-two" />
              <span className="illustration-plus plus-one">+</span>
              <span className="illustration-plus plus-two">+</span>
            </div>
            <div className="visual-copy">
              <h2>
                小小工作台，
                <br />
                连接每一份关怀。
              </h2>
              <p>
                患者、医生、收费与药房，
                <br />
                在同一个空间里有序协作。
              </p>
            </div>
            <div className="visual-flow">
              {[
                ['01', '挂号'],
                ['02', '接诊'],
                ['03', '收费'],
                ['04', '发药'],
              ].map(([step, label], index) => (
                <div key={step}>
                  <span>{step}</span>
                  <strong>{label}</strong>
                  {index < 3 && <ArrowRight size={14} />}
                </div>
              ))}
            </div>
          </section>
          <section className="login-form-side">
            <div className="login-hospital">
              <Building2 size={16} />
              {meta.data?.hospital_name || '嘟嘟社区医疗中心'}
            </div>
            <h2>欢迎回来</h2>
            <p className="login-subtitle">登录你的工作账号，开启有序的一天。</p>
            <form onSubmit={submit}>
              <label className="field">
                <span>工作账号</span>
                <div className="login-input">
                  <UserRound size={18} />
                  <input
                    required
                    autoComplete="username"
                    aria-label="工作账号"
                    placeholder="请输入工作账号"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
              </label>
              <label className="field">
                <span>登录密码</span>
                <div className="login-input">
                  <LockKeyhole size={18} />
                  <input
                    required
                    autoComplete="current-password"
                    aria-label="登录密码"
                    type={show ? 'text' : 'password'}
                    placeholder="请输入登录密码"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={show ? '隐藏密码' : '显示密码'}
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              {(error || connectionError) && (
                <Notice tone="warning">{error || connectionError}</Notice>
              )}
              <Button type="submit" loading={pending} className="login-submit">
                登录工作台
                <ArrowRight size={18} />
              </Button>
            </form>
            <div className="login-security">
              <ShieldCheck size={14} />
              安全登录 · 按角色授权访问
            </div>
            {meta.data?.demo_mode && (
              <div className="demo-accounts">
                <div className="demo-accounts-heading">
                  <strong>快速体验</strong>
                  <span>选择身份，填入演示账号</span>
                </div>
                <div className="demo-role-options">
                  {[
                    { account: 'admin', label: '管理员', icon: ShieldCheck },
                    { account: 'doctor', label: '医生', icon: Stethoscope },
                    { account: 'cashier', label: '收费员', icon: Wallet },
                    { account: 'pharmacist', label: '药师', icon: Pill },
                  ].map((item) => (
                    <button
                      key={item.account}
                      type="button"
                      className={username === item.account ? 'selected' : ''}
                      aria-label={'体验' + item.label}
                      onClick={() => {
                        setUsername(item.account)
                        setPassword('DuduDemo2026!')
                        setError('')
                      }}
                    >
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                <p className="demo-password">
                  演示密码 <code>DuduDemo2026!</code>
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
      <footer className="login-footer">
        <span>© 2026 dudu 医疗 · 医学信息系统</span>
        <span>所有患者与诊疗资料均为虚构演示数据</span>
      </footer>
    </div>
  )
}
