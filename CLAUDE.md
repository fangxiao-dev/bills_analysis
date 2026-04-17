# CLAUDE.md

本文件只补充 Claude 侧的最小说明。

- 仓库级主规范以 `AGENTS.md` 为准。
- 详细流程规则优先查看 `.claude/rules/*.md`。
- 本仓库支持 `worktree` 流程，但默认不强制；具体见 `.claude/rules/collaboration-boundaries.md`。
- 如需使用仓库本地自定义 skill，优先看 `.agents/skills/`；没有项目级定制时，直接使用全局已安装 skill。

若 `AGENTS.md`、`.claude/rules/*.md` 与某个本地 skill 文档冲突，优先级为：
1. `AGENTS.md`
2. `.claude/rules/*.md`
3. 本地 skill 文档
