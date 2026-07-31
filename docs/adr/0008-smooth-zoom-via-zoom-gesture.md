# 缩放性能：内置手势 + 变换预览，落定才重渲染

缩放必须"看起来"丝滑。本项目的缩放交互（双指捏合、Ctrl/⌘ + 滚轮、移动端 pinch）统一使用 EmbedPDF 内置的 `useZoomGesture`（`src/components/PdfScroller.vue` 中包裹 `<Scroller>`），而不是手写逐帧缩放。

核心原理：手势进行中对**已经渲染好的页面位图**只施加 CSS `transform: translate(...) scale(...)`（GPU 合成，几乎零成本），把缩放"预览"出来；只有当手势结束（touchend，或滚轮停止 150ms 后）才调用一次 `requestZoom` 真正让 PDFium 按新比例重新栅格化。昂贵的重渲染每轮手势只发生一次，因此流畅。参考站 `app.embedpdf.com` 的丝滑正是同一套机制。

这是一个容易重蹈覆辙、值得记录的坑：早期实现曾在每次 `pointermove` 直接调用 `requestZoom(target)`，意图让缩放实时跟随手指。但 `requestZoom` 会触发整页位图重新栅格化，于是每一帧都在做重渲染 → 缩放明显卡顿。平滑的关键不在"调用得够频繁"，而在"手势中只变换、落定才重渲染"。若未来要新增缩放手势，应复用内置 `useZoomGesture`，或严格遵守"变换预览 + 结束时提交"模式，绝不在手势过程中逐帧 `requestZoom`。

代价与边界：双击 / 双指轻点切换缩放（`PdfDocument.vue` 的 `onDblClickZoom`）仍用单次 `requestZoom`——这是一次性的重渲染，体验可接受，不在手势循环内故不卡。移动端把左右面板统一为底部抽屉、选中菜单改为选中文字上方的横向图标条，三者占用不同屏幕区域，不与底部抽屉冲突。
