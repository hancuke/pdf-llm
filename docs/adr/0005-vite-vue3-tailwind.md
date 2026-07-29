# 前端技术栈：Vite + Vue 3 + Tailwind CSS

前端采用 Vite 构建、Vue 3（组合式 API）渲染、Tailwind CSS 做样式。纯静态产物，无服务端，契合 ADR-0001 的纯客户端形态。

理由：Vite 产出纯静态站点、与"无后端"天然契合；Vue 3 组件化适合做 PDF 渲染层、操作菜单、对话面板等状态较多的 UI；Tailwind 便于快速实现 iOS 风格的操作菜单与响应式布局。代价是引入了构建链与框架依赖，后续若要改成其他框架需重写 UI 层。
