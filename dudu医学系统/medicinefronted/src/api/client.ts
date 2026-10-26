type Params = Record<string, string | number | boolean | null | undefined>
const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

export class ApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code = 'REQUEST_FAILED') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function url(path: string, params?: Params) {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  return `${BASE}${path}${search.size ? `?${search}` : ''}`
}

async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  params?: Params,
): Promise<T> {
  const isForm = body instanceof FormData
  let response: Response
  try {
    response = await fetch(url(path, params), {
      method,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'his-web',
        ...(!isForm && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('暂时无法连接服务，请检查后端是否已启动', 0)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event('dudu:unauthorized'))
    const details = data?.error?.details as { field: string; message: string }[] | undefined
    const message = details?.length
      ? `${data.error.message}：${details.map((item) => `${item.field} ${item.message}`).join('；')}`
      : data?.error?.message
    throw new ApiError(
      message || `请求失败（${response.status}），请稍后重试`,
      response.status,
      data?.error?.code,
    )
  }
  return data as T
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>(path, 'GET', undefined, params),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  patch: <T>(path: string, body: unknown) => request<T>(path, 'PATCH', body),
  put: <T>(path: string, body: unknown) => request<T>(path, 'PUT', body),
}

export async function download(path: string, filename: string, params?: Params) {
  const response = await fetch(url(path, params), { credentials: 'include' })
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('dudu:unauthorized'))
    const data = await response.json().catch(() => null)
    throw new ApiError(data?.error?.message || '文件下载失败', response.status)
  }
  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
