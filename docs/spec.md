<!--
Triage label (not yet applied — no issue tracker configured in this repo,
and /setup-matt-pocock-skills was not run): ready-for-agent
This spec is synthesized from the /grill-with-docs session; do NOT re-interview.
-->

# Spec: PDF-LLM — 本地 PDF 选中即 LLM 辅助理解

## Problem Statement

用户经常在本地阅读 PDF（论文、文档、资料），遇到不懂的段落想立刻获得解释、翻译或追问，但现有流程要把内容复制出去、贴进聊天工具、再手动补上下文，割裂且易丢语境。用户也不愿把本地文档上传到任何服务器。缺少一个纯本地的、能在 PDF 里直接选中文字、由 LLM 结合上下文辅助理解的网站。

## Solution

一个纯浏览器的静态网站（无自有后端）：用户本地打开 PDF，在渲染层选中文字后弹出 iOS 风格的操作菜单，选择"翻译 / 解释 / 总结 / 换种说法"或自定义动作；系统以"选中内容所在段落"为上下文，调用用户自有 Key 的 OpenAI 兼容端点发起多轮对话。文档字节、选中内容与对话历史始终只存在于浏览器，永不上传。

## User Stories

1. As a reader, I want to open a local PDF via file picker or drag-drop, so that I can read it in the browser without uploading it anywhere.
2. As a reader, I want the PDF to render with a selectable text layer, so that I can highlight any passage like in a normal reader.
3. As a reader, I want to be warned when I open a scanned/image PDF (no text layer), so that I am not confused by why selection does nothing.
4. As a reader, I want to select text and see an iOS-style Action Sheet appear at the selection, so that the next action is one tap away.
5. As a reader, I want a "解释选中内容" Quick Action, so that I can get an explanation without typing a prompt.
6. As a reader, I want a "翻译选中内容" Quick Action, so that I can translate the passage instantly.
7. As a reader, I want a "总结" and "换种说法" Quick Action, so that I can get alternative renderings of the passage.
8. As a reader, I want the LLM to see the paragraph containing my Selection as Context, so that explanations are grounded in surrounding text.
9. As a reader, I want Context to fall back to N sentences around my Selection when no paragraph boundary can be detected (e.g. multi-column PDFs), so that I still get useful context on messy layouts.
10. As a reader, I want to follow up with free-text questions in the same Conversation, so that I can dig deeper without re-selecting.
11. As a reader, I want every follow-up to resend the first paragraph Context plus the full Conversation History, so that the model stays grounded as I ask more.
12. As a reader, I want to create my own Custom Actions with my own prompt templates, so that I can codify repeated tasks (e.g. "explain like I'm five").
13. As a reader, I want my Custom Actions to survive a page refresh, so that I don't rebuild them each session.
14. As a reader, I want to configure my Endpoint (base URL), API Key, and Model, so that the site calls my own LLM account.
15. As a reader, I want my API Key stored in localStorage on my own device, so that I never send it to a server owned by this app.
16. As a reader, I want to point the Endpoint at a local OpenAI-compatible model (e.g. Ollama), so that I can run fully offline.
17. As a reader, I want to be blocked from invoking an action when Endpoint/Key are missing, with a prompt to open Settings, so that I get a clear error instead of a silent failure.
18. As a reader, I want LLM errors (including CORS failures) surfaced inside the Conversation, so that I know why a call failed.
19. As a reader, I want the Conversation History to be cleared on refresh, so that sensitive excerpts don't persist on my machine.
20. As a reader, I want streaming or at least progressive responses, so that long explanations don't block the UI.
21. As a reader, I want the Action Sheet to disappear if I click elsewhere or change selection, so that it doesn't get in the way.
22. As a reader, I want to open a new Document and have the current Conversation cleared, so that context from a previous doc doesn't leak.

## Implementation Decisions

