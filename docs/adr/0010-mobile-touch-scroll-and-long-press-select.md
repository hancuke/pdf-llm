# 移动端：panMode 默认 + 长按仲裁器（滑动滚动 / 长按选字）

移动端（粗指针 `(pointer: coarse)`）需要在同一根手指上同时满足两件事：在 PDF 页面内**上滑滚动**，
以及**长按选字并可拖动扩展**。二者在 EmbedPDF 里天然互斥——`pointerMode` 把页面 `touch-action: none`
（拖动＝选字，永不滚动），`panMode`（`wantsRawTouch: false`）恢复原生滚动但会把拖动认领为滚动并触发
`pointercancel`，使 pointer 驱动的选字 handler 无法启动。

**决定**：

1. 粗指针下把 `panMode` 设为默认（`makePanDefault`），使页面 `touch-action: auto`，恢复原生滚动；
   非粗指针（鼠标）保持 `pointerMode` 拖拽选字。
2. 在包裹页面的元素上挂一个**长按仲裁器**（`src/lib/longPressSelect.ts`）：单指按住超过 `HOLD_MS=500ms`
   即“认领”为选字手势，此后 `touchmove` 一律 `preventDefault()`，阻止浏览器滚动、保住 pointer 流；
   选字本身交给 EmbedPDF 既有的 pointer handler（`pointerdown` 记锚点、`pointermove` 延伸选区），
   即「长按触发选字，然后拖动选择」。手指在阈值前移动则判定为滑动，不干预（浏览器滚动）。
3. 作为补充，静止长按重放一次 `dblclick`（→ `onWordSelect` 选词），仅在无已打开选区时触发。

**代价**：

- 选字依赖「按住后拖动」的原生 pointer 流；若某些浏览器在 `preventDefault` 后仍抢滚动，选字会失效
  （当前 CDP 无头环境下已通过 Action Sheet 验证可用）。
- `dblclick → onWordSelect` 在「已存在选区」后内部状态不稳，故只作为首次/干净交互的补充，主路径是 drag。
- 粗指针判断用 `matchMedia('(pointer: coarse)')`（`src/lib/pointer.ts`），比库内
  `'ontouchstart' in window` 更准（排除带触屏的笔记本）。
- 缩放交互交还给 pinch，故移动端双击缩放被禁用（`onDblClickZoom` 在粗指针下提前返回）。

**参考**：完整根因、EmbedPDF 内部机制与验证过程见
`docs/troubleshooting/embedpdf-three-bugs.md`（关联提交 `55b514a`）。
