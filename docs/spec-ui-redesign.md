<!--
Triage label: ready-for-agent
Synthesized from the /grill-with-docs session (do NOT re-interview).
Design source of truth: ADR-0012 (visual language), ADR-0013 (privacy disclosure), CONTEXT.md.
-->

# Spec: UI 层重设计 — 产品化 + 沉静编辑式视觉语言

## Problem Statement

产品功能可用，但整体体验仍像"原型"而非"已发布的产品"：界面与自身既定设计口径（CONTEXT.md / ADR）不一致、存在会把用户卡死的死路、缺少完整的状态覆盖（加载 / 空 / 错误 / 无文本层），且部分交互存在双标（清空无确认、删自定义动作却有确认）。最刺眼的是空状态承诺"绝不上传"，但朗读 / 音标实际会把选中片段发往第三方接口，口号与行为冲突、损害信任。用户会在打开失败、首启遮挡、朗读找不到面板、隐私口号等节点困惑或卡住，产品缺乏"shipped"的可信度。

## Solution

本轮只做 **UI 层重设计**，目标"产品化 + 现代化"，不改动任何业务逻辑、存储或 API 契约：

- 采用自研的**「沉静编辑式 / Calm Editorial」**现代视觉语言（ADR-0012）：中性灰阶底 + 单一克制强调色靛蓝 `#5B5BD6`、柔和分层阴影 + 1px 发丝边取代毛玻璃、10–14px 圆角、短（150–200ms）有目的动效、暗色模式一等公民。
- 建立全局可复用的**四态约定**（loading / empty / error / no-text），先在入口落地，再复用于对话 / 设置 / 朗读。
- 把入口、对话核心循环、朗读面板、设置、搜索、书签逐项产品化：补齐状态、消除死路、统一行为。
- 修复结构性一致性：桌面面板改为**独立开合**（兑现 CONTEXT.md）、面板状态持久化统一、移动端主题切换还原顶栏。
- 修订隐私口径（ADR-0013）：移除空状态的绝对口号，设置中如实披露「朗读 / 音标」等外部请求并可开关；文档与标注不上传服务器的核心（ADR-0001）不变。

## User Stories

