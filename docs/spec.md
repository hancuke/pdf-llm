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
