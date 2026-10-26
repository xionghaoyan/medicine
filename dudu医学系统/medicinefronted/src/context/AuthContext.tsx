import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { User } from '../api/types'

interface AuthValue {
  user: User | null
  loading: boolean
  connectionError: string
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState('')
  const queryClient = useQueryClient()
  useEffect(() => {
    let active = true
    api
      .get<User>('/auth/me')
      .then((value) => {
        if (active) setUser(value)
      })
      .catch((error) => {
        if (active && (!(error instanceof ApiError) || error.status !== 401))
          setConnectionError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    const expired = () => {
      setUser(null)
      queryClient.clear()
    }
    window.addEventListener('dudu:unauthorized', expired)
    return () => window.removeEventListener('dudu:unauthorized', expired)
  }, [queryClient])
  const login = useCallback(
    async (username: string, password: string) => {
      const value = await api.post<User>('/auth/login', { username, password })
      queryClient.clear()
      setConnectionError('')
      setUser(value)
    },
    [queryClient],
  )
  const logout = useCallback(async () => {
    await api.post('/auth/logout')
    setUser(null)
    queryClient.clear()
  }, [queryClient])
  return (
    <AuthContext.Provider value={{ user, loading, connectionError, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}
