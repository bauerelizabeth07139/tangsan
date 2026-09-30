/**
 * tangsan client half — wears the TangSan artwork in the DSH Web GUI.
 *
 * Shape: the official client-package protocol. `window.__ModuleLoader__.load`
 * registers the module under the package name (which must equal the `name`
 * in cordis.patch.yml), and the factory returns the usual
 * `{ name, inject, apply }` Cordis client plugin.
 *
 * What it does, in the order it does it:
 *  1. Mounts a fixed, click-through wallpaper layer as the first child of
 *     <body> (`z-index:-1`), so it paints above the canvas background and
 *     below every piece of shell markup.
 *  2. Fades the shell's surface tokens (`--dsw-alias-bg-base`,
 *     `--dsw-specific-sidebar-fill`, `--dsw-alias-bg-layer-1/2`) to the
 *     configured opacity and clears the root background, which is what lets
 *     the layer show through instead of sitting behind an opaque shell.
 *     The read happens with the plugin's own inline overrides removed, or the
 *     alpha would compound on every update.
 *  3. Seats the artwork as the sidebar and conversation brand mark through
 *     the stock `sidebar.brand.mark` / `conversation.hero.brand.mark` slots.
 *  4. Registers a Settings section that edits and persists the config
 *     (PUT /api/tangsan/config, stored at $DSH_HOME/tangsan.json).
 *
 * The host stamps the config into the HTML as window.__TANGSAN__, so the GUI
 * comes up already wearing the artwork; the later fetch only reconciles edits
 * made after this page was served.
 */
