import axios, { type AxiosRequestConfig } from 'axios'
import type { ApiResult } from '@/types'

const TOKEN_KEY = 'jobfit_token'

export const tokenStorage = {
  get(): string {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  },
  set(token: string): void {
    localStorage.setItem(TOKEN_KEY, token)
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY)
  }
}

function redirectToLogin(): void {
  tokenStorage.clear()
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

const http = axios.create({
  baseURL: '/api',
  timeout: 20000
})

http.interceptors.request.use((config) => {
  const token = tokenStorage.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResult<unknown>
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body.data as never
      }
      if (body.code === 1002) {
        redirectToLogin()
      }
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response.data
  },
  (error) => {
    if (error?.response?.status === 401) {
      redirectToLogin()
    }
    const message = error?.response?.data?.message || error?.message || '网络异常，请稍后重试'
    return Promise.reject(new Error(message))
  }
)

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const data = await http.request<unknown, unknown>(config)
  return data as T
}
