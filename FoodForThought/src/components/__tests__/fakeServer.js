/* ---------------- Fake server ---------------- */
const API_ORIGIN = 'http://localhost:8000'

function createServer() {
  let routes = new Map()
  const calls = []

  const normalise = (base, url) => `${base.replace(API_ORIGIN, '')}${url === '/' ? '' : url.replace(API_ORIGIN, '')}`.replace(/\/$/, '') || '/'

  async function handle(method, path, { params, body, headers }) {
    calls.push({ method, path, params, body, headers })
    const handler = routes.get(`${method} ${path}`)
    if (!handler) throw new Error(`No fake handler for ${method} ${path}`)
    return { data: await handler({ params: params || {}, body: body || {}, path }) }
  }

  return {
    calls,
    on(route, handler) {
      routes.set(route, handler)
      return this
    },
    reset() {
      routes = new Map()
      calls.length = 0
    },
    last(route) {
      return [...calls].reverse().find((c) => `${c.method} ${c.path}` === route)
    },
    count(route) {
      return calls.filter((c) => `${c.method} ${c.path}` === route).length
    },
    normalise,
    handle,
  }
}

export const server = createServer()

export function httpError(status, message) {
  const err = new Error(message)
  err.response = { status, data: { message } }
  return err
}

export function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createInstance({ baseURL = '' } = {}) {
  const requestInterceptors = []
  const responseInterceptors = []

  async function send(method, url, body, config = {}) {
    let request = { headers: {}, ...config, method, url, data: body }
    for (const fn of requestInterceptors) request = fn(request) || request
    const path = server.normalise(baseURL, url)
    try {
      return await server.handle(method, path, { params: request.params, body, headers: request.headers })
    } catch (err) {
      let result = Promise.reject(err)
      for (const { onRejected } of responseInterceptors) if (onRejected) result = result.catch(onRejected)
      return result
    }
  }

  return {
    interceptors: {
      request: { use: (fn) => requestInterceptors.push(fn) },
      response: { use: (onFulfilled, onRejected) => responseInterceptors.push({ onFulfilled, onRejected }) },
    },
    get: (url, config) => send('GET', url, undefined, config),
    delete: (url, config) => send('DELETE', url, undefined, config),
    post: (url, body, config) => send('POST', url, body, config),
    patch: (url, body, config) => send('PATCH', url, body, config),
    put: (url, body, config) => send('PUT', url, body, config),
  }
}

export const axiosModule = { default: { ...createInstance({ baseURL: '' }), create: createInstance } }
