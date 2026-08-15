# ADR-0019 — 设置导出 JSON 并接入 WebDAV 同步

用户希望跨设备复用配置：把「设置 + 书签 + 生词本」导出为 JSON，并可通过自有 WebDAV 服务器做备份与恢复。本应用是纯浏览器端、无后端（ADR-0001），因此同步必须由用户显式触发，且只在浏览器内或用户自有服务器之间流动。

**Considered Options**
- 自动/实时同步（监听变化防抖上传）：更省心，但增加网络请求与冲突/失败重试复杂度，超出本次诉求 —— 未采纳（本轮只做手动）。
- 新增云同步后端：违背 ADR-0001（无自有后端、文档与标注不上传）—— 未采纳。
- 本地 JSON 导出/导入 + 手动 WebDAV 备份/恢复（原生 `fetch`，Basic 认证）—— **采纳**。
- 同步内容仅限「设置」：用户已确认需含书签与生词本 —— 未采纳范围收窄版本。

**Consequences**
- 新增 `src/lib/snapshot.ts`：把 `settings` / `ui`(主题) / `bookmarks` / `vocab` 聚合成带 `schemaVersion` 的 JSON，支持 `buildSnapshot()` / `applySnapshot()`；对话历史始终不导出（ADR-0004）。
- 新增 `src/lib/webdav.ts`：仅用浏览器原生 `fetch` 做 `PUT`/`GET` + HTTP Basic 认证，不引入任何依赖。
- `settings` store 增加 WebDAV 配置（服务器地址/用户名/密码/远端文件名）与 `syncStatus`，以及 `exportSnapshot` / `importSnapshot` / `uploadToWebdav` / `downloadFromWebdav` 四个 action。
- 设置面板新增「同步与备份」分类，提供本地 JSON 导出/导入按钮与 WebDAV 手动同步按钮。
- **敏感字段明文**：导出文件与 WebDAV 文件均包含 API 密钥、WebDAV 密码，与现有 `apiKey` 明文存 localStorage 的策略一致；UI 文案明确提示妥善保管、勿分享。
- **CORS 前提**：浏览器发 WebDAV 请求需服务器允许 CORS（含 `Authorization` 预检），这是用户自有服务器的部署事项，客户端无法绕过；仅在 UI 文案提示。
- WebDAV 密码与 apiKey 同样以明文存于本机 localStorage（`webdavPassword` 等键），无任何额外加密。
- 手动同步为「后写覆盖」，不做冲突合并或跨设备去重。
