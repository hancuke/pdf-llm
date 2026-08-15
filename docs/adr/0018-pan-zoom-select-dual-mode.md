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
| 长按仲裁器 | 启用 | 关闭（仅留 pinch 抑制） |

## 代价

- `pan-y` 同时禁掉横向原生 pan（本应用滚动仅纵向，可接受）。
- **未**全局加 `user-select: none`。核心问题（浏览器原生 pinch/双击缩放）已由 `pan-y` 根除；iOS
  选字过程中的 loupe 主要由 `-webkit-touch-callout: none` 抑制。是否进一步加 `user-select: none`
  （用户原提议 Mode A 默认关闭原生选字）待真机验证：EmbedPDF 选字基于字形 overlay，但需确认
  `user-select: none` 不会破坏其 `getSelectedText` / 格式化选区；若验证通过再补，若破坏则维持现状。
- 模式 B 下原生滚动关闭，用户需退出划词模式才能滚动手势——符合 Mode B 设计；以工具栏按钮
  `active` 态 + `title` 提示。
- 真机多指/长按无法在无头桌面 Chrome 复现，`e2e/` 暂无触屏项目；手动验收见下。

**手动验收清单（真机/触屏）**：
① 双指捏合只缩放、不出现选区；② 长按 500ms 出选词、拖动可扩展；③ iOS 长按不再弹原生放大镜/callout；
④ 工具栏「划词模式」开启后单指拖动即选字，再次点击退出恢复滚动。

**参考**：根因与 EmbedPDF 内部机制见 `docs/troubleshooting/embedpdf-three-bugs.md` 与
`docs/adr/0010-mobile-touch-scroll-and-long-press-select.md`。
