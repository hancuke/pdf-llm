# PDF-LLM 技术方案

> 配套领域模型见 `CONTEXT.md`，决策见 `docs/adr/0001~0005`。
> 形态：纯浏览器静态站点（Vite + Vue 3 + Tailwind），无任何自有后端；PDF 与对话历史永不离浏览器。

## 1. 总体架构

```
浏览器单页应用
┌─────────────────────────────────────────────────────────┐
│  Settings Store  ← localStorage                         │
│   (endpoint / apiKey / model / customActions)           │
├─────────────────────────────────────────────────────────┤
│  Reader Store     (当前文档 + 已渲染页)                   │
│   └─ PdfViewer.vue  ── pdf.js 渲染页 + 文本层            │
│        │ 选中文字                                          │
│        ▼                                                 │
│   extractContext()  → { selectedText, contextText, page }│
│        │                                                 │
│        ▼                                                 │
│   ActionSheet.vue (iOS 风格)  → 选快捷/自定义动作         │
│        │ 触发                                             │
│        ▼                                                 │
│  Conversation Store (内存, 不持久化)                     │
│   └─ ConversationPanel.vue 多轮对话                      │
│        │ 组 messages                                      │
│        ▼                                                 │
│   llm.ts  ── POST {endpoint}/chat/completions (用户key)  │
└─────────────────────────────────────────────────────────┘
```

## 2. 模块划分

| 模块 | 文件 | 职责 | 对应领域概念 |
|---|---|---|---|
| 设置存储 | `stores/settings.ts` | endpoint/apiKey/model/customActions，localStorage 持久化 | 兼容端点、API 密钥、自定义动作 |
| 阅读器 | `stores/reader.ts` + `PdfViewer.vue` | 加载 PDF ArrayBuffer，逐页渲染 + 文本层，暴露选中 | 文档、文本层 |
| 上下文提取 | `lib/context.ts` | 由 Selection 定位段落；降级为前后 N 句 | 上下文、上下文降级 |
| 操作菜单 | `ActionSheet.vue` | 选中后定位弹出的 iOS 风格选项列表 | 操作菜单、快捷操作 |
| 对话 | `stores/conversation.ts` + `ConversationPanel.vue` | 维护 messages，首轮=动作模板+上下文+选中；后续轮重发首段+全历史 | 对话、对话历史 |
| LLM 客户端 | `lib/llm.ts` | OpenAI 兼容 `chat/completions` 调用（含流式/错误） | 模型、兼容端点 |
| 动作管理 | `lib/actions.ts` | 预置动作 + 自定义动作 CRUD | 快捷操作、自定义动作 |
| 持久化 | `lib/storage.ts` | 封装 localStorage 读写 | API 密钥、自定义动作 |

## 3. 数据流（端到端）

1. 用户通过拖拽 / `<input type=file>` 打开本地 PDF → `reader.load(file)` 读为 `ArrayBuffer` → pdf.js `getDocument`。
2. `PdfViewer` 逐页渲染 canvas + 文本层（pdf.js TextLayer），支持原生文字选中。
3. 用户选中文字 → `mouseup` 监听 → `window.getSelection()` 取到文本与所在页 → `extractContext(selection)` 产出 `{ selectedText, contextText, page }`。
4. 在选区坐标弹出 `ActionSheet`，列出：翻译 / 解释 / 总结 / 换种说法（预置）+ 用户自定义动作。
5. 用户点某动作 → 新建 `Conversation`，首条 user 消息 = `动作模板 + contextText + selectedText`。
6. `llm.chat(messages, settings)` → 追加 assistant 消息到对话（支持流式）。
7. 用户继续追问 → 追加新 user 消息 → 再次调用时**发送完整 messages**（上下文在首条消息中，天然随全历史重发）。
8. 设置与自定义动作写入 localStorage；对话仅内存，刷新即清。

## 4. 关键实现点

- **pdf.js**：用 `pdfjs-dist` v4，配置 worker；文本层用官方 `TextLayer` API，保证可选中。
- **段落判定**：文本层 DOM 中段落通常由 `div`（同字号/行高）聚合；优先取选中文本所在段落块；取不到（多栏乱序）时，回退为对整页文本按换行/标点切句，取选中句前后各 N 句。
- **无文本层**：`page.getTextContent()` 返回空 → 禁用选中并 toast「不支持扫描件/图片 PDF」。
- **LLM 调用**：请求头带 `Authorization: Bearer <apiKey>`；若端点不支持 CORS，调用失败并在对话中报错提示用户换用兼容/CORS 端点或本地模型。
- **缺失配置**：未填 endpoint/key 时，动作点击被拦截并引导去设置。
- **语言**：TypeScript（Vite+Vue 默认），类型对应领域概念。

## 5. 边界与未覆盖

- 扫描件 / 图片 PDF：明确不支持（ADR-0002）。
- 对话历史：不持久化（ADR-0004）。
- 跨页段落、公式/图表内文字：降级策略生效，不保证语义完整。
- 多文档并发：首版单文档；打开新文档清空当前对话。

## 6. 落地顺序（脚手架 → 迭代）

1. Vite+Vue3+Tailwind 初始化，装 `pdfjs-dist` / `pinia`。
2. `Settings` 面板 + localStorage。
3. `PdfViewer` 渲染 + 文本层选中。
4. `extractContext` 段落/降级逻辑。
5. `ActionSheet` + 预置/自定义动作。
6. `llm.ts` + `Conversation` 多轮（首段+全历史）。
7. 打磨 iOS 风格 UI 与错误态。
