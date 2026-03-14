# Task Plan: 20260314-TC-108

## Goal
建立独立 `agent-assets` 仓库的 v0.1 方案与骨架，使任意项目都能通过 bootstrap 方式接入可复用的 agent workflow、skills 资产与 Codex / Claude / Gemini 指令模板。

## Scope
- TC-108: 抽离可复用的 agent workflow、skills、指令模板与 bootstrap 机制到独立 agent-assets repo，支持 Codex / Claude / Gemini 多 agent 接入
- In-scope:
  - 盘点当前项目中的 agentic coding 资产，并按“共享核心 / agent-specific / project-specific”分类。
  - 设计独立仓库目录结构、bootstrap 生命周期与 lock/manifest 方案。
  - 定义 first-party / third-party skills 治理策略。
  - 设计 Codex / Claude / Gemini 的模板化入口文件与变量边界。
  - 产出迁移清单、实施顺序，以及 v0.1 可交付范围。
- Out-of-scope:
  - 不修改当前业务前后端功能。
  - 不在本 task 内完成全部第三方 skills 的 fully working migration。
  - 不把当前项目仓库整体改造成 agent-assets 消费端。

## Current Phase
Phase 1

## Phases
### Phase 1: Requirements & Discovery
- [x] Confirm selected tasks and constraints
- [x] Write findings and rationale
- **Status:** completed

### Phase 2: Planning & Structure
- [x] Define implementation sequence
- [x] Confirm dependencies and risks
- [ ] 确认独立仓库的目录边界与命名
- [ ] 确认 bootstrap 命令接口与输入变量
- **Status:** in_progress

### Phase 3: Implementation
- [ ] 初始化独立 worktree / repo 工作空间
- [ ] 建立 `agent-assets` 顶层目录与 README
- [ ] 落地 `core/`, `agents/`, `skills/`, `bootstrap/` 基础骨架
- [ ] 迁移 first-party assets：WT-PM workflow、planning-with-files、wt-plan、wt-dev、plan_tracker 等
- [ ] 增加 third-party skills lock 清单与说明
- **Status:** pending

### Phase 4: Testing & Verification
- [ ] 用空白测试目录验证 `bootstrap init` 路径
- [ ] 用已有项目目录验证 `bootstrap sync` 的非破坏性
- [ ] 验证模板渲染后可生成 Codex / Claude / Gemini 的入口文件
- **Status:** pending

### Phase 5: Delivery
- [ ] 更新 workplan 证据与迁移清单
- [ ] 总结剩余风险与后续扩展项
- [ ] 合并后再将 `TC-108` 标记为 DONE
- **Status:** pending
