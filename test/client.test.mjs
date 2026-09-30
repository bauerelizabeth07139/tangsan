/**
 * Client-half smoke test.
 *
 * The client is a browser script, so this harness stubs just enough of the
 * browser (`window.__ModuleLoader__`, a tiny DOM, `getComputedStyle`,
 * `MutationObserver`, `fetch`) plus a minimal React, then runs the real
 * `apply()` from lib/client.js and asserts:
 *   - the wallpaper layer mounts as the first child of <body>
 *   - the shell surface tokens are faded with color-mix and the root
 *     background is cleared (and stripped again when the wallpaper is off)
 *   - the brand-mark and settings slots are seated
 *   - the settings component renders and its Save button round-trips
 *
 * Run with: node test/client.test.mjs
 */
import assert from 'node:assert/strict'

// --- tiny DOM ----------------------------------------------------------------

function makeStyle(owner) {
  const style = {
    setProperty(name, value) {
      owner.styleProps[name] = String(value)
    },
    removeProperty(name) {
      delete owner.styleProps[name]
    },
    getPropertyValue(name) {
      return owner.styleProps[name] ?? ''
    },
  }
  // The client mixes `style.foo =` assignments with setProperty; map the
  // camelCase names it uses onto the same kebab-case store.
  const aliases = {
    backgroundImage: 'background-image',
    backgroundPosition: 'background-position',
    background: 'background',
    backgroundColor: 'background-color',
    filter: 'filter',
    inset: 'inset',
  }
  for (const [property, kebab] of Object.entries(aliases)) {
    Object.defineProperty(style, property, {
      get() {
        return owner.styleProps[kebab] ?? ''
      },
      set(value) {
        owner.styleProps[kebab] = String(value)
      },
      enumerable: true,
      configurable: true,
    })
  }
  return style
}

function makeEl(tag) {
  const node = {
    tagName: tag,
    children: [],
    attrs: {},
    styleProps: {},
    textContent: '',
    isConnected: true,
    parentNode: null,
    setAttribute(name, value) {
      this.attrs[name] = String(value)
    },
    getAttribute(name) {
      return this.attrs[name] ?? null
    },
    appendChild(child) {
      child.parentNode = this
      this.children.push(child)
      return child
    },
    insertBefore(child, ref) {
      child.parentNode = this
      const at = this.children.indexOf(ref)
      if (at < 0) this.children.push(child)
      else this.children.splice(at, 0, child)
      return child
    },
    remove() {
      const parent = this.parentNode
      if (parent !== null) {
        const at = parent.children.indexOf(this)
        if (at >= 0) parent.children.splice(at, 1)
      }
      this.isConnected = false
      this.parentNode = null
    },
    get firstChild() {
      return this.children.length > 0 ? this.children[0] : null
    },
  }
  node.style = makeStyle(node)
  return node
}

/** The palette the shell would define on <body>. */
const THEME = {
  '--dsw-alias-bg-base': '#0f1115',
  '--dsw-specific-sidebar-fill': '#151922',
  '--dsw-alias-bg-layer-1': 'rgb(28 33 44 / 90%)',
  '--dsw-alias-bg-layer-2': 'rgba(36,42,56,.8)',
  '--dsw-alias-brand-primary': '#4d6bfe',
}

const head = makeEl('head')
const documentElement = makeEl('html')
const body = makeEl('body')
documentElement.children.push(body)
body.parentNode = documentElement

const listeners = new Map()

const document = {
  head,
  body,
  documentElement,
  createElement: (tag) => makeEl(tag),
  addEventListener(type, cb) {
    listeners.set(type, cb)
  },
  removeEventListener(type) {
    listeners.delete(type)
  },
}

/**
 * Computed custom properties: the element's own inline value wins, otherwise
 * the palette — which is exactly what makes the "remove overrides, read,
 * restore" dance in the client observable here.
 */
function getComputedStyle(element) {
  return {
    getPropertyValue(name) {
      if (element !== null && element.styleProps[name] !== undefined) return element.styleProps[name]
      return THEME[name] ?? ''
    },
  }
}

class MutationObserverStub {
  constructor(callback) {
    this.callback = callback
    this.active = false
  }
  observe() {
    this.active = true
  }
  disconnect() {
    this.active = false
  }
}

// --- module loader / React / fetch stubs ------------------------------------

let loaded = null
const window = {
  __ModuleLoader__: {
    load(spec) {
      loaded = spec
    },
  },
  __TANGSAN__: {
    config: { wallpaper: 'true', brand: 'true', surfaceOpacity: '88', blur: '0', scrim: '35', position: 'center' },
    wallpaper: '/api/tangsan/wallpaper',
    mark: '/api/tangsan/mark',
  },
}

let stateOverride = null
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [stateOverride === null ? initial : stateOverride, () => {}],
  useEffect: () => {},
}

const puts = []
const fetchStub = (url, options) => {
  if (options !== undefined && options.method === 'PUT') {
    puts.push(JSON.parse(options.body))
    return Promise.resolve({ json: () => Promise.resolve(JSON.parse(options.body)) })
  }
  return Promise.resolve({
    json: () => Promise.resolve(window.__TANGSAN__.config),
  })
}

Object.assign(globalThis, { window, document, getComputedStyle, MutationObserver: MutationObserverStub, fetch: fetchStub })

// --- load the real client ----------------------------------------------------

await import('../lib/client.js')
assert.ok(loaded, 'client registers itself with __ModuleLoader__')
assert.equal(loaded.id, 'tangsan')

const seats = new Map()
const slots = {
  inject(slotName, factory) {
    seats.set(slotName, factory())
    return () => seats.delete(slotName)
  },
  register(meta, component) {
    return { meta, component }
  },
}

