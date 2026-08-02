<!--
Triage label: ready-for-agent
Synthesized from the /grill-with-docs session (do NOT re-interview).
Design source of truth: ADR-0016 (生词本独立于书签), ADR-0001 (标注留浏览器), CONTEXT.md（生词本 / 词汇卡 / 面板 / 底部 Tab 栏）.
-->

# Spec: 生词本（Vocabulary Book）

## Problem Statement

朗读「词汇卡」提供了点词查音标 + 单词语音的能力，但词过即忘——用户无法把有价值的词留下来反复听、回顾语境。原 `书签` 模型只存页码 + 滚动、不含文本，不能承载「收藏词」。若不解决落点，朗读的词汇差异化能力是一次性消费，价值大打折扣。

## Solution

新增独立的**生词本**：从词汇卡「收藏」写入，持久化于浏览器 localStorage，刻意偏离 `书签` 的「不存文本」约束（ADR-0016），但文本仅留浏览器、不上传（ADR-0001）。提供浏览、跳转回源、重听发音、删除。

### 数据模型（词条 Entry）

```
{
  id: string            // 本地生成
  word: string          // 收藏的词（来自词单元）
  phonetics: string     // IPA，收藏时捕获；非英文可能为空
  context: string       // 收藏时的选区语境句（可空）
  documentTitle: string // 来源文档干净题目（可空）
  page: number | null   // 来源页码，用于跳转回源
  createdAt: number     // 收藏时间
}
```

- **去重**：同一文档内同词只保留一条；重复收藏更新 `context` / `phonetics` / `createdAt`，不增冗余。
- **存储**：新增 localStorage key（如 `vocabBook`），由 `stores/vocab.ts`（pinia）读写；不在「文档与标注不上传」之外新增任何外发。

### 组件 1 — 词汇卡「收藏」入口

朗读文字视图点词 → 词汇卡出现「收藏」按钮：
- 点击写入生词本（去重逻辑如上）；按钮变为「已收藏」，可再点取消（从生词本移除）。
- 尊重 ADR-0013 外部请求开关：关闭时音标/发音被拦截并 toast，但**收藏动作本身不依赖外部请求**，仍可收藏（仅 `phonetics` 可能为空）。
- 复用现有 `speakWord` 做发音、`fetchPhonetics` 做音标捕获。

### 组件 2 — 生词本面板（桌面）/ 底部 Tab 栏入口（移动端）

- 桌面：可折叠「生词本面板」，与 目录/对话 并列，受 `ui` store 独立开合控制（沿用 ADR-0009/0014 面板范式）。
- 移动端（≤768px）：下沉为底部 Tab 栏新入口，与 目录/对话/搜索 并列。
- 列表按 `documentTitle` 分组（无标题归「未命名文档」），组内按 `createdAt` 倒序。
- 每行：词 · 音标（若有）· 语境句摘要；操作：`播放`（重合成单词语音，复用 `speakWord`）· `跳转`（打开来源文档并滚动到 `page`；文档已关闭则仅展示语境句）· `删除`。

### 状态覆盖（复用四态约定，见 spec-ui-redesign）

- **空**：生词本为空时显示空状态——提示「在朗读中点词即可收藏」，并指向朗读功能。
- **错误**：localStorage 读写异常 → 提示并可重试（极少见）。
- **无音标**：非英文词条 `phonetics` 为空，行内不显示音标，不报错。

## Out of Scope（本轮不做）

- 导出 / 同步到云端（若做须用户显式触发、仍不出浏览器自动外发，ADR-0016）。
- 用户自定义释义 / 笔记（仅捕获 IPA 与语境句）。
- 跨文档全局去重（仅同文档内去重）。
- 生词本内编辑词或音标。
- 与 LLM 联动生成例句 / 测验（后续增强）。

## 参考

- ADR-0016（生词本独立于书签）· ADR-0001（标注留浏览器）· ADR-0009/0014（面板 / 底部 Tab 栏范式）· ADR-0013（外部请求开关）
- CONTEXT.md：生词本 / 词汇卡 / 面板 / 底部 Tab 栏 / 词单元 / 单词发音 / 单词音标
- 现有实现：`src/lib/tts.ts`（`speakWord`）、`src/lib/phonetics.ts`（`fetchPhonetics`）、`src/components/ReadAloudPanel.vue`（词汇卡）、`src/stores/*`
