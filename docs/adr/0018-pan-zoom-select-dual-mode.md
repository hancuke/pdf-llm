# 视口缩放/平移 与 文本选择 的双模解耦（手势防误触）

移动端（粗指针）下 ADR-0010 把 `panMode` 设为默认 + 挂了长按仲裁器，但实测仍有两个误触：

1. **双指捏合缩放 → 误触成文本选择**：捏合时第一根手指的拖动触发了 EmbedPDF 选字插件。
2. **长按划词 → 触发浏览器默认放大镜/缩放**：长按被 iOS/浏览器认领为原生放大镜、双击缩放或长按 callout。

**根因**：`panMode` 声明 `wantsRawTouch: false`，EmbedPDF 的 `createPointerProvider`
（`packages/plugin-interaction-manager/src/shared/utils.ts`）据此把页面元素的 **inline
`touch-action` 清空为 `''`**，页面 `touch-action` 回落到 CSS/继承的 `auto` —— 浏览器重新认领整块
表面，亲自跑原生 pinch-zoom / 双击缩放 / 长按 callout，与 EmbedPDF 的 `useZoomGesture` 抢手势。

## 决定

在 ADR-0010 的 `panMode` + 长按仲裁器**之上**细化（不推翻），引入「双模」：

1. **不引入第三方手势库**（Hammer.js / PinchZoom.js）。本应用已用 EmbedPDF 自管视口 Transform
   （zoom / scroll / pan 插件），再叠一层库会与 EmbedPDF 抢 Transform、产生双重缩放源。手势仍由
   EmbedPDF 的 `useZoomGesture` 托管。
2. **`touch-action` 用 `pan-y` 盖过浏览器原生手势**。`.zoom-transform` 是所有页面的祖先；`touch-action`
   按祖先链取「最严格交集」生效，于是它盖过 EmbedPDF 清空后的 `auto`：
   - `pan-y` 保留原生**纵向滚动**（阅读的滚动手势不丢）；
   - 但禁止浏览器原生**捏合缩放 / 双击缩放**（它们不是 pan），`useZoomGesture` 独占 pinch →
     问题 1 在浏览器层被根除（再叠加既有的 `onPinchStart` 把选字插件 `enableSelection` 关掉）；
   - `.pdf-page` 上已有的 `-webkit-touch-callout: none` 抑制 iOS 长按 callout/放大镜 → 问题 2。
3. **工具栏「划词模式」常驻开关**（`ui.selectMode`，瞬态不持久化）。开启后 `.zoom-transform.select-mode`
   设 `touch-action: none`：原生滚动让位，单指拖动直接交给 EmbedPDF 选字插件选字（无需长按）。
   长按仲裁器（`src/lib/longPressSelect.ts`）在划词模式下通过 `enableLongPress: false` 关闭——
   只保留双指 pinch 检测（`onPinchStart/onPinchEnd`），单指拖动用 EmbedPDF 直选。
4. **长按阈值维持 `HOLD_MS = 500ms`**（ADR-0010 既定，不降到 300ms）。

**模式对照**：

| | 模式 A 缩放/平移（默认） | 模式 B 划词（工具栏开关） |
|---|---|---|
| `touch-action` | `pan-y` | `none` |
| 纵向滚动 | 原生 | 关闭（需退出模式） |
| 捏合缩放 | `useZoomGesture` 独占 | `useZoomGesture` 独占 |
| 选字触发 | 长按 500ms → 拖动 或 静止选词 | 单指拖动即选 |
| 长按仲裁器 | 关闭（阅读模式零选字） | 关闭（仅留 pinch 抑制；单指拖动即选） |

## 修正（真机回归后）

初版用 `touch-action: pan-y`，在 iOS 上暴露两个问题，已修正：

1. **缩放变灰 + 放大后不能平移**：`pan-y` 禁掉了浏览器原生捏合缩放（强制 EmbedPDF 的 JS 缩放
   → 提交时整页重渲染、出现灰色闪），同时又禁掉了横向原生平移（放大超过页宽后无法左右移动）。
   **修正**：阅读模式改用 `touch-action: manipulation`——保留浏览器原生捏合缩放（GPU 合成、平滑、
   无灰色重渲染闪），并允许双轴平移（含放大后的横向平移）；仅禁双击缩放以免与选字打架。原生捏合
   安全，因为 pinch 仲裁器在 second finger 落下的瞬间就把 EmbedPDF 选字关掉（不再有选字泄漏）。
2. **选字模式需要 iOS 放大镜**：`user-select: none` 最初全局施加（含选字模式），把放大镜也禁了。
   **修正**：`user-select: none` 仅作用于阅读模式（`@media (pointer: coarse)` 下的 `.zoom-transform`）；
   选字模式 `.zoom-transform.select-mode` 改回 `user-select: text`，iOS 拖动选字时显示放大镜。
3. **阅读模式不要选中文字**：按用户在真机上的决定，长按仲裁器在两种模式都关闭——阅读模式完全不
   选字（原生 `user-select:none` + 仲裁器关），选字只通过工具栏「划词模式」开关进入（单指拖动即选）。

## 代价

- 阅读模式 `user-select: none` + 长按仲裁器关闭 → 阅读模式零选字；选字只能进「划词模式」后拖动。
- 选字模式 `touch-action: none` → 原生滚动让位，需退出选字模式才能滚动手势（符合 Mode B 设计）；
  以工具栏按钮 `active` 态 + `title` 提示。
- `manipulation` 保留浏览器原生捏合缩放：依赖 pinch 仲裁器的 `onPinchStart` 在双指时关掉 EmbedPDF
  选字，否则第一指拖动会误触选字。
- 真机多指/长按无法在无头桌面 Chrome 复现，`e2e/` 暂无触屏项目；手动验收见下。

**手动验收清单（真机/触屏）**：
① 双指捏合平滑缩放（无灰色重渲染闪），且放大后可双指/单指左右上下平移；② 阅读模式任何交互都不出现选字；
③ 工具栏「划词模式」开启后单指拖动即选字，且 iOS 显示放大镜；④ 双指捏合不出现选区（pinch 抑制生效）；
⑤ 再次点击「划词模式」退出，恢复平滑缩放/平移。

**参考**：根因与 EmbedPDF 内部机制见 `docs/troubleshooting/embedpdf-three-bugs.md` 与
`docs/adr/0010-mobile-touch-scroll-and-long-press-select.md`。
