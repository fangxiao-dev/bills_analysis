# Agent Instruction Audit Plan

## Goal
为本仓库重构 `AGENTS.md` 与 `CLAUDE.md` 的职责边界和内容密度，减少过时信息、重复规则与过强默认流程约束，使 instruction 文件更贴近当前 agent 能力与实际开发方式。

## Background
- 现状：
  - `AGENTS.md` 与 `CLAUDE.md` 同时承载项目背景、流程细节、规则索引、技能触发说明和阶段性状态。
  - 两份文件与 `.claude/rules/*.md` 存在较多重复，维护成本偏高。
  - `worktree` 当前被写成默认开发方式，不适合小范围、低风险、即时修复类任务。
- 已确认的第一条调整方向：
  - 保留 `worktree` 工作流，但改为显性触发，而不是默认强制。

## Audit Findings Summary
### 1. Worktree 默认化过强
- 问题：
  - 当前主文件把 `task-based worktree workflow` 写成默认路径，容易让简单修改也被迫走完整流程。
- 调整方向：
  - 默认允许直接在当前工作区处理小范围、低风险修改。
  - 在用户显式要求，或涉及并行任务、长期任务、计划追踪、复杂集成时，再进入 `wt-plan` / `wt-dev`。

### 2. 主文件与 rules 文件重复
- 问题：
  - `AGENTS.md`/`CLAUDE.md` 中重复写了 workflow、API contract、planning、DoD 等规则，而这些规则已拆分到 `.claude/rules/*.md`。
- 调整方向：
  - 主文件只保留高层摘要与导航。
  - 细节流程、状态机、命令契约统一下放到规则文件或 skill 文档。

### 3. 时间敏感状态不应放在 instruction 主文件
- 问题：
  - 例如 `CLAUDE.md` 中的里程碑状态播报和日期化进展判断容易过时。
- 调整方向：
  - 项目动态状态改由 `plans/`、`README` 或 `progress` 文档维护。
  - instruction 主文件只保留稳定事实，不保留会频繁过期的状态描述。

### 4. 过多“操作手册式”技能细节
- 问题：
  - 主文件中写了大量 skill 触发词、生命周期步骤、环境区分细节。
- 调整方向：
  - 在主文件中仅说明“有哪些关键 skill、适用于什么场景”。
  - 具体触发词和详细行为交给 skill 自身文档。

### 5. 宿主职责边界不清
- 问题：
  - `AGENTS.md` 与 `CLAUDE.md` 都像完整主规范，存在双份维护。
- 调整方向：
  - `AGENTS.md` 作为仓库通用协作规范，尽量宿主无关。
  - `CLAUDE.md` 只保留 Claude 特有补充；若无明显宿主差异，则应明显缩短。

### 6. 部分路径/组织方式写死（含已破坏的死链）
- 问题：
  - `.agents/skills/wt-plan/SKILL.md` 与 `wt-dev/SKILL.md` 已被删除，但 `CLAUDE.md` Section 7.1、`AGENTS.md` Section 8.2、以及本地 `task-worktree-lifecycle` skill 仍在引用这两个路径 — **当前触发即失败**。实际可用入口是全局已安装的 `wt-plan`/`wt-dev` skill。
  - `.agents/skills/update-task-status/SKILL.md` 中的命令路径写的是 `.claude/skills/`，实际文件在 `.agents/skills/`，路径错误会导致命令执行失败。
  - 更广泛地：skill 物理路径写死在 instruction 文件里，随 skill 迁移/重组就会产生死链。
- 调整方向：
  - 修复 `task-worktree-lifecycle` SKILL.md：将两处本地路径引用改为”use globally installed `wt-plan`/`wt-dev` skill”。
  - 修复 `update-task-status` SKILL.md：命令路径改为 `.agents/skills/update-task-status/scripts/`（或确认实际路径后修正）。
  - 避免在项目级 instruction 中写死技能物理路径。
  - 只保留”优先使用可用 skill / 缺失时说明并降级”的行为要求。

### 7. `.agents/skills/` 与 `.claude/skills/` 双份镜像
- 问题：
  - `planning-with-files`、`task-worktree-lifecycle`、`cross-worktree-sync`、`init-project-context` 等 skill 在两个目录下同时存在，内容一致。
  - 每次更新需同步两处，漏改就会出现版本分叉（`task-worktree-lifecycle` 本地过期版本因优先级高于全局，实际上正在遮蔽全局正常版本）。
- 调整方向：
  - 统一到 `.agents/skills/`（更通用），删除 `.claude/skills/` 中的镜像；或反之。
  - `init-project-context` 对当前已充分文档化的项目已无实际用途，可直接删除。

