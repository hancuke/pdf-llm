# EmbedPDF 三连坑排查经验（加载报错 / 移动端滚动与选字 / 缩放崩溃）

> 适用版本：@embedpdf/* v2.14.4（已通过官方源码 `/tmp/epdf` 对照确认）
> 关联提交：`55b514a` fix: resolve load error, mobile scroll/select, and post-zoom crash
> 关联 ADR：`docs/adr/0010-mobile-touch-scroll-and-long-press-select.md`

本文把一次通过「读文档/源码而非 hack」定位的三个 Bug 的根因与验证过程沉淀下来，供后续排查 EmbedPDF 集成问题参考。

---

## 0. EmbedPDF 关键内部机制（排查前必须知道的背景）

1. **`touch-action` 由 interaction-manager 决定，而非 CSS。**
   `createPointerProvider` 内部：`element.style.touchAction = attachedWithRawTouch ? "none" : ""`，
   其中 `wantsRawTouchNow = () => capScope.getActiveInteractionMode()?.wantsRawTouch !== false`
   （**默认 true**）。
   - 内置 `pointerMode` **不**声明 `wantsRawTouch` → 默认 true → 每个页面 `touch-action: none`。
   - `panMode` 是唯一内置声明 `wantsRawTouch: false` 的 mode → 恢复原生滚动/`touch-action: auto`。

2. **capability 在插件注册时就存在，早于任何文档。**
   `getActiveDocumentId()` 在 `coreState.core.activeDocumentId === null` 时抛
   `Error("No active document")`。`cap.getState()`、`cap.zoomIn()`、`cap.getCurrentPage()` 等
   **未作用域**的方法都经 `getActiveDocumentId()` 解析，因此文档未打开时调用即抛错。
   正确做法是 `cap.forDocument(id)`，并对 `id` 做空值守卫。

3. **监听器集合（Pointer Events 模式下）。**
   支持 Pointer Events 的浏览器里 `allEventTypes = pointerEventTypes`（**不含** `touch*` 事件），
   但 `dblclick` 在其中。页面 provider 元素上挂有 `dblclick` 监听器，映射到
   `onDoubleClick → onWordSelect`（`packages/plugin-selection/src/lib/handlers/text-selection.handler.ts`）。
   `selectWord → applyInstantSelection` 会 `dispatch(endSelection)` 并 `endSelection$.emit`，触发我们的
   `onEndSelection` → Action Sheet。

4. **`enableForMode` 与 `isEnabled`。**
   `enableForMode('panMode', { enableSelection: true })` 使 `isEnabled('panMode')` 返回 true
   （`selection-plugin.ts:428-431`）；`pointerMode` 在插件构造时已默认启用（`selection-plugin.ts:221`）。
   handler 通过 `registerAlways({ scope: { type: 'page', ... } })` 为**所有 mode**注册，
   仅由 `isEnabled(modeId)` 开关。所以 panMode 下要让选字可用，必须显式 `enableForMode('panMode', ...)`。

5. **坐标换算与事件 target 无关。**
   `PagePointerProvider` 的 `defaultConvertEventToPoint(event, element)` 用宿主元素
   （provider div，`divRef`）的 `getBoundingClientRect()` 计算 `point = clientX - rect.left`。
   因此 `dblclick` 的落点只取决于 `clientX/clientY`，与 `event.target` 是哪个子元素无关——但
   `handleEvent` 开头有 `shouldExcludeElement(evt.target)` 短路，所以 **target 本身是否在被排除的元素上**会影响是否处理。

6. **RenderLayer 不设 `scale` 会渲染整页位图且无上界。**
   `<RenderLayer :scale>` 省略时内部使用 `documentState.scale`（zoom × dpr）渲染整页；缩放越大位图越大。
   `@embedpdf/plugin-tiling` 只渲染视口大小的 tile（默认 `tileSize: 768, extraRings: 0`），把内存限制在视口量级。

---

## Bug 1 — 页面加载即 `Error: No active document`

**现象**：加载页 → `getActiveDocumentId → getDocumentState → getState → (watcher immediate)` 抛错。

**根因**：`src/lib/viewer.ts` 的桥接函数在文档尚未激活时就调用了 capability 的未作用域方法
（如 `cap.getState()` 取初始 zoom）。capability 在插件注册即存在，但 `getActiveDocumentId()` 在
`activeDocumentId === null` 时抛错。

**修复**（`src/lib/viewer.ts`）：
- 新增模块级 `documentId` 状态 + `setActiveDocumentId(id)`。
- `scrollScope()` / `zoomScope()` 在 `!scrollCapability || !documentId` 时返回 `null`。
- `jumpToPage / getCurrentPage / getCurrentZoom / zoomIn / zoomOut / getReadingPosition`
  全部改为走 `forDocument(id)` 并对 `null` 守卫，返回安全默认值（如 zoom 返回 `1`）。

**验证**：Playwright 加载页面、在未打开文档时点击 zoom 按钮 → `pageerrors = 0`；随后打开
`e2e/fixtures/sample.pdf`，zoom 标签显示 `100%`。

---

## Bug 2 — 移动端在 PDF 区域上滑变成选字、无法滚动；放大后上滑崩溃

**现象**：
- 移动端在页面区域内上滑应当滚动手势，实际变成选中文字，必须从内容外区域起滑才滚动。
- 放大后再上滑，网站崩溃。

**根因**：见背景 §1。`pointerMode`（默认）把每个页面 `touch-action: none`，所以页面内的任何拖动都被
当作选字拖拽，浏览器永不把它当滚动；而 `panMode`（`wantsRawTouch: false`）能恢复原生滚动，但它会让
浏览器把拖动认领为滚动并触发 `pointercancel`，于是 pointer 驱动的选字 handler 无法启动。两者互斥，
必须由「一个手指、两种手势」的仲裁器区分。

**修复**：
- `src/components/PdfViewer.vue`：注册 `PanPluginPackage`（默认 `never`）与 `TilingPluginPackage`
  （`{ tileSize: 768, overlapPx: 2.5, extraRings: 0 }`）。
- `src/components/PdfDocument.vue`：
  - 对 `panMode` 启用选字：`selection.value?.enableForMode('panMode', { enableSelection: true, showSelectionRects: true, enableMarquee: false }, id)`（保留 `pointerMode` 默认配置不被覆盖）。
  - 仅当 `isCoarsePointer()` 时调用 `pan.value?.makePanDefault()`（鼠标端保持拖拽选字）。
  - `onDblClickZoom` 在粗指针下直接返回（缩放交给 pinch），避免与选字手势冲突。
  - `activeDocumentId` watcher 先 `setActiveDocumentId(id)`，再读初始 zoom。
- `src/lib/pointer.ts`：新增 `isCoarsePointer()`（`matchMedia('(pointer: coarse)')`），比库内
  `'ontouchstart' in window` 更精确（排除带触屏的笔记本）。
- `src/lib/longPressSelect.ts`（新）：**长按仲裁器**。
  - `touchstart`（单指）→ 记起点，`setTimeout(HOLD_MS=500)`。
  - 手指在 `HOLD_MS` 前移动超过 `MOVE_TOLERANCE_PX=8` → 判定为滑动，解除计时（不干预，浏览器滚动）。
  - 按住不动到点 → `armed=true`：此后每个 `touchmove` `preventDefault()`（阻止浏览器滚动，使
    `pointercancel` 不触发，pointer 流得以存活），选字交给 EmbedPDF **自身的 pointer handler**
    （`pointerdown` 已在按下时记下锚点 glyph，`pointermove` 在拖动时延伸选区）。这正是用户要的
    「长按触发选字，然后拖动选择」。
  - 作为补充：静止长按还会重放一次 `dblclick`（映射到 `onWordSelect`）以选中光标下整词；仅当没有
    已打开的选区时这样做（见下方 gotcha）。
- `src/components/PdfScroller.vue`：`@pointerup` 记录最后指针位置供选词上报；`elementRef` watcher
  挂载仲裁器；`<RenderLayer :scale="0.5">` + `<TilingLayer>` + `<SelectionLayer>`。
- `src/style.css`：`.pdf-page { -webkit-touch-callout: none; }`。

**验证（iPhone 13 模拟，Playwright + CDP `Input.dispatchTouchEvent`）**：
- panMode 生效 → 页面 provider `touch-action: auto` ✓
- 上滑 → `pointercancel` 触发（浏览器把手势认领为滚动，不再选字）✓
- **长按 + 拖动 → Action Sheet 出现且含真实文本**（如「复制解释选中内容 翻译选中内容 …」），
  证明原生 pointer-drag 选字可用 ✓
- 静止长按选词：干净首次交互正常；E2E 通过 `src/lib/longPressSelect.test.ts`（5 cases）对仲裁器逻辑做
  确定性单测（`HOLD_MS` 后派发 `dblclick`、提前移动不派发、armed 后 `touchmove` 被 `preventDefault`、
  双指忽略、teardown 移除监听）。

**⚠️ 排查中踩到的坑（重要）**：
- **CDP 合成的 touch 不会触发 EmbedPDF 视口的原生滚动**（移动上下文里 `wheel` 也不滚动；桌面上下文
  `wheel` 才滚动）。因此「上滑=滚动」只能**结构验证**：浏览器对页面内拖动派发 `pointercancel`
  （即它已认领为滚动），而不是去断言像素滚动。
- **`dblclick → onWordSelect` 的选区路径在「已存在选区」后内部状态不稳定**（harness 中时好时坏），
  干净首次交互正常。所以把**可靠的选字主体放在原生 drag**（按住后拖动），`dblclick` 仅作静止长按的补充，
  且加 `hasOpenSelection()` 守卫避免在不稳定状态下重复触发。
- 选区 overlay（SVG）存在时 `document.elementFromPoint` 返回该 SVG（在 provider 子树内的兄弟节点）；
  无选区时返回 `.pdf-page`。仲裁器用 `elementFromPoint` 取**最深元素**作为 `dblclick` 的 target，
  避免落到被 `shouldExcludeElement` 短路的包装元素上。

---

## Bug 3 — 放大后上滑网站崩溃

**根因**（见背景 §6）：`<RenderLayer>` 不设 `scale` 时用 `zoom × dpr` 渲染整页位图且**无上界**，
放大后单页位图可达数百 MB；连续放大直至标签页被系统杀掉。

**修复**（`src/components/PdfScroller.vue`）：给 `<RenderLayer>` 固定 `:scale="0.5"`，并加
`<TilingLayer>`（视口大小 tile，官方 viewer 示例同款 `scale=0.5`）。固定 scale 是便宜的 CSS 放大底图，
tiling 用视口大小 tile 补清晰。

**验证**（iPhone 13，低内存标志）：把 zoom 推到 1366% —— 之前在 286% 约 521MB 崩溃；修复后
基础 `scale=1` 在 1366% 约 135MB 持平；改为 `scale=0.5` 后降到约 71MB（`900x1230` tile）并保持平稳。
`crashed = false`。

---

## 验证总览

| 项 | 方式 | 状态 |
|----|------|------|
| Bug 1 | Playwright 未开文档点 zoom | 通过（pageerrors=0） |
| Bug 3 | Playwright 推到 1366% | 通过（~71MB 平稳，曾崩溃） |
| Bug 2 swipe→滚动 | Playwright CDP touch，断言 `pointercancel` | 通过（结构验证） |
| Bug 2 长按+drag 选字 | Playwright CDP touch，断言 Action Sheet 含真实文本 | 通过 |
| Bug 2 仲裁器逻辑 | `vitest` 单测 | 通过（5/5） |
| 全量 | `npm run typecheck` + `npm test` | 通过（59/59） |

**回归测试**：`src/lib/longPressSelect.test.ts`（新增，需 `jsdom` devDependency）。
`package.json` 另增 `@embedpdf/plugin-pan`、`@embedpdf/plugin-tiling` 运行依赖。
