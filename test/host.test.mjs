/**
 * Host-half test: boots lib/index.js against a stubbed `webServer` context and
 * exercises every route it registers, the config sanitizer, the artwork files
 * and the HTML boot stamp.
 *
 * Run with: npm test  (node test/host.test.mjs)
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const home = mkdtempSync(join(tmpdir(), 'tangsan-test-'))
process.env.DSH_HOME = home

/** Minimal res stand-in capturing status, headers and body bytes. */
function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    ended: false,
    writeHead(status, headers) {
      this.statusCode = status
      this.headers = headers ?? {}
    },
    end(chunk) {
      if (chunk !== undefined) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      this.ended = true
    },
    destroy() {},
    text() {
      return Buffer.concat(this.chunks).toString('utf8')
    },
    bytes() {
      return Buffer.concat(this.chunks)
    },
  }
}

/** Minimal req stand-in whose body events fire as soon as they are wired. */
function fakeReq(method, body = '', headers = {}) {
  const text = body
  return {
    method,
    headers: { host: '127.0.0.1:19387', ...headers },
    on(event, cb) {
      if (event === 'data' && text !== '') cb(Buffer.from(text))
      if (event === 'end') cb()
    },
    destroy() {},
  }
}

const routes = new Map()
const taps = []
const effects = []
const ctx = {
  effect(fn, label) {
    effects.push(label)
    return fn()
  },
  webServer: {
    register(spec) {
      assert.equal(spec.kind, 'exact')
      routes.set(spec.path, spec.handler)
    },
    tapIndex(fn) {
      taps.push(fn)
      return () => {}
    },
  },
}

const host = await import('../lib/index.js')
assert.equal(host.name, 'tangsan')
assert.deepEqual(host.inject, ['webServer'])
host.apply(ctx)

assert.deepEqual([...routes.keys()].sort(), [
  '/api/tangsan/config',
  '/api/tangsan/diag',
  '/api/tangsan/mark',
  '/api/tangsan/wallpaper',
])
assert.equal(taps.length, 1)
assert.equal(effects.length, 5)

// --- GET config: defaults before anything is written -------------------------
{
  const res = fakeRes()
  await routes.get('/api/tangsan/config')(fakeReq('GET'), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.text()), {
    wallpaper: 'true',
    brand: 'true',
    surfaceOpacity: '60',
    blur: '0',
    scrim: '35',
    position: 'center',
  })
}

// --- PUT config: unknown keys dropped, numeric fields clamped ----------------
{
  const res = fakeRes()
  const body = JSON.stringify({
    wallpaper: 'false',
    brand: 'false',
    surfaceOpacity: '999',
    blur: '99',
    scrim: '-5',
    position: 'diagonal',
    exfiltrate: 'should not survive',
  })
  await routes.get('/api/tangsan/config')(fakeReq('PUT', body, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.text()), {
    wallpaper: 'false',
    brand: 'false',
    surfaceOpacity: '100',
    blur: '24',
    scrim: '0',
    position: 'center',
  })
}

// --- the sanitized config is what lands on disk ------------------------------
{
  const saved = JSON.parse(readFileSync(join(home, 'tangsan.json'), 'utf8'))
  assert.equal(saved.surfaceOpacity, '100')
  assert.equal('exfiltrate' in saved, false)
}

// --- the config write is atomic: no temporary sibling survives ----------------
{
  assert.deepEqual(
    readdirSync(home).filter((name) => name.endsWith('.tmp')),
    [],
    'the config write leaves no temporary file behind',
  )
}

// --- cross-site writes are refused ------------------------------------------
{
  const res = fakeRes()
  await routes.get('/api/tangsan/config')(
    fakeReq('PUT', '{}', { origin: 'https://evil.example' }),
    res,
  )
  assert.equal(res.statusCode, 403)
}

// --- both artwork routes serve real JPEG bytes -------------------------------
for (const path of ['/api/tangsan/wallpaper', '/api/tangsan/mark']) {
  const res = fakeRes()
  await routes.get(path)(fakeReq('GET'), res)
  assert.equal(res.statusCode, 200, path)
  assert.equal(res.headers['content-type'], 'image/jpeg', path)
  const bytes = res.bytes()
  assert.ok(bytes.length > 1000, path)
  assert.equal(bytes[0], 0xff, path)
  assert.equal(bytes[1], 0xd8, path)
}

// --- the artwork files really are the shipped ones ---------------------------
{
  const wallpaper = readFileSync(join(here, '..', 'assets', 'tangsan-wallpaper.jpg'))
  assert.ok(wallpaper.length > 10000)
  const mark = readFileSync(join(here, '..', 'assets', 'tangsan-mark.jpg'))
  assert.ok(mark.length > 10000)
}

// --- HEAD returns headers without a body -------------------------------------
{
  const res = fakeRes()
  await routes.get('/api/tangsan/mark')(fakeReq('HEAD'), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.bytes().length, 0)
}

// --- the browser diagnostic round-trips and is sanitized ---------------------
{
  const post = fakeRes()
  const body = JSON.stringify({
    at: 123,
    client: 'v2',
    mounted: true,
    layerCount: 1,
    darkTheme: false,
    surface: 'true/60/35',
    tokenCount: 1,
    tokens: [{ n: '--dsw-alias-bg-base', v: 'color-mix(in srgb,#fff 60%,transparent)' }],
    error: '',
    injected: 'x'.repeat(4000),
    deep: { nope: true },
  })
  await routes.get('/api/tangsan/diag')(fakeReq('POST', body), post)
  assert.equal(post.statusCode, 200)

  const get = fakeRes()
  await routes.get('/api/tangsan/diag')(fakeReq('GET'), get)
  const report = JSON.parse(get.text()).report
  assert.equal(report.mounted, true)
  assert.equal(report.client, 'v2')
  assert.equal(report.tokenCount, 1)
  assert.equal(report.tokens.length, 1)
  assert.ok(report.tokens[0].v.startsWith('color-mix'))
  assert.equal('injected' in report, false, 'unknown fields are dropped')
  assert.equal('deep' in report, false, 'unknown objects are dropped')
}

// --- the boot stamp carries config and artwork URLs --------------------------
{
  const html = taps[0]('<html><head><title>x</title></head><body></body></html>')
  const match = html.match(/<script>window\.__TANGSAN__=(.*?);<\/script>/)
  assert.ok(match, 'boot script is stamped before </head>')
  assert.equal(html.indexOf('</script>'), html.lastIndexOf('</script>'))
  const payload = JSON.parse(match[1])
  assert.equal(payload.config.wallpaper, 'false')
  assert.equal(payload.wallpaper, '/api/tangsan/wallpaper')
  assert.equal(payload.mark, '/api/tangsan/mark')
  assert.ok(html.indexOf('</head>') > html.indexOf('window.__TANGSAN__'))
}

// --- malformed config file falls back to defaults ----------------------------
{
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(home, 'tangsan.json'), '{ not json')
  const res = fakeRes()
  await routes.get('/api/tangsan/config')(fakeReq('GET'), res)
  assert.deepEqual(JSON.parse(res.text()), {
    wallpaper: 'true',
    brand: 'true',
    surfaceOpacity: '60',
    blur: '0',
    scrim: '35',
    position: 'center',
  })
}

rmSync(home, { recursive: true, force: true })
console.log('tangsan host tests passed')