- **Architecture posture (ADR-0001):** Pure client-side static site. PDF parsed in-browser with pdf.js; no self-owned backend; LLM requests go browser → provider directly. The Document never leaves the browser.
- **Text Layer only (ADR-0002):** Only PDFs with an embedded Text Layer are supported. When `page.getTextContent()` is empty, selection is disabled and the user is notified that scanned/image PDFs are unsupported. No OCR.
- **OpenAI-compatible Endpoint (ADR-0003):** All LLM calls use the OpenAI `chat/completions` protocol. `baseURL`, `API Key`, and `Model` are user-configured; the same code path serves cloud providers and local models.
- **No Conversation persistence (ADR-0004):** Conversation History lives only in memory and is cleared on refresh. Only Custom Actions are persisted (localStorage).
- **Stack (ADR-0005):** Vite + Vue 3 (Composition API) + Tailwind CSS, producing a static build. Pinia for state.
- **Context (领域规则):** `extractContext(rawText, selectionRange)` returns `{ selectedText, contextText }`. It prefers the paragraph block containing the Selection; when paragraph boundaries are undetectable it falls back to N sentences around the Selection (split on newlines/punctuation). This pure function encodes the domain rule and is the primary unit under test.
- **Message assembly:** `buildMessages(action, context, selection, history)` returns the OpenAI-compatible `messages[]`. The first user message carries the action template + Context + Selection; subsequent user messages are appended. Because the full array is sent each call, the first-paragraph Context and full History are naturally resent every turn (satisfies story 11).
- **LLM client:** `chat(messages, settings)` performs `POST {baseURL}/chat/completions` with `Authorization: Bearer <API Key>`. Returns assistant content (streaming optional). Failures (network/CORS/provider errors) are reported back to the Conversation.
- **Settings & storage:** localStorage keys hold `endpoint`, `apiKey`, `model`, `customActions`. API Key is stored as-is on the device (story 15); no transmission to a self-owned server.
- **Selection detection:** `PdfViewer` listens for `mouseup` / `selectionchange`, reads `window.getSelection()`, maps it to a page, and calls `extractContext`. The Action Sheet is positioned at the selection's bounding rect.
- **State modules:** `settings` store (persisted), `reader` store (current Document + rendered pages), `conversation` store (active Conversation, in-memory), `actions` module (preset + custom).

## Testing Decisions

Test external behavior at the highest seams; do not test pdf.js DOM selection or rendering internals.

- **Seam 1 — Context extraction (`lib/context.ts`):** Unit test `extractContext`. Cases: normal single-paragraph selection returns the whole paragraph as Context; multi-paragraph selection returns the enclosing paragraph(s); multi-column/messy text with no paragraph boundary returns N sentences around the Selection (Context Fallback); empty/whitespace selection returns empty Context. This is the highest-value seam because it pins the domain rule.
- **Seam 2 — Message assembly (`lib/actions.ts`):** Unit test `buildMessages`. Cases: first message contains action template + Context + Selection; a follow-up appends a new user message without duplicating Context; Custom Action templates are interpolated correctly; history length grows by one per turn.
- **Seam 3 — LLM client (`lib/llm.ts`):** Integration test against a stub OpenAI-compatible endpoint. Verify the request carries `Authorization: Bearer <API Key>`, the body contains `model` and the assembled `messages`, and streamed/non-streamed responses are parsed into assistant content. Also assert that a CORS/network error is propagated (not swallowed).
- **What makes a good test here:** assert on the produced `messages[]` shape and the resulting Context string — not on how pdf.js renders. Avoid browser-only selection tests; cover the Conversation flow via the pure `buildMessages` seam instead.
- **Prior art:** none in repo yet; these three seams are new and should be the canonical test locations.

## Out of Scope

- Scanned/image PDFs and OCR (ADR-0002).
- Persistence of Conversation History across refresh (ADR-0004).
- Multi-document concurrency / cross-document conversations (first version is single Document).
- Server-side caching, accounts, or cross-device sync (ADR-0001).
- Semantic guarantees for cross-page paragraphs, formulas, or in-figure text (degrade via Context Fallback).
- Vendor-specific LLM SDKs (only the OpenAI-compatible protocol is used, ADR-0003).

## Further Notes

- The seam tests (1–3) are sufficient to validate the core domain logic without a browser. The PdfViewer selection path should be covered by manual testing only.
- CORS is a real constraint for browser-direct LLM calls; users pointing at endpoints without CORS headers must use a CORS-friendly or local endpoint. This is documented in-product (story 18) but cannot be fully solved client-side.
- Glossary of terms used above (Document, Text Layer, Selection, Context, Context Fallback, Action Sheet, Quick Action, Custom Action, Conversation, Conversation History, Endpoint, API Key, Model) is defined in `CONTEXT.md`; architectural decisions in `docs/adr/0001`–`0005`; module/data-flow plan in `docs/technical-plan.md`.

