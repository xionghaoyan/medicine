import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Eye,
  EyeOff,
  HeartPulse,
  Leaf,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  UserRound,
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
      <section className="login-story">
        <Brand light />
        <div className="story-content">
          <div className="story-eyebrow">
            <Leaf size={16} /> CONNECTED CARE, EVERY DAY
          </div>
          <h1>
            让每一次诊疗，
            <br />
            都有温度、<em>有秩序。</em>
          </h1>
          <p>
            连接患者、医生与药房，
            <br />
            把时间留给更重要的关怀。
          </p>
          <div className="login-art" aria-hidden="true">
            <div className="login-art-orbit orbit-one" />
            <div className="login-art-orbit orbit-two" />
            <div className="login-art-center">
              <HeartPulse size={74} strokeWidth={1.2} />
            </div>
            <span className="art-node node-one">
              <UserRound size={24} />
            </span>
            <span className="art-node node-two">
              <Stethoscope size={27} />
            </span>
            <span className="art-node node-three">
              <ShieldCheck size={23} />
            </span>
            <div className="art-caption">
              <i /> CARE, WITH CLARITY.
            </div>
          </div>
        </div>
        <footer>
          <span>青禾医疗 · 门诊协作平台</span>
          <small>QINGHE HIS © 2026</small>
        </footer>
      </section>
      <section className="login-form-side">
        <div className="login-mobile-brand">
          <Brand />
        </div>
        <span className="login-environment">
          <i /> {meta.data?.hospital_name || '青禾社区医疗中心'}
        </span>
        <div className="login-form-wrap">
          <div className="eyebrow">WELCOME BACK</div>
          <h2>欢迎回来</h2>
          <p className="login-subtitle">登录您的工作空间，开启有序的一天。</p>
          <form onSubmit={submit}>
            <label className="field">
              <span>工作账号</span>
              <div className="login-input">
                <UserRound size={18} />
                <input
                  required
                  autoComplete="username"
                  aria-label="工作账号"
                  placeholder="请输入账号"
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
                  placeholder="请输入密码"
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
            <ShieldCheck size={15} /> 安全会话保护 · 按角色授权访问
          </div>
          {meta.data?.demo_mode && (
            <div className="demo-accounts">
              <div>
                <strong>快速体验</strong>
                <span>点击角色填入演示账号</span>
              </div>
              <div className="demo-role-options">
                {[
                  ['admin', '管理员'],
                  ['doctor', '医生'],
                  ['cashier', '收费员'],
                  ['pharmacist', '药师'],
                ].map(([account, label]) => (
                  <button
                    key={account}
                    className={username === account ? 'selected' : ''}
                    onClick={() => {
                      setUsername(account)
                      setPassword('MedDemo2026!')
                      setError('')
                    }}
                  >
                    {label}
                    <small>{account}</small>
                  </button>
                ))}
              </div>
              <small>
                演示密码：<code>MedDemo2026!</code> · 数据均为虚构
              </small>
            </div>
          )}
        </div>
        <footer className="login-bottom">医疗协作，从清晰开始。</footer>
      </section>
    </div>
  )
}
