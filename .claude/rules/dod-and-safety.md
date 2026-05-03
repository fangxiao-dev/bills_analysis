# Definition of Done & Safety Guardrails

## Definition of Done

每个任务完成时至少满足：

- Contract consistency verified
- 功能可运行，且按相关最小命令完成验证
- 有日志和错误提示
- 不破坏既有主流程
- 注释要求符合 `commenting-conventions.md`
- 文档按需更新；若使用 plan 文件，`progress` / `findings` 需反映最新状态

## Safety Guardrails

- 遵循 `collaboration-boundaries.md` 中的文件范围语义指导
- `.env` 不入库，示例配置放 `.env.example`
- 阈值与业务参数统一走 `config/app_config.json`
- 所有 merge 写入需保留审计日志
- 若使用 `worktree` 模式，合并前必须先同步 trunk 并通过回归验证