window.__ModuleLoader__.load({
  id: 'tangsan',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const API = '/api/tangsan/config'
    const DIAG_API = '/api/tangsan/diag'
    const WALLPAPER_URL = '/api/tangsan/wallpaper'
    const MARK_URL = '/api/tangsan/mark'

    /**
     * The shell surfaces that sit above the wallpaper layer, each with the
     * extra opacity it needs on top of the user's setting: the transcript
     * canvas carries the wallpaper at full strength (that is where it should
     * be seen), the sidebar keeps a little more body, and the floating layers
     * stay nearly opaque so popovers still read as popovers.
     */
    const SURFACE_TOKENS = [
      { name: '--dsw-alias-bg-base', lift: 0 },
      { name: '--dsw-specific-sidebar-fill', lift: 0.15 },
      { name: '--dsw-alias-bg-layer-1', lift: 0.30 },
      { name: '--dsw-alias-bg-layer-2', lift: 0.30 },
    ]

    /** Geometry of the wallpaper layer and the settings-page styling. */
    const LAYER_CSS = [
      '[data-dsh-tangsan-layer]{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}',
      '[data-dsh-tangsan-image]{position:absolute;inset:0;background-repeat:no-repeat;background-position:center;background-size:cover}',
      '[data-dsh-tangsan-scrim]{position:absolute;inset:0}',
      '.dsh-tangsan-wrap{display:flex;flex-direction:column;gap:14px;max-width:640px}',
      '.dsh-tangsan-preview{display:flex;gap:12px;align-items:center}',
      '.dsh-tangsan-preview img{width:72px;height:72px;border-radius:12px;object-fit:cover;object-position:50% 18%;background:rgba(127,127,127,.12)}',
      '.dsh-tangsan-preview .dsh-tangsan-wall{width:160px;height:90px;object-position:center}',
      '.dsh-tangsan-preview figcaption{font-size:12px;opacity:.7;margin-top:4px}',
      '.dsh-tangsan-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:28px}',
      '.dsh-tangsan-row .dsh-tangsan-label{display:flex;flex-direction:column;gap:2px}',
      '.dsh-tangsan-row .dsh-tangsan-hint{font-size:12px;opacity:.65}',
      '.dsh-tangsan-value{font-size:12px;opacity:.75;min-width:52px;text-align:right;font-variant-numeric:tabular-nums}',
      '.dsh-tangsan-range{width:200px;accent-color:#4d6bfe}',
      '.dsh-tangsan-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.dsh-tangsan-btn{border:1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.35));background:var(--dsw-alias-bg-layer-1, rgba(127,127,127,.1));border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit;color:inherit}',
      '.dsh-tangsan-btn-primary{background:#4d6bfe;border-color:#4d6bfe;color:#fff}',
      '.dsh-tangsan-status{font-size:12px;opacity:.8}',
      '.dsh-tangsan-select{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1, rgba(127,127,127,.1));border:1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.35));border-radius:6px;padding:4px 6px}',
    ].join('')

    /** The shape of a config on the wire. */
    function blank() {
      return { wallpaper: 'true', brand: 'true', surfaceOpacity: '60', blur: '0', scrim: '35', position: 'center' }
    }

    const KEYS = Object.keys(blank())

    /** Keep only known string fields; the host clamps them, this is belt-and-braces. */
    function clean(input) {
      const out = blank()
      if (input === null || typeof input !== 'object') return out
      for (const key of KEYS) {
        const value = input[key]
        if (typeof value === 'string') out[key] = value
      }
      return out
    }

    /** Parse an integer inside `[min, max]`, falling back when it is not one. */
    function clampNum(value, min, max, fallback) {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed)) return fallback
      return Math.min(max, Math.max(min, parsed))
    }

    /** The square TangSan avatar, sized by the slot that asks for it. */
    function Mark(props) {
      const size = props !== null && typeof props === 'object' && typeof props.size === 'number' ? props.size : 24
      return h('img', {
        src: MARK_URL,
        alt: 'TangSan',
        draggable: false,
        style: {
          width: size + 'px',
          height: size + 'px',
          borderRadius: '50%',
          objectFit: 'cover',
          objectPosition: '50% 18%',
          display: 'block',
          boxShadow: '0 0 0 1px rgba(120,160,255,.4)',
          background: 'rgba(127,127,127,.12)',
        },
      })
    }

    function apply(ctx) {
      const slots = ctx.slots
      const disposers = []
      let seatDisposers = []
      let styleEl = null
      let layer = null
      let imageEl = null
      let scrimEl = null
      let paletteObserver = null
      let bodyWaiter = null
      let applied = blank()

      /** One stylesheet for the layer geometry and the settings styling. */
      function ensureStyle() {
        const host = document.head ?? document.documentElement
        if (host === null || host === undefined) return
        if (styleEl === null || styleEl.isConnected === false) {
          styleEl = document.createElement('style')
          styleEl.setAttribute('data-dsh-tangsan', '')
          host.appendChild(styleEl)
        }
        if (styleEl.textContent !== LAYER_CSS) styleEl.textContent = LAYER_CSS
      }

      /**
       * Mount the wallpaper layer as the first child of <body>, so it
       * precedes every piece of shell markup in DOM and paint order.
       *
       * @returns whether the layer is mounted; false means no <body> yet.
       */
      function ensureLayer() {
        if (layer !== null) return true
        if (document.body === null) return false
        layer = document.createElement('div')
        layer.setAttribute('data-dsh-tangsan-layer', '')
        layer.setAttribute('aria-hidden', 'true')
        imageEl = document.createElement('div')
        imageEl.setAttribute('data-dsh-tangsan-image', '')
        scrimEl = document.createElement('div')
        scrimEl.setAttribute('data-dsh-tangsan-scrim', '')
        layer.appendChild(imageEl)
        layer.appendChild(scrimEl)
        document.body.insertBefore(layer, document.body.firstChild)
        return true
      }

      /** Remove the wallpaper layer (the stylesheet and config stay). */
      function clearLayer() {
        if (layer !== null) {
          layer.remove()
          layer = null
          imageEl = null
          scrimEl = null
        }
      }

      /** Retry once the document finishes parsing when there is no body yet. */
      function deferUntilBody() {
        if (bodyWaiter !== null) return
        bodyWaiter = () => {
          bodyWaiter = null
          applyConfig(applied)
        }
        document.addEventListener('DOMContentLoaded', bodyWaiter, { once: true })
      }

      /**
       * Read the shell's surface tokens with this plugin's own inline
       * overrides removed — CSS custom properties are inherited, so a naive
       * read would return the previous fade and compound it every update.
       *
       * @returns `{ tokens, base }`.
       */
      function readSurfaces() {
        const body = document.body
        const removed = []
        if (body !== null) {
          for (const token of SURFACE_TOKENS) {
            if (body.style.getPropertyValue(token.name) !== '') {
              removed.push([token.name, body.style.getPropertyValue(token.name)])
            }
            body.style.removeProperty(token.name)
          }
        }
        const computed = getComputedStyle(body ?? document.documentElement)
        const tokens = SURFACE_TOKENS.map((token) => ({
          name: token.name,
          lift: token.lift,
          value: computed.getPropertyValue(token.name).trim(),
        }))
        const base = computed.getPropertyValue('--dsw-alias-bg-base').trim()
        for (const entry of removed) body.style.setProperty(entry[0], entry[1])
        return { tokens, base }
      }

      /**
       * (Re)apply the surface fade for the current palette and config.
       *
       * `wearing` is false whenever the layer is not mounted: the overrides
       * are then stripped so the shell is exactly as stock as it was.
       */
      function syncSurfaces(cfg, wearing) {
        const body = document.body
        const root = document.documentElement
        if (body === null || root === null) return
        const { tokens } = readSurfaces()
        if (!wearing) {
          for (const token of SURFACE_TOKENS) body.style.removeProperty(token.name)
          root.style.removeProperty('background-color')
          return
        }
        const alpha = clampNum(cfg.surfaceOpacity, 25, 100, 60) / 100
        for (const token of tokens) {
          if (token.value === '') continue
          const percent = Math.round(Math.min(1, alpha + token.lift) * 100)
          body.style.setProperty(token.name, 'color-mix(in srgb,' + token.value + ' ' + String(percent) + '%,transparent)')
        }
        // An opaque root background would paint the canvas over the layer's
        // home; making it transparent lets the body background propagate to
        // the canvas *below* the layer instead of above it.
        root.style.setProperty('background-color', 'transparent')
      }

      /**
       * Re-read the palette when the shell actually flips it.
       *
       * The attribute is the thing the token reading depends on, so a
       * mutation callback (which runs after the change) always derives the
       * override from the palette in force — a `theme/change` event fires
       * before the attribute lands and would read the outgoing palette.
       */
      function watchPalette() {
        if (paletteObserver !== null || typeof MutationObserver !== 'function') return
        const root = document.documentElement
        if (root === null) return
        paletteObserver = new MutationObserver(() => applyConfig(applied))
        paletteObserver.observe(root, {
          attributes: true,
          attributeFilter: ['data-ds-dark-theme'],
          subtree: true,
        })
      }

      /** Paint the layer elements for one config. */
      function paintLayer(cfg) {
        if (imageEl === null || scrimEl === null) return
        const blur = clampNum(cfg.blur, 0, 24, 0)
        // A blur samples past the edge it blurs, so the image is grown just
        // enough to keep the soft edge off screen — and not one pixel more
        // when there is no blur to hide.
        const bleed = blur > 0 ? Math.ceil(blur * 3) + 8 : 0
        imageEl.style.inset = bleed > 0 ? String(-bleed) + 'px' : '0'
        imageEl.style.backgroundImage = 'url("' + WALLPAPER_URL + '")'
        imageEl.style.backgroundPosition = cfg.position
        imageEl.style.filter = blur > 0 ? 'blur(' + String(blur) + 'px)' : 'none'
        // One number, two roles: the wash matches the palette — a black wash
        // keeps a dark theme moody, a white wash keeps a light theme readable
        // instead of dragging the wallpaper under dark text.
        const isDark = document.body !== null && typeof document.body.hasAttribute === 'function' && document.body.hasAttribute('data-ds-dark-theme')
        const wash = isDark ? '0,0,0' : '255,255,255'
        scrimEl.style.background = 'rgba(' + wash + ',' + (clampNum(cfg.scrim, 0, 90, 35) / 100).toFixed(3) + ')'
      }

      /** (Re)seat the brand marks; each seat is independent of the others. */
      function seatMarks(cfg) {
        for (const dispose of seatDisposers) {
          try {
            dispose()
          } catch {
            /* double dispose is harmless */
          }
        }
        seatDisposers = []
        if (cfg.brand !== 'true') return
        const seat = (slotName) => {
          try {
            seatDisposers.push(slots.inject(slotName, () => slots.register({ name: slotName }, Mark)))
          } catch (error) {
            console.error('[tangsan] registration failed for ' + slotName + ':', error)
          }
        }
        seat('sidebar.brand.mark')
        seat('conversation.hero.brand.mark')
      }

      /** Apply one config end to end: marks, layer, surface fade. */
      function applyConfig(cfg) {
        applied = clean(cfg)
        seatMarks(applied)
        if (document.body === null) {
          deferUntilBody()
          return
        }
        ensureStyle()
        const wearing = applied.wallpaper === 'true'
        if (wearing) {
          if (ensureLayer()) paintLayer(applied)
          else deferUntilBody()
        } else {
          clearLayer()
        }
        syncSurfaces(applied, wearing && layer !== null)
        watchPalette()
      }

      /** Settings → 唐三美化: edit, preview, save applies instantly. */
      function TangSanSection() {
        const [form, setForm] = React.useState(null)
        const [status, setStatus] = React.useState('')

        React.useEffect(() => {
          let alive = true
          fetch(API)
            .then((res) => res.json())
            .then((cfg) => {
              if (alive) setForm(clean(cfg))
            })
            .catch(() => {
              if (alive) setForm(blank())
            })
          return () => {
            alive = false
          }
        }, [])

        if (form === null) {
          return h('div', { className: 'dsh-tangsan-wrap' }, '加载中…')
        }

        const update = (key, value) => setForm(Object.assign({}, form, { [key]: value }))
        const save = () => {
          setStatus('保存中…')
          fetch(API, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(form),
          })
            .then((res) => res.json())
            .then((cfg) => {
              const next = clean(cfg)
              setForm(next)
              applyConfig(next)
              setStatus('已保存并应用 ✔')
            })
            .catch(() => setStatus('保存失败，请重试'))
        }
        const reset = () => {
          const next = blank()
          setForm(next)
          applyConfig(next)
          setStatus('已恢复默认 ✔')
        }

        const boolRow = (key, label, hint) =>
          h('div', { className: 'dsh-tangsan-row' },
            h('label', { className: 'dsh-tangsan-label' },
              h('span', null, label),
              h('span', { className: 'dsh-tangsan-hint' }, hint)),
            h('input', {
              type: 'checkbox',
              checked: form[key] === 'true',
              onChange: (ev) => update(key, ev.target.checked ? 'true' : 'false'),
            }))

        const rangeRow = (key, label, hint, min, max, suffix) =>
          h('div', { className: 'dsh-tangsan-row' },
            h('label', { className: 'dsh-tangsan-label' },
              h('span', null, label),
              h('span', { className: 'dsh-tangsan-hint' }, hint)),
            h('div', { className: 'dsh-tangsan-row', style: { gap: '8px' } },
              h('input', {
                className: 'dsh-tangsan-range',
                type: 'range',
                min: String(min),
                max: String(max),
                value: String(clampNum(form[key], min, max, min)),
                onChange: (ev) => update(key, ev.target.value),
              }),
              h('span', { className: 'dsh-tangsan-value' }, String(clampNum(form[key], min, max, min)) + suffix)))

        return h('div', { className: 'dsh-tangsan-wrap' },
          h('div', { className: 'dsh-tangsan-preview' },
            h('figure', { style: { margin: '0' } },
              h('img', { src: MARK_URL, alt: '唐三头像' }),
              h('figcaption', null, '头像 / 侧栏标识')),
            h('figure', { style: { margin: '0' } },
              h('img', { className: 'dsh-tangsan-wall', src: WALLPAPER_URL, alt: '唐三壁纸' }),
              h('figcaption', null, '聊天背景'))),
          boolRow('wallpaper', '启用聊天背景', '把唐三横版插画铺在界面下方，可调透明度、模糊与遮罩'),
          boolRow('brand', '替换品牌标识', '侧栏与会话标题处的 logo 换成唐三头像'),
          rangeRow('surfaceOpacity', '界面不透明度', '数值越高界面越不透明，背景越含蓄', 40, 100, '%'),
          rangeRow('blur', '背景模糊', '对壁纸施加高斯模糊', 0, 24, 'px'),
          rangeRow('scrim', '背景遮罩', '压暗壁纸，保证正文可读', 0, 90, '%'),
          h('div', { className: 'dsh-tangsan-row' },
            h('label', { className: 'dsh-tangsan-label' },
              h('span', null, '壁纸位置'),
              h('span', { className: 'dsh-tangsan-hint' }, 'background-position 关键字')),
            h('select', {
              className: 'dsh-tangsan-select',
              value: form.position,
              onChange: (ev) => update('position', ev.target.value),
            },
            ...['center', 'left', 'right', 'top', 'bottom'].map((value) =>
              h('option', { key: value, value }, value)))),
          h('div', { className: 'dsh-tangsan-actions' },
            h('button', { type: 'button', className: 'dsh-tangsan-btn dsh-tangsan-btn-primary', onClick: save }, '保存并应用'),
            h('button', { type: 'button', className: 'dsh-tangsan-btn', onClick: reset }, '恢复默认'),
            status !== '' ? h('span', { className: 'dsh-tangsan-status' }, status) : null))
      }

      /**
       * Tell the host what the browser actually did: whether the layer is
       * mounted, which surface overrides were written, and any error thrown
       * while applying. Never throws — diagnostics must not break the plugin.
       *
       * @param cfg - the config that was applied.
       * @param error - an exception raised while applying, if any.
       */
      function reportDiag(cfg, error) {
        try {
          const body = document.body
          const root = document.documentElement
          const tokens = []
          if (body !== null) {
            for (const token of SURFACE_TOKENS) {
              const value = body.style.getPropertyValue(token.name)
              if (value !== '') tokens.push({ n: token.name, v: value })
            }
          }
          const payload = {
            at: Date.now(),
            client: 'v2',
            mounted: layer !== null,
            layerCount: layer !== null ? 1 : 0,
            darkTheme: body !== null && typeof body.hasAttribute === 'function' && body.hasAttribute('data-ds-dark-theme'),
            surface: cfg === null || cfg === undefined ? '' : cfg.wallpaper + '/' + cfg.surfaceOpacity + '/' + cfg.scrim,
            bodyBg: body === null ? '' : String(getComputedStyle(body).getPropertyValue('background-color') || '').slice(0, 120),
            rootBg: root === null ? '' : String(getComputedStyle(root).getPropertyValue('background-color') || '').slice(0, 120),
            tokenCount: tokens.length,
            tokens,
            error: error === undefined ? '' : String(error).slice(0, 300),
          }
          fetch(DIAG_API, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(() => {})
        } catch {
          /* diagnostics never break the plugin */
        }
      }

      disposers.push(slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'tangsan', order: 91, label: '唐三美化 TangSan' },
        TangSanSection,
      )))

      // Boot synchronously from the config the host stamped into the HTML —
      // the artwork must be in place before first paint, not after a fetch.
      let appliedJson = ''
      const boot = typeof window === 'object' && window !== null ? window.__TANGSAN__ : undefined
      if (boot !== null && typeof boot === 'object' && boot !== undefined && boot.config !== undefined) {
        const cfg = clean(boot.config)
        appliedJson = JSON.stringify(cfg)
        try {
          applyConfig(cfg)
          reportDiag(applied)
        } catch (error) {
          reportDiag(cfg, error)
        }
      }

      // Then reconcile with the live file (covers saves made after this HTML
      // was served); a same-value response is a no-op.
      fetch(API)
        .then((res) => res.json())
        .then((raw) => {
          const cfg = clean(raw)
          const json = JSON.stringify(cfg)
          if (json !== appliedJson) {
            appliedJson = json
            applyConfig(cfg)
          }
          reportDiag(cfg)
        })
        .catch(() => {
          /* the boot-stamped config (or stock appearance) stays */
          reportDiag(applied)
        })

      return () => {
        clearLayer()
        if (styleEl !== null) {
          styleEl.remove()
          styleEl = null
        }
        if (paletteObserver !== null) {
          paletteObserver.disconnect()
          paletteObserver = null
        }
        if (bodyWaiter !== null) {
          document.removeEventListener('DOMContentLoaded', bodyWaiter)
          bodyWaiter = null
        }
        const body = document.body
        const root = document.documentElement
        if (body !== null) {
          for (const token of SURFACE_TOKENS) body.style.removeProperty(token.name)
        }
        if (root !== null) root.style.removeProperty('background-color')
        for (const dispose of seatDisposers.concat(disposers)) {
          try {
            dispose()
          } catch {
            /* double dispose is harmless */
          }
        }
        seatDisposers = []
      }
    }

    return { name: 'tangsan', inject: ['slots'], apply }
  },
})
