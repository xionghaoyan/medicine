import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleCheck, CircleAlert, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  message: string
  type: ToastType
}
const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const sequence = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++sequence.current
    setItems((previous) => [...previous.slice(-3), { id, message, type }])
    timers.current.push(
      setTimeout(
        () => setItems((previous) => previous.filter((item) => item.id !== id)),
        type === 'error' ? 7000 : 4200,
      ),
    )
  }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <div
            className={`toast toast-${item.type}`}
            key={item.id}
            role={item.type === 'error' ? 'alert' : 'status'}
          >
            {item.type === 'error' ? <CircleAlert size={20} /> : <CircleCheck size={20} />}
            <span>{item.message}</span>
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => setItems((previous) => previous.filter((t) => t.id !== item.id))}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
