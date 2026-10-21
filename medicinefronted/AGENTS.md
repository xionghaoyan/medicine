# 前端开发规范

权威规则：`../docs/HIS开发文档.md` §2.1 与 §4。

- React + TypeScript strict + Vite；页面放 src/pages，共用组件放 src/components。
- API 统一通过 src/api/client.ts，请求与响应在 src/api/types.ts 定义。
- 使用服务端数据和 TanStack Query；写入后失效缓存，登出后清空缓存。
- 每个页面具备加载、失败、空数据状态；表单可校验，提交可反馈。
- 延续暖白和深绿设计变量，不为单页引入全新视觉体系。
- 金额一律调用公共格式化函数，后端字段使用 snake_case。
- 角色限制同时落实在路由与操作入口；后端仍是最终权限边界。
- 完成变更后运行 npm run lint 与 npm run build；关键流程需要浏览器验证。

