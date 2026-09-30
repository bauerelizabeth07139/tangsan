# tangsan

**TangSan mascot appearance layer for the DeepSeek Harness Web GUI** — a generated 唐三 (TangSan) portrait, shipped inside the plugin, worn by the harness as its background, its brand mark, and its settings surface.

![TangSan portrait](assets/tangsan.jpg)
![TangSan wallpaper](assets/tangsan-wallpaper.jpg)

## What it does

- **Chat background** — the shipped 16:9 artwork is mounted as a fixed, click-through layer behind the whole GUI. The shell's surface tokens (`--dsw-alias-bg-base`, `--dsw-specific-sidebar-fill`, `--dsw-alias-bg-layer-1/2`) are faded to the configured opacity so the wallpaper actually shows through instead of hiding behind an opaque shell, and the root background is cleared for it.
- **Controls** — opacity of the shell surfaces, wallpaper blur, a dark scrim for readability, and `background-position`, all applied live.
- **Brand mark** — the square TangSan avatar replaces the logo in the sidebar and the conversation hero through the stock `sidebar.brand.mark` and `conversation.hero.brand.mark` slots.
- **Settings section** — a 「唐三美化 TangSan」 page in Settings edits everything, with previews of both artworks, and applies on save.
- **Tab icon** — the browser tab favicon follows the same TangSan avatar while the brand mark is on, and the stock icons come back when it is switched off.
- **Host half** — serves the artwork and the config from the local DSH web server (`/api/tangsan/...`), so the browser never reaches outside, and stamps the config into the HTML so the GUI comes up already dressed.

## Install

**DeepSeek Harness Desktop** — install it from the application, not from a shell: open **Plugins** in the sidebar, choose **Add plugin**, enter

```
https://github.com/bauerelizabeth07139/tangsan
```

and switch the new **tangsan** bundle on. The Desktop application boots the reserved `desktop` profile, so the command below installs into a different profile that the Desktop app never reads.

**dsh CLI (`web` profile)** — install it into the profile you boot:

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

## Troubleshooting

### The application does not start: `... is not valid JSON`

The Harness Host reads each profile manifest as JSON before it loads any
plugin, so one stray `,` before the opening `{` of a manifest makes the read
throw and the application stop. The Desktop recovery action "Disable
third-party plugins" cannot repair it: it re-reads the same broken manifest.

Find the damaged file — the Desktop application boots `$DSH_HOME/profiles/desktop`
(`$DSH_HOME` defaults to `~/.dsh`):

```powershell
$home = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
Get-ChildItem (Join-Path $home 'profiles\*\package.json'), (Join-Path $home 'profiles\*\node_modules\*\package.json') -ErrorAction SilentlyContinue |
  ForEach-Object { try { $null = Get-Content $_ -Raw | ConvertFrom-Json; "OK   $_" } catch { "BAD  $_" } }
```

A `BAD` file whose first non-space character is a comma is otherwise intact:
delete that one character. Deleting the whole file also works when it is the
profile manifest — the next start re-creates it from the shipped template and
only the bundle selection is lost, because installed packages stay in the
profile's `node_modules`; switch `tangsan` back on from **Plugins**. While the
manifest is broken, neither `dsh plugin` nor the Plugins page can run.

## 中文

**DeepSeek Harness 网页端的唐三美化形象插件** —— 一张生成的唐三插画随插件一起分发，由 Harness 当作背景、品牌标识与设置项穿在身上。

### 功能

- **聊天背景**：内置 16:9 横版插画作为不可点击的全屏背景层；同时把界面的表面色令牌（`--dsw-alias-bg-base`、`--dsw-specific-sidebar-fill`、`--dsw-alias-bg-layer-1/2`）按设定透明度调淡，背景才能真正透出来，而不是被不透明的界面挡住。
- **可调参数**：界面不透明度、背景模糊、暗色遮罩、壁纸位置，改动即时生效。
- **品牌标识**：通过官方的 `sidebar.brand.mark` 与 `conversation.hero.brand.mark` 插槽，把侧栏与会话标题处的 logo 换成唐三方形头像。
- **设置页**：Settings 里的「唐三美化 TangSan」页面提供两 artwork 预览与全部开关，保存即生效。
- **标签页图标**：品牌标识开启时，浏览器标签页小图标也换成同一张唐三头像；关闭后恢复官方图标。
- **宿主半**：由本地 DSH Web 服务直接提供 artwork 与配置接口（`/api/tangsan/...`），浏览器无需访问外部网络；配置同时被盖进 HTML，页面一打开就是美化后的样子。

### 安装

**桌面版 DeepSeek Harness**:请在应用内安装——侧栏 **Plugins → Add plugin**,填入

```
https://github.com/bauerelizabeth07139/tangsan
```

然后打开 **tangsan** 这个 bundle。桌面版启动的是保留 profile `desktop`,而下面的命令行会把插件装进另一个 profile,桌面版不会读取它。

**dsh 命令行(`web` profile)**:装进你实际启动的 profile。

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

### 疑难解答

#### 应用无法启动,报 `... is not valid JSON`

Host 在加载任何插件之前会把每个 profile manifest 当作 JSON 读取;只要某个
manifest 开头的 `{` 之前多出一个 `,`,这次读取就会抛错,应用随之停止。桌面版
的「禁用第三方插件」恢复按钮修不好它,因为它会重新读取同一个坏文件。

定位损坏的文件(桌面版启动的是 `$DSH_HOME/profiles/desktop`,`$DSH_HOME` 默认
为 `~/.dsh`):

```powershell
$home = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
Get-ChildItem (Join-Path $home 'profiles\*\package.json'), (Join-Path $home 'profiles\*\node_modules\*\package.json') -ErrorAction SilentlyContinue |
  ForEach-Object { try { $null = Get-Content $_ -Raw | ConvertFrom-Json; "OK   $_" } catch { "BAD  $_" } }
```

报告为 `BAD` 且第一个非空白字符是逗号的文件,其余内容是完好的:删掉那一个逗号
即可。如果坏的是 profile manifest 本身,直接删除整个文件也可以——下次启动会按
内置模板重建,只会丢失 bundle 的勾选记录,已安装的包仍留在 profile 的
`node_modules` 里,在 **Plugins** 页面重新打开 `tangsan` 即可。manifest 损坏期间,
`dsh plugin` 与 Plugins 页面同样无法工作。

## License

[MIT](LICENSE)