### 8. `settings.local.json` 历史遗留权限噪声
- 问题：
  - 存在 `”Bash(1:*)”` 等明显错误条目，以及过长重复的 `powershell -Command:*`/`cmd /c:*` 通配符。
  - 不影响功能，但干扰权限审计，且让后续 `less-permission-prompts` 优化难以判断哪些是有效权限。
- 调整方向：
  - 删除错误条目，合并重复通配符，做一次清理。

## Target Structure
### AGENTS.md
- 保留：
  - 项目目标与业务场景
  - 技术栈
  - 架构目标目录
  - 少量硬约束
  - 最小验证命令
  - rules / plans / skills 的索引入口
- 删除或下放：
  - 完整 worktree 生命周期示例
  - task tracker 细节
  - planning 触发语义
  - 详细 skill 触发词
  - 与 `.claude/rules/*.md` 重复的具体规则

### CLAUDE.md
- 保留：
  - 指向 `AGENTS.md` 的仓库级规范引用
  - 少量 Claude 宿主特有说明（如果确实存在）
- 删除或下放：
  - 与 `AGENTS.md` 重复的项目背景和流程规则
  - 日期化的 milestone status
  - 与 rules 文件重复的详细说明

## Proposed Rule Changes
### Default Development Mode
- 默认模式：
  - 允许直接在当前工作区完成小范围、低风险、短周期修改。
- 显性触发 `worktree` 的推荐场景：
  - 用户明确要求使用 `worktree`
  - 需要 `task_id` / plan 跟踪
  - 存在并行开发或隔离需求
  - 涉及跨阶段、较长周期、需要独立回归门禁的工作

### Rule Placement
- 放在主文件中的内容应满足：
  - 稳定
  - 高价值
  - 跨 session 常用
- 放在 rules / skills / plans 中的内容应包括：
  - 详细流程
  - 触发词
  - 生命周期步骤
  - 易变状态
  - 操作手册

## Execution Plan
### Phase 1: Confirm Rewrite Principles
- [x] 完成对 `AGENTS.md` 与 `CLAUDE.md` 的预审
- [x] 识别主要冗余、过时信息与过强默认约束
- [x] 确认 `worktree` 应改为显性触发

### Phase 1.5: Fix Critical Breakages（可立即执行，不依赖整体重构）
- [x] 修复 `task-worktree-lifecycle` SKILL.md：删除本地路径引用，改为全局 skill 名称
- [x] 修复 `update-task-status` SKILL.md：命令路径从 `.claude/skills/` 改为 `.agents/skills/`
- [ ] 决定 `.agents/skills/` vs `.claude/skills/` 的权威目录，删除镜像副本

### Phase 2: Draft New Information Architecture
- [x] 拆分”通用仓库规则”与”宿主特有补充”
- [x] 列出主文件必须保留的最小内容集合
- [x] 列出应下放到 `.claude/rules/*.md` 的内容集合
- [x] 确认 `dod-and-safety.md` Safety Guardrails 节与 `collaboration-boundaries.md` 的合并方式

### Phase 3: Rewrite Proposal
- [x] 输出 `AGENTS.md` 精简版结构草案
- [x] 输出 `CLAUDE.md` 精简版结构草案
- [x] 对每个删减项说明去向：删除、下放或保留摘要

### Phase 4: Apply Changes
- [x] 修改 `AGENTS.md`
- [x] 修改 `CLAUDE.md`
- [x] 视需要同步更新 `.claude/rules/*.md` 中与默认开发方式相关的表述

### Phase 5: Final Review
- [ ] 检查两份文件是否还有重复段落
- [ ] 检查是否保留了足够的项目上下文与硬约束
- [ ] 检查是否消除了明显过时状态与不必要流程默认化

## Deliverables
- 一个精简后的 `AGENTS.md`
- 一个职责更单一的 `CLAUDE.md`
- 如有需要，补充更新的 `.claude/rules/*.md`
- 一份简短变更说明，解释“为什么这样改”

## Decisions Confirmed On 2026-04-17
- `CLAUDE.md` 缩减为“引用 `AGENTS.md` + 少量 Claude 补充”。
- `.claude/rules/collaboration-boundaries.md` 从“统一 worktree 开发模式”改写为“支持 worktree，但不默认强制”。
- 项目级本地 skill 的权威目录统一为 `.agents/skills/`；`.claude/skills/` 仅保留必要链接或兼容层。
- `init-project-context` 对当前仓库不再需要项目级副本，可删除本地副本并回退到全局 skill。
- `AGENTS.md` 原 Section 3.2（注释规范）迁移为独立 rule 文件。

## Suggested Next Step
完成文档改写后，再单独清理本地 skill 布局：
- 删除不再需要的项目级 skill 副本
- 将 `.claude/skills/` 调整为指向 `.agents/skills/` 的兼容层
- 修复本地 skill 中的过期路径引用
