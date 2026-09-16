import axios, { type InternalAxiosRequestConfig } from 'axios'

type TokenGetter = (opts?: { skipCache?: boolean }) => Promise<string | null>

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

let _getToken: TokenGetter | null = null

export function setTokenGetter(getter: TokenGetter | null) {
  _getToken = getter
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api',
})

apiClient.interceptors.request.use(async (config) => {
  if (_getToken) {
    const token = await _getToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (r) => r,
  async (error) => {
    const config = error.config as RetriableConfig | undefined
    if (error.response?.status === 401 && config && !config._retried && _getToken) {
      config._retried = true
      try {
        const fresh = await _getToken({ skipCache: true })
        if (fresh) {
          config.headers = config.headers ?? {}
          config.headers.Authorization = `Bearer ${fresh}`
          return apiClient.request(config)
        }
      } catch {
        /* fall through to the rejection below */
      }
    }
    return Promise.reject(error)
  },
)
