const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const ACCESS_KEY = 'chat_access_token'
const REFRESH_KEY = 'chat_refresh_token'
const USER_KEY = 'chat_user'

export function getStoredSession() {
  const access = localStorage.getItem(ACCESS_KEY)
  const refresh = localStorage.getItem(REFRESH_KEY)
  const rawUser = localStorage.getItem(USER_KEY)

  if (!access || !refresh || !rawUser) return null

  try {
    return { access, refresh, user: JSON.parse(rawUser) }
  } catch {
    clearSession()
    return null
  }
}

export function saveSession({ access, refresh, user }) {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY)
}

function formatApiError(data, fallback) {
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (data.detail) return data.detail
  if (data.error) return data.error
  if (data.message) return data.message

  const first = Object.entries(data)[0]
  if (!first) return fallback

  const [field, value] = first
  const text = Array.isArray(value) ? value[0] : value
  return `${field}: ${typeof text === 'string' ? text : fallback}`
}

async function parseResponse(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function refreshAccessToken() {
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) throw new Error('Session expired. Please log in again.')

  const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })

  const data = await parseResponse(response)

  if (!response.ok || !data?.access) {
    clearSession()
    throw new Error('Session expired. Please log in again.')
  }

  localStorage.setItem(ACCESS_KEY, data.access)
  if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh)
  return data.access
}

async function request(path, options = {}, retry = true) {
  const { auth = true, headers = {}, ...fetchOptions } = options
  const requestHeaders = { ...headers }

  if (fetchOptions.body && !(fetchOptions.body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const access = getAccessToken()
    if (access) requestHeaders.Authorization = `Bearer ${access}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers: requestHeaders,
  })

  if (response.status === 401 && auth && retry) {
    await refreshAccessToken()
    return request(path, options, false)
  }

  const data = await parseResponse(response)

  if (!response.ok) {
    throw new Error(formatApiError(data, `Request failed (${response.status})`))
  }

  return data
}

export const api = {
  async login(credentials) {
    return request('/auth/login/', {
      method: 'POST',
      auth: false,
      body: JSON.stringify(credentials),
    })
  },

  async register(payload) {
    return request('/auth/register/', {
      method: 'POST',
      auth: false,
      body: JSON.stringify(payload),
    })
  },

  async logout() {
    const refresh = localStorage.getItem(REFRESH_KEY)
    if (!refresh) return

    return request('/auth/logout/', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ refresh }),
    })
  },

  async getConversations() {
    return request('/chat/conversation/')
  },

  async getMessages(conversationId) {
    return request(`/chat/conversation/${conversationId}/messages/`)
  },

  async sendMessage(conversationId, content) {
    return request(`/chat/conversation/${conversationId}/messages/`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  },
}
