// fakeServer.js
// A stand-in for axios.create() used by the Planner, Shopping List, Pantry and App tests.
// It has NO imports on purpose: vi.mock('axios', ...) loads this file while the page under test
// is still being imported, so it must not import any app code itself.
//
//   vi.mock('axios', async () => (await import('./fakeServer')).axiosModule)
//
// Each test describes the server it needs:  server.on('GET /planner', ({ params }) => data)
// A request with no handler fails the test, so a wrong URL can never pass silently.

/* ---------------- Fake server ---------------- */
const API_ORIGIN = 'http://localhost:8000'

function createServer() {
  let routes = new Map()
  const calls = [] // every request the page sent: { method, path, params, body, headers }

  // Strip the origin and any trailing slash: 'http://localhost:8000/planner' + '/' -> '/planner'
  const normalise = (base, url) => `${base.replace(API_ORIGIN, '')}${url === '/' ? '' : url}`.replace(/\/$/, '') || '/'

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
    // the most recent request to a route, e.g. server.last('PATCH /planner/entries/e1')
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

// What an Express error looks like to axios: err.response.status + err.response.data.message
export function httpError(status, message) {
  const err = new Error(message)
  err.response = { status, data: { message } }
  return err
}

// A promise the test resolves itself, to check what the page shows WHILE a request is still running
export function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Stand-in for axios.create(): same methods and interceptors that createApi() uses
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
      // run createApi's error interceptor (the real 401 -> logout code)
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

// axios itself (login.vue calls axios.post('/auth/login') directly) works like an instance with no base URL
export const axiosModule = { default: { ...createInstance({ baseURL: '' }), create: createInstance } }
