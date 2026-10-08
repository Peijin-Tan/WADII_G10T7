export async function fetchCsrf() {
  const res = await fetch('/csrf-token', { credentials: 'include' })
  if (!res.ok) return null
  const json = await res.json()
  return json.csrfToken
}

async function post(path, body) {
  const token = await fetchCsrf()
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token || ''
      },
      body: JSON.stringify(body)
    })

    // read response text first to handle non-JSON errors
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch (e) { data = null }

    if (!res.ok) {
      console.error('API error', path, res.status, text)
      // return structured error so callers can display message
      return data || { message: text || `Request failed with status ${res.status}`, status: res.status }
    }

    return data
  } catch (err) {
    console.error('Network error while POST', path, err)
    throw err
  }
}

export function saveUser(user) {
  localStorage.setItem('user', JSON.stringify(user))
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
}

export function saveToken(token) { if (token) localStorage.setItem('token', token) }
export function getToken() { return localStorage.getItem('token') }
export function clearToken() { localStorage.removeItem('token') }

export function clearUser() { localStorage.removeItem('user'); clearToken() }

export function register(data) {
  return post('/auth/register', data)
}

export function login(data) {
  return post('/auth/login', data)
}

export async function logout() {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
  } catch (e) {}
  clearUser()
}
