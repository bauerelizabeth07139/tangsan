# tangsan

**TangSan mascot appearance layer for the DeepSeek Harness Web GUI** — a generated 唐三 (TangSan) portrait, shipped inside the plugin, worn by the harness as its background, its brand mark, and its settings surface.

![TangSan portrait](assets/tangsan.jpg)
![TangSan wallpaper](assets/tangsan-wallpaper.jpg)

## What it does

- **Chat background** — the shipped 16:9 artwork is mounted as a fixed, click-through layer behind the whole GUI. The shell's surface tokens (`--dsw-alias-bg-base`, `--dsw-specific-sidebar-fill`, `--dsw-alias-bg-layer-1/2`) are faded to the configured opacity so the wallpaper actually shows through instead of hiding behind an opaque shell, and the root background is cleared for it.
- **Controls** — opacity of the shell surfaces, wallpaper blur, a dark scrim for readability, and `background-position`, all applied live.
- **Brand mark** — the square TangSan avatar replaces the logo in the sidebar and the conversation hero through the stock `sidebar.brand.mark` and `conversation.hero.brand.mark` slots.
- **Settings section** — a 「唐三美化 TangSan」 page in Settings edits everything, with previews of both artworks, and applies on save.
- **Host half** — serves the artwork and the config from the local DSH web server (`/api/tangsan/...`), so the browser never reaches outside, and stamps the config into the HTML so the GUI comes up already dressed.

## Install

```sh
dsh plugin --profile web add bauerelizabeth07139/tangsan
```

Any spec the plugin manager accepts works — a GitHub shorthand, a full git URL, or a local checkout:

```sh
dsh plugin --profile web add https://github.com/bauerelizabeth07139/tangsan.git
dsh plugin --profile web add C:\path\to\tangsan
```

Then open **Settings → 唐三美化 TangSan**. Uninstall with `dsh plugin --profile web remove tangsan`.

## Configuration

The config lives at `$DSH_HOME/tangsan.json` (default `~/.dsh/tangsan.json`) and is edited by the Settings section; it is also reachable over HTTP.

| Field | Default | Meaning |
|---|---|---|
| `wallpaper` | `true` | Wear the TangSan artwork as the GUI background |
| `brand` | `true` | Replace the sidebar and hero logos with the TangSan avatar |
| `surfaceOpacity` | `60` | Shell surface opacity in % — lower shows more of the wallpaper, higher keeps the shell opaque (25–100) |
| `blur` | `0` | Gaussian blur applied to the wallpaper, in px (0–24) |
| `scrim` | `35` | Palette-matched wash over the wallpaper — black in the dark theme, white in the light theme — for a readable transcript, in % (0–90) |
| `position` | `center` | Wallpaper `background-position`: `center`, `left`, `right`, `top`, `bottom` |

| Route | Method | Purpose |
|---|---|---|
| `/api/tangsan/config` | `GET` / `PUT` | Read / write the config (writes are same-origin only) |
| `/api/tangsan/wallpaper` | `GET` | The 16:9 background artwork |
| `/api/tangsan/mark` | `GET` | The square avatar artwork |
| `/api/tangsan/diag` | `GET` / `POST` | Last browser-side diagnostic report (mount state, surface overrides, errors) |

Every value is clamped server-side; unknown keys are dropped.

## Artwork provenance

Both artworks are generated with the [SenseAudio 同步图片生成 API](https://docs.senseaudio.cn/api-reference/endpoint/image/sync) (model `senseaudio-image-2.0-260319`): the portrait from a user-supplied reference image, and the wide wallpaper from that portrait. Derivatives — the 512×512 avatar mark and the shipping JPEGs — are cropped from those two generations.

## Development

No build step, no runtime dependencies (React and `@deepseek-ai/cordis` are peers supplied by the harness).

```sh
npm test   # node >= 22: host routes/config/stamp tests + client DOM-stub tests
```

- `lib/index.js` — the host half: config file, three routes, HTML boot stamp.
- `lib/client.js` — the browser half: wallpaper layer, surface fade, brand-mark slots, Settings section.
- `cordis.patch.yml` — the loader row that makes both halves load.

---

## 中文

**DeepSeek Harness 网页端的唐三美化形象插件** —— 一张生成的唐三插画随插件一起分发，由 Harness 当作背景、品牌标识与设置项穿在身上。

### 功能

- **聊天背景**：内置 16:9 横版插画作为不可点击的全屏背景层；同时把界面的表面色令牌（`--dsw-alias-bg-base`、`--dsw-specific-sidebar-fill`、`--dsw-alias-bg-layer-1/2`）按设定透明度调淡，背景才能真正透出来，而不是被不透明的界面挡住。
- **可调参数**：界面不透明度、背景模糊、暗色遮罩、壁纸位置，改动即时生效。
- **品牌标识**：通过官方的 `sidebar.brand.mark` 与 `conversation.hero.brand.mark` 插槽，把侧栏与会话标题处的 logo 换成唐三方形头像。
- **设置页**：Settings 里的「唐三美化 TangSan」页面提供两 artwork 预览与全部开关，保存即生效。
- **宿主半**：由本地 DSH Web 服务直接提供 artwork 与配置接口（`/api/tangsan/...`），浏览器无需访问外部网络；配置同时被盖进 HTML，页面一打开就是美化后的样子。

### 安装

```sh
dsh plugin --profile web add bauerelizabeth07139/tangsan
```

随后打开 **Settings → 唐三美化 TangSan**。卸载：`dsh plugin --profile web remove tangsan`。

### 配置

配置文件为 `$DSH_HOME/tangsan.json`（默认 `~/.dsh/tangsan.json`），字段与取值范围见上方英文表格；服务端会做钳制并丢弃未知字段。

### 素材来源

两张插画均由 [SenseAudio 同步图片生成接口](https://docs.senseaudio.cn/api-reference/endpoint/image/sync)（模型 `senseaudio-image-2.0-260319`）生成：竖版画像以用户提供的参考图为底，横版壁纸再以该画像为参考图生成；512×512 头像等衍生图由这两次生成裁切而来。

### 开发

```sh
npm test   # 需要 node >= 22，无任何运行时依赖
```

## License

[MIT](LICENSE)
