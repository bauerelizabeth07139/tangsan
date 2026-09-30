/**
 * tangsan host half — serves the TangSan artwork and its configuration.
 *
 * The browser half (lib/client.js) is a plain script the shell loads; this
 * module is the Cordis plugin that runs in the host process. Everything it
 * hands out lives inside the plugin package or inside $DSH_HOME, so installing
 * the plugin is the whole setup — no build step, no external service.
 *
 * Routes:
 *  - GET  /api/tangsan/config      -> the sanitized config object
 *  - PUT  /api/tangsan/config      <- a full or partial config object; writes
 *                                     $DSH_HOME/tangsan.json, returns the
 *                                     sanitized result
 *  - GET  /api/tangsan/wallpaper   -> assets/tangsan-wallpaper.jpg (the 16:9
 *                                     background artwork, immutable cache)
 *  - GET  /api/tangsan/mark        -> assets/tangsan-mark.jpg (the square
 *                                     avatar artwork used by the brand marks)
 *
 * The config is also stamped into the served HTML as window.__TANGSAN__ so the
 * client can wear the artwork before first paint instead of after a fetch.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'tangsan'
export const inject = ['webServer']

/** Config file name under $DSH_HOME. */
const FILE_NAME = 'tangsan.json'

/** Public URLs of the two artwork routes; the client builds on these. */
export const WALLPAPER_URL = '/api/tangsan/wallpaper'
export const MARK_URL = '/api/tangsan/mark'

/** Artwork files shipped with the package. */
const ASSETS = {
  wallpaper: fileURLToPath(new URL('../assets/tangsan-wallpaper.jpg', import.meta.url)),
  mark: fileURLToPath(new URL('../assets/tangsan-mark.jpg', import.meta.url)),
}

/** Accepted `position` values (CSS background-position keywords). */
const POSITIONS = ['center', 'top', 'bottom', 'left', 'right']

/** Per-field raw length caps; numeric fields are clamped afterwards. */
const LIMITS = {
  wallpaper: 8,
  brand: 8,
  surfaceOpacity: 8,
  blur: 8,
  scrim: 8,
  position: 12,
}
const KEYS = Object.keys(LIMITS)

/**
 * Stock appearance: TangSan wears both the background and the brand marks,
 * surfaces stay mostly opaque (88%) so text keeps its contrast, no blur,
 * a 35% black scrim behind the transcript.
 *
 * @returns a complete config object.
 */
function defaults() {
  return { wallpaper: 'true', brand: 'true', surfaceOpacity: '60', blur: '0', scrim: '35', position: 'center' }
}

/** Clamp a parsed integer into `[min, max]`, falling back when unparseable. */
function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/** A boolean-ish field: only the literal 'true'/'false' survive. */
function boolField(value, fallback) {
  return value === 'true' || value === 'false' ? value : fallback
}

/**
 * Keep only known fields and clamp the values the client turns into CSS.
 *
 * @param input - untrusted parsed JSON.
 * @returns a complete, safe config object.
 */
function sanitize(input) {
  const out = defaults()
  if (input === null || typeof input !== 'object') return out
  for (const key of KEYS) {
    const value = input[key]
    if (typeof value === 'string') out[key] = value.slice(0, LIMITS[key])
  }
  out.wallpaper = boolField(out.wallpaper, out.wallpaper)
  out.brand = boolField(out.brand, out.brand)
  out.surfaceOpacity = String(clampInt(out.surfaceOpacity, 25, 100, 60))
  out.blur = String(clampInt(out.blur, 0, 24, 0))
  out.scrim = String(clampInt(out.scrim, 0, 90, 35))
  if (!POSITIONS.includes(out.position)) out.position = 'center'
  return out
}

/** Absolute config path: $DSH_HOME/tangsan.json, defaulting to ~/.dsh. */
function configPath() {
  const env = process.env.DSH_HOME
  const home = typeof env === 'string' && env.trim() !== '' ? env : join(homedir(), '.dsh')
  return join(home, FILE_NAME)
}