const plugin = loaded.factory((name) => {
  assert.equal(name, 'react')
  return React
})
assert.equal(plugin.name, 'tangsan')
assert.deepEqual(plugin.inject, ['slots'])

const dispose = plugin.apply({ slots })

// --- slots -------------------------------------------------------------------
assert.ok(seats.has('sidebar.brand.mark'), 'sidebar mark seated')
assert.ok(seats.has('conversation.hero.brand.mark'), 'hero mark seated')
assert.ok(seats.has('settings.section'), 'settings section seated')
assert.equal(seats.get('settings.section').meta.id, 'tangsan')
assert.equal(seats.get('settings.section').meta.label, '唐三美化 TangSan')

const markEl = seats.get('sidebar.brand.mark').component({ size: 28 })
assert.equal(markEl.type, 'img')
assert.equal(markEl.props.src, '/api/tangsan/mark')
assert.equal(markEl.props.style.width, '28px')
assert.equal(markEl.props.style.borderRadius, '50%')

// --- wallpaper layer ---------------------------------------------------------
assert.equal(body.children.length, 1, 'layer is the first child of body')
const layer = body.children[0]
assert.equal(layer.attrs['data-dsh-tangsan-layer'], '')
assert.equal(layer.attrs['aria-hidden'], 'true')
assert.equal(layer.children.length, 2)
const [image, scrim] = layer.children
assert.match(image.styleProps['background-image'], /\/api\/tangsan\/wallpaper/)
assert.equal(image.styleProps['background-size'], undefined, 'sizing comes from the stylesheet, not an inline override')
assert.match(scrim.styleProps.background, /^rgba\(0,0,0,0\.350\)$/)

// --- surface fade ------------------------------------------------------------
assert.equal(
  body.styleProps['--dsw-alias-bg-base'],
  'color-mix(in srgb,#0f1115 88%,transparent)',
  'canvas token faded to the configured opacity',
)
assert.equal(
  body.styleProps['--dsw-alias-bg-layer-1'],
  'color-mix(in srgb,rgb(28 33 44 / 90%) 100%,transparent)',
  'floating layers gain lift on top of the setting',
)
assert.equal(documentElement.styleProps['background-color'], 'transparent', 'root background cleared for the layer')

// --- settings component renders ---------------------------------------------
stateOverride = { wallpaper: 'true', brand: 'true', surfaceOpacity: '70', blur: '6', scrim: '40', position: 'right' }
const section = seats.get('settings.section').component()
stateOverride = null
const classNames = []
const walk = (node) => {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach(walk)
    return
  }
  if (typeof node.type !== 'undefined') {
    if (node.props.className) classNames.push(node.props.className)
    walk(node.children)
  }
}
walk(section)
assert.ok(classNames.includes('dsh-tangsan-wrap'))
assert.ok(classNames.includes('dsh-tangsan-preview'))
assert.ok(classNames.includes('dsh-tangsan-actions'))

// --- the blur setting reaches the layer --------------------------------------
stateOverride = { wallpaper: 'true', brand: 'true', surfaceOpacity: '70', blur: '6', scrim: '40', position: 'right' }
const sectionWithBlur = seats.get('settings.section').component()
stateOverride = null
let saveButton = null
;(function findButton(node) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach(findButton)
  if (typeof node.type !== 'undefined') {
    if (node.type === 'button' && Array.isArray(node.children) && node.children.includes('保存并应用')) saveButton = node
    findButton(node.children)
  }
})(sectionWithBlur)
assert.ok(saveButton, 'save button exists')

// Save round-trips through PUT and re-applies locally.
saveButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(puts.length, 1)
assert.equal(puts[0].blur, '6')
assert.match(image.styleProps.filter, /^blur\(6px\)$/)
assert.match(image.styleProps['background-position'], /right/)

// --- saving wallpaper:false from the settings section strips every override --
{
  const offState = { wallpaper: 'false', brand: 'false', surfaceOpacity: '88', blur: '0', scrim: '35', position: 'center' }
  stateOverride = offState
  const offSection = seats.get('settings.section').component()
  stateOverride = null
  let offButton = null
  ;(function findOff(node) {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(findOff)
    if (typeof node.type !== 'undefined') {
      if (node.type === 'button' && Array.isArray(node.children) && node.children.includes('保存并应用')) offButton = node
      findOff(node.children)
    }
  })(offSection)
  assert.ok(offButton, 'save button exists in the off render')
  offButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(puts.length, 2)
  assert.equal(puts[1].wallpaper, 'false')
  assert.equal(body.children.length, 0, 'layer unmounted')
  assert.equal(body.styleProps['--dsw-alias-bg-base'], undefined, 'token overrides removed')
  assert.equal(documentElement.styleProps['background-color'], undefined, 'root background restored')
  assert.equal(seats.has('sidebar.brand.mark'), false, 'brand mark unseated when disabled')
}

// --- dispose leaves nothing behind -------------------------------------------
dispose()
window.__TANGSAN__.config = { wallpaper: 'true', brand: 'true', surfaceOpacity: '88', blur: '0', scrim: '35', position: 'center' }
const dispose2 = plugin.apply({ slots })
const secondStyle = head.children[head.children.length - 1]
const secondLayer = body.children[0]
assert.ok(secondLayer, 'a fresh apply mounts the layer again')
dispose2()
assert.equal(body.children.length, 0, 'layer removed on dispose')
assert.equal(secondStyle.isConnected, false, 'stylesheet removed on dispose')
assert.equal(seats.size, 0, 'slot seats released on dispose')
assert.equal(body.styleProps['--dsw-alias-bg-base'], undefined, 'surface overrides removed on dispose')

console.log('tangsan client tests passed')