1. As a first-time desktop reader, I want a clear empty/landing state that explains the product's value and how to open a PDF, so that I know what to do without hunting.
2. As a reader opening a PDF, I want a bounded loading state with a cancel option, so that I am never stuck on an infinite spinner.
3. As a reader opening an encrypted, corrupt, or unsupported PDF, I want a clear error message with a retry path, so that I understand what failed and can recover.
4. As a reader dragging a non-PDF file onto the app, I want an immediate toast saying only PDFs are supported, so that the silent ignore doesn't leave me confused.
5. As a reader opening a scanned (no text layer) PDF, I want a dismissible notice explaining it is unsupported, so that I am informed without being stuck.
6. As a first-time mobile reader, I want the app to open to the document rather than a conversation drawer covering it, so that I can actually start reading.
7. As a reader who selected text and triggered an action, I want a readable summary as my first message instead of a raw prompt dump, so that the conversation looks like a real product, not a debug view.
8. As a reader watching the LLM generate, I want a Stop control, so that I can halt an unwanted or over-long response.
9. As a reader, I want a confirmation before Clear conversation, so that I don't lose history by accident (matching the existing confirm-on-delete-custom-action behavior).
10. As a reader with an empty conversation, I want a helpful empty state prompting me to select text, so that I know how to begin.
11. As a reader asking a follow-up, I want a new selection to re-anchor into the same thread, so that context is preserved (per 对话 model).
12. As a reader triggering 测试朗读 from Settings, I want the read-aloud panel to appear above the Settings modal, so that I can actually see and use it.
13. As a reader with the read-aloud panel open, I want to dismiss it via Esc or by clicking outside, so that I am not forced to hunt for the ✕.
14. As a mobile reader, I want the read-aloud panel not to cover the bottom Tab 栏, so that I keep navigating.
15. As a reader generating speech, I want a loading state with a cancel option, so that I am not stuck waiting.
16. As a settings user adding a custom action, I want my draft preserved (or the outer Save disabled) if I forget to tap 添加动作, so that my work isn't silently lost.
17. As a settings user, I want 恢复默认 (endpoint) relabeled 清除 with a confirm, so that I don't accidentally wipe my endpoint.
18. As a settings user testing the endpoint connection, I want clear loading/error states, so that I know whether it succeeded.
19. As a keyboard user in Settings, I want inputs to autofocus, so that I can type immediately.
20. As a settings user, I want a disclosure of which features send selected text to third-party APIs, with a toggle to disable them, so that I stay in control of external requests.
21. As a reader searching, I want matches highlighted on the page (current match stronger, others weaker), so that I can see where I landed.
22. As a reader, I want prev/next navigation (⌘G / Shift+⌘G / Enter) through results, so that I can move between matches.
23. As a reader, I want the search input to autofocus, so that I can type immediately.
24. As a reader with no results or an empty query, I want a clear empty state, so that I'm not staring at a blank panel.
25. As a mobile reader, I want the search bar to fit the viewport and sit above the Tab 栏, so that it is usable.
26. As a reader bookmarking a position, I want to add an optional name/note, so that multiple bookmarks are distinguishable.
27. As a mobile reader, I want the bookmarks empty state to show a tap hint (not ⌘D), so that the hint matches my device.
28. As a reader, I want bookmarks to keep storing only page + scroll position, so that no document content is retained.
29. As a desktop reader, I want the 目录 and 对话 panels to open independently, so that I can view the outline while chatting.
30. As a reader, I want panel open/closed state to persist consistently whether I close via button or scrim, so that a refresh doesn't surprise me.
31. As a mobile reader, I want a theme toggle in the top bar, so that I can switch light/dark without opening Settings.
32. As a privacy-conscious reader, I want the empty state to NOT over-claim "nothing leaves the browser" while external feature APIs are used, so that the product stays honest.
33. As a reader, I want a calm, modern visual language (neutral palette, single accent, soft elevation, hairline borders, restrained motion, first-class dark mode), so that reading feels focused and the product feels shipped.
34. As a dark-mode reader, I want dark mode to be a designed experience, so that it is not an afterthought.

## Implementation Decisions

- **设计令牌集中化**：颜色阶（中性灰阶 + 强调色 `#5B5BD6`）、圆角（10–14px）、阴影 / 发丝边、动效（150–200ms）统一为一套设计令牌，应用到 Toolbar、ActionSheet、BottomTabBar、SettingsPanel、ReadAloudPanel、ConversationPanel、SearchBar、CommandPalette、LeftPanel、OutlinePanel、BookmarksPanel。视觉语言见 ADR-0012。
- **四态约定**：定义可复用的状态呈现（loading / empty / error / no-text），先在阅读器表面落地，再复用于对话 / 设置 / 朗读。阅读器表面为首个承载者。
- **stores/ui**：目录与对话面板改为**独立开合**（开一个不再关另一个），兑现 CONTEXT.md；面板状态持久化统一——按钮关与遮罩点关都走同一 `saveBoolean`，刷新后行为一致。
- **stores/reader**：打开增加有上限的 loading + 取消；损坏 / 加密 / 不支持 → `error` 态 + 重试；非 PDF 拖入 → 拒绝并 toast；无文本层 → 可关闭提示。
- **stores/conversation**：生成中暴露 `stop`（中断流式）；`clear` 走确认（与删自定义动作对齐）；首条用户消息渲染可读摘要而非原始 prompt 模板；空态套四态。对话不持久化（ADR-0004）不变，四态为空态为纯 UI。
- **stores/settings**：保留显式保存草稿模型；自定义动作未"添加"就点外部保存时，禁用外部保存或自动收纳草稿，杜绝静默丢失；端点"恢复默认"改名"清除"并加确认；端点"测试连接"套四态（loading/error）；关键输入自动聚焦；新增「朗读 / 音标」外部请求披露 + 开关。
- **stores/bookmarks**：允许可选备注 / 名称（默认仍"第 N 页"）；空态按平台显示提示（桌面 ⌘D，移动显示点 Tab 栏的书签 + 按钮）；仍仅存页码 + 滚动位置。
- **组件层**：ActionSheet 按 ADR-0012 重绘（去毛玻璃）；BottomTabBar 按新视觉重绘（主题切换留在顶栏，不在此）；Toolbar 移动端还原主题切换；ReadAloudPanel 层级提到设置弹窗之上、支持 Esc / 外部点击关闭、移动端不遮 Tab 栏、生成中 loading 可取消；SettingsPanel 修脚枪 + 披露开关；SearchBar 高亮 + 上/下一个 + 自动聚焦 + 空态 + 移动端自适应；ConversationPanel 停止按钮 + 清空确认 + 首条摘要 + 空态；BookmarksPanel 备注 + 空态提示。
- **隐私（ADR-0013）**：空状态移除"绝不上传"绝对口号；设置披露并开关「朗读 / 音标」外部请求；CONTEXT.md 顶部隐私句已改为修订口径。
- **遵守的 ADR**：ADR-0001（无自有后端、文档 / 标注不上传）不变；ADR-0004（对话不持久化）不变；ADR-0009 功能决策（泡泡栏形态、底部 Tab 栏、不新增全选 / 分享）仍有效，仅视觉被 ADR-0012 取代；ADR-0011（音标走外部词典）因 ADR-0013 现在需如实披露。
- **不变更**：业务逻辑、存储 schema、API 契约、TTS / 音标架构（仅新增披露与开关）；不引入自有后端。