---

# Phase 2 — 产品化（本轮迭代，由 /grill-with-docs 会话敲定）

在保留首版纯客户端、不持久化内容（ADR-0001 / ADR-0004）的前提下，把产品从"能用"推向"像产品、现代化"。以下决策均已在会话中敲定。

## 布局与导航（Locked Decisions）

- **三栏可折叠布局**：`目录面板 | PDF 面板 | 对话面板`，三栏均可由顶部**工具栏**独立展开/收起；收起时其余栏自动占满宽度。
- **目录面板（Outline）**：展示 PDF 自带的嵌入目录树（PDF 规范中的 "Bookmark"），**只读**；点击条目跳转到对应页。**不做**滚动联动高亮（scroll-spy）。
- **书签面板**：目录面板以 Tab 形式提供第二栏 `目录 | 书签`。**书签**为用户自建的"位置记忆"，仅存页码+滚动位置，不含文字/对话；通过 `Cmd/Ctrl+D` 或书签按钮创建（**不在** LLM 操作菜单中）。书签与上次阅读位置写入 `localStorage`（见 ADR-0006）。
- **对话面板显隐**：工具栏可 toggle 隐藏对话栏；隐藏态下一旦触发 LLM 操作则**自动重新展开**（隐藏=只读模式，而非"关闭"）。对话内容仍不持久化。

## 工具栏内容

常驻顶部：打开/文件名、目录开关、对话开关、缩放控件、跳页输入、主题切换、命令面板触发（`Cmd/Ctrl+K`）、设置入口。

## 新增 User Stories（续）

23. As a reader, I want a top toolbar with pane toggles and document controls, so that the app feels like a real product rather than a bare prototype.
24. As a reader, I want the left panel to show the PDF's embedded Outline and jump to a section on click, so that I can navigate long docs without scrolling blindly.
25. As a reader, I want to save a Bookmark (`Cmd/Ctrl+D`) that remembers a page + scroll position, so that I can return to it later across refreshes.
26. As a reader, I want my last reading position per document remembered automatically, so that reopening resumes where I left off (positions only, no content persisted — ADR-0006).
27. As a reader, I want in-PDF search (`Cmd/Ctrl+F`) with jump-to-match and highlight, so that I can locate text like in any real reader.
28. As a reader, I want zoom and jump-to-page controls in the toolbar, so that I can control the reading view.
29. As a reader, I want a light/dark/sepia theme that follows my OS setting, so that the app feels modern and is comfortable to read in.
30. As a reader, I want keyboard shortcuts plus a command palette (`Cmd/Ctrl+K`) listing open/toggle/search/theme/export actions, so that power-user flows are fast.
31. As a reader, I want to export/copy the current Conversation as Markdown, so that I can take LLM results with me (user-initiated; respects no-auto-persist).

## Implementation Decisions（Phase 2）

- **持久化分层（ADR-0006）**：坐标类状态（书签、上次位置、主题、面板显隐）写 `localStorage`；内容类状态（文档字节、Selection 摘录、Conversation）仍不持久化。书签存储 schema 不得被悄悄扩展为存摘录/对话。
- **目录交互**：仅点击跳转，不实现 scroll-spy（已明确取舍，降低依赖与复杂度）。
- **书签创建入口**：`Cmd/Ctrl+D` + 书签按钮，独立于 LLM Action Sheet。
- **命令面板** 为统一入口，聚合工具栏所有动作（含打开文件、搜索、主题切换、导出对话）。
- **现代化卫生项**（默认纳入，不单独决策）：空状态、加载骨架、面板展开/收起过渡动画。

## Out of Scope（Phase 2）

- 滚动联动高亮（scroll-spy）。
- 持久化高亮/批注/对话（违反 ADR-0004 / ADR-0006 的内容分层原则）。
- 云端同步、账号、跨设备。
- 自动持久化文档字节（IndexedDB 存全文档）——如需"重开即恢复文档"须作为新 ADR 决策。
- 多文档并发 / 标签页（首版仍单文档）。

---

# Phase 3 — 交互重设计：知识增强的选中聚焦澄清

