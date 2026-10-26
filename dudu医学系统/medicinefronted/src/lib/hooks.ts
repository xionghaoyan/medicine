import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../context/ToastContext'

export function useDebounce<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useAction<T, V>(action: (variables: V) => Promise<T>, message?: string) {
  const toast = useToast()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      // Let the caller close its form before a refreshed queue can unmount it.
      void queryClient.invalidateQueries()
      if (message) toast(message)
    },
    onError: (error: Error) => toast(error.message, 'error'),
  })
}