## Testing Decisions

- **只测外部行为，不测实现细节。** 状态的正确性通过 store 边界验证，跨表面的用户流通过 e2e 验证。
- **Seam 1 — Store / 状态层（单元，复用现有 Vitest harness）**：`ui`（独立开合、按钮 / 遮罩持久化一致）、`reader`（error / 取消 / 非 PDF / 无文本层可关）、`conversation`（stop / clear 需确认 / 首条摘要）、`settings`（自定义动作草稿不丢 / 端点测试态 / 外部请求开关）、`bookmarks`（备注 / 平台空态）。
- **Seam 2 — E2E 流（复用现有 Playwright：`e2e/app.spec.ts`、`e2e/reader.spec.ts`）**：打开失败流（spinner→error→retry）、非 PDF toast、朗读在设置之上 + Esc / 外部关闭 + 不遮移动 Tab、桌面面板独立、移动端主题切换、搜索高亮 + 上/下一个。
- **Prior art**：现有 `src/lib/*.test.ts`（13 个）覆盖 `context / actions / search / tts / phonetics` 等纯逻辑；`e2e/app.spec.ts`、`e2e/reader.spec.ts` 覆盖应用与阅读器流。新测试沿用同款 harness，不引入新的组件级测试 seam——四态呈现通过上述两个 seam 间接验证。
- **好的测试标准**：断言"用户可见的状态与行为"（某面板是否开、是否进入 error、是否能停止、是否可关），不断言 CSS 类名或内部私有字段。

## Out of Scope

- 引入自有后端、文档上传（ADR-0001 维持）。
- 对话持久化（ADR-0004 不变）——本轮不重开。
- IA 整体重做（左轨 + 右坞）——曾考虑，已推迟；面板维持三栏独立开合。
- 搜索改为常驻侧栏——推迟。
- 书签按内容哈希 keying——推迟（可选增强）。
- 新增「全选 / 分享」动作——仍按 ADR-0009 不做。
- 改动 TTS / 音标架构——仅新增披露与开关。

## Further Notes

- 视觉语言是所有改动的基底：**先建设计令牌，再逐表面换肤**。
- 建议落地依赖顺序：令牌 → 入口 + 四态 → 对话核心循环 → 朗读 → 设置 → 搜索 → 书签 → 面板 / 持久化 → 移动端主题。
- 设计决议已固化为 ADR-0012、ADR-0013，CONTEXT.md 已同步更新，是本 spec 的权威来源。