由 /grill-with-docs 会话敲定。前提：本项目的 PDF 均为**社会公开资料**，LLM 训练时大概率已见过全文。据此把 LLM 的核心定位从"严格基于段落文本的复述器"改为「选中聚焦型澄清」（ADR-0007）。

## 设计原则（Locked）

- **片段锚定 + 知识增强**：LLM 只对选中内容做反应；但可借助其对本文的潜在全文认知 + 通用知识来解释。
- **Context 配方**：`干净题目 + 选中内容所在整段`（含选中内容）。不发送全文。
- **段落硬锚 + 知识补充**：以提供的段落为硬锚，模型知识仅作补充；不确定时必须声明"以下仅基于你给出的文本"。
- **回答基线**：富文本 Markdown + 数学公式渲染（KaTeX）。Mermaid 图示暂缓。
- **对话线程**：每文档单一活跃线程；新选中重设锚点并入同一对话、保留历史；用户手动清空。
- **讲解风格**：全局开关（默认 / 通俗大白话 / 小学生级），对所有快捷动作生效。

## 新增 / 修订 User Stories

32. As a reader, I want the app to extract a clean title from the PDF's metadata or first page (not the raw filename) and send it to the LLM, so that the model can leverage its prior knowledge of the document.
33. As a reader, I want the LLM to clarify *only* my Selection rather than write about the whole document, so that I understand the specific part I'm stuck on.
34. As a reader, I want the LLM to be allowed to use its own knowledge of the document and general knowledge (analogies, examples, related concepts), so that explanations are easier to grasp.
35. As a reader, I want the LLM to ground primarily in the provided paragraph and disclose when it goes beyond the text or is uncertain, so that I am not misled.
36. As a reader, I want a global "explanation style" setting (default / plain-language / ELI5) that applies to all actions, so that answers match how I want to learn.
37. As a reader, I want LLM answers rendered as Markdown with math (KaTeX), so that formulas and structure are readable.
38. As a reader, I want a "clear conversation" control, so that I can reset the thread when a new topic starts (since new selections merge into the same thread).

> 与旧 story 11 的冲突：原 story 11 规定"每次追问都重发首段上下文"。在 Phase 3 模型下，改为**新选中时重设锚点（用新段落）但保留历史**；同一锚点内的追问不再强制重发段落。story 11 视为被本设计取代。

## Implementation Decisions（Phase 3）

- **Context 配方（`buildMessages`）**：每条 LLM 请求携带 ① 干净题目（一行 meta）② 选中内容所在段落（多栏/乱序无法判段落边界时退化为 Context Fallback 的 N 句，沿用「上下文降级」）③ 选中内容。
- **System Prompt（选中聚焦澄清）**：写入——"聚焦解释用户选中的内容；可结合你对本文的潜在已有认知与通用知识（类比/举例/关联）来帮助理解，但不得离题扩写；优先基于给出的段落，若不确定是否见过全文，须声明'以下仅基于你给出的文本'。"
- **讲解风格（Explanation Style）**：`settings` store 新增 `style` 字段，持久化于 localStorage；在 system prompt / 动作模板中注入对应措辞（如"用小学生也能懂的话"）。
- **快捷动作集**：解释(发散) / 翻译 / 打个比方 / 关联概念 / 为什么重要 / 总结 / 自定义动作（自定义动作机制沿用，模板可引用 `{{context}}` / `{{selection}}` / `{{title}}` / `{{block}}`；讲解风格通过系统提示注入，不在模板变量中）。
- **回答渲染**：对话面板以 Markdown 渲染，启用 KaTeX 公式；代码块、表格、分点原生支持。Mermaid 图示为后续增强，本轮不实现。
- **对话线程**：每文档单一 `conversation` store 实例；选中新文字时更新"当前锚点段落"并 append 新 user turn（携带新段落上下文），历史保留；提供"清空对话"入口手动 reset。刷新仍清空（ADR-0004）。

## Out of Scope（Phase 3）

- Mermaid / 图示生成（后续增强）。
- 公式、表格、图片的"选中类型自适应动作"（文本层仅含文字，公式/图选取文本可能失真，暂不做类型识别）。
- 首次配置引导（Endpoint / Key 设置的 onboarding 优化）。
- 整篇文档级问答（维持片段锚定，A 方案）。