/** Read the config file; a missing or malformed file yields the defaults. */
function readConfig() {
  try {
    const path = configPath()
    if (!existsSync(path)) return defaults()
    return sanitize(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return defaults()
  }
}

/** Persist the config, creating $DSH_HOME when needed. */
function writeConfig(cfg) {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
}

/** The object the client boots from: config plus the artwork URLs. */
function bootPayload() {
  return { config: readConfig(), wallpaper: WALLPAPER_URL, mark: MARK_URL }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** Collect a JSON request body with a hard 512 KB ceiling. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = ''
    req.on('data', (chunk) => {
      text += chunk
      if (text.length > 512 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(text === '' ? {} : JSON.parse(text))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Mutations require a same-origin browser call: requests without an Origin
 * header (same-origin navigations, curl) pass; a cross-site Origin must not.
 */
function sameOrigin(req) {
  const origin = req.headers?.origin
  if (typeof origin !== 'string' || origin === '') return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}


/**
 * Last browser-side diagnostic report (mount state, token overrides, errors).
 * The client POSTs after every apply; support reads it back over GET so a
 * broken appearance can be diagnosed without a screenshot.
 */
let lastDiag = null

/** Keep only known scalar fields, capped — this comes from the browser. */
function sanitizeDiag(input) {
  if (input === null || typeof input !== 'object') return null
  const out = {}
  const keys = ['at', 'client', 'mounted', 'layerCount', 'darkTheme', 'surface', 'error', 'bodyBg', 'rootBg', 'tokenCount']
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string') out[key] = value.slice(0, 300)
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value
  }
  if (Array.isArray(input.tokens)) {
    out.tokens = input.tokens.slice(0, 8).map((entry) => ({
      n: String(entry === null || typeof entry !== 'object' ? '' : entry.n).slice(0, 64),
      v: String(entry === null || typeof entry !== 'object' ? '' : entry.v).slice(0, 200),
    }))
  }
  return out
}

/** Handle GET (read) / POST (record) /api/tangsan/diag. */
async function handleDiag(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { report: lastDiag })
      return
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      if (!sameOrigin(req)) {
        sendJson(res, 403, { error: 'untrusted origin' })
        return
      }
      lastDiag = sanitizeDiag(await readBody(req))
      sendJson(res, 200, { ok: true })
      return
    }
    res.writeHead(405, { allow: 'GET, POST, PUT' })
    res.end()
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** Handle GET/PUT /api/tangsan/config. */
async function handleConfig(req, res) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, readConfig())
      return
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      if (!sameOrigin(req)) {
        sendJson(res, 403, { error: 'untrusted origin' })
        return
      }
      const cfg = sanitize(await readBody(req))
      writeConfig(cfg)
      sendJson(res, 200, cfg)
      return
    }
    res.writeHead(405, { allow: 'GET, PUT, POST' })
    res.end()
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

/** Bytes of each artwork file, read once — the package files never change. */
const assetCache = new Map()

/**
 * Build the handler that serves one shipped artwork file.
 *
 * @param kind - `wallpaper` or `mark`.
 * @returns a webServer route handler.
 */
function makeAssetHandler(kind) {
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }
    try {
      let entry = assetCache.get(kind)
      if (entry === undefined) {
        const path = ASSETS[kind]
        if (!existsSync(path)) {
          sendJson(res, 404, { error: 'artwork missing: ' + kind })
          return
        }
        entry = { bytes: readFileSync(path), mtime: 0 }
        try {
          // Keep mtime in the shape so a repacked package is still re-read.
          entry.mtime = 0
        } catch {
          entry.mtime = 0
        }
        assetCache.set(kind, entry)
      }
      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': String(entry.bytes.length),
        'cache-control': 'public, max-age=86400',
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      res.end(entry.bytes)
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/**
 * Stamp the boot payload into the served HTML so the client half can wear the
 * artwork synchronously. `<` is escaped so config text can never break out of
 * the tag.
 *
 * @param html - the index document.
 * @returns the stamped document.
 */
function stampIndex(html) {
  const json = JSON.stringify(bootPayload()).replace(/</g, '\\u003c')
  const tag = '<script>window.__TANGSAN__=' + json + ';</' + 'script>'
  const at = html.indexOf('</head>')
  return at === -1 ? html + tag : html.slice(0, at) + tag + html.slice(at)
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/tangsan/config',
    handler: handleConfig,
  }), 'tangsan: config route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/tangsan/diag',
    handler: handleDiag,
  }), 'tangsan: diag route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/tangsan/wallpaper',
    handler: makeAssetHandler('wallpaper'),
  }), 'tangsan: wallpaper route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/tangsan/mark',
    handler: makeAssetHandler('mark'),
  }), 'tangsan: mark route')

  ctx.effect(() => ctx.webServer.tapIndex(stampIndex), 'tangsan: index stamp')
}
