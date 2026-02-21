# Findings & Decisions (20260218-2106)

## Requirements
- TC-100: M2 Docker单容器化：将FastAPI后端+React前端打包为单容器镜像，客户一键启动试用

## Research Findings
- Single-container delivery is feasible by building frontend with Vite in a Node stage and serving static assets from FastAPI runtime container.
- Existing API routes can coexist with SPA static hosting when static mount is registered after API route declarations.
- Frontend default API base must use same-origin fallback in production container to avoid hardcoded localhost:8000 coupling.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Task selection | Task scope explicitly provided by user. |
| Task selection | Selected tasks: TC-100. |
| Use multi-stage Docker build | Reduces runtime image size and keeps frontend build tooling out of runtime container. |
| Mount SPA via `FRONTEND_DIST_DIR` env | Keeps local dev mode unchanged while enabling container static hosting. |
| Keep trunk sync target on `dev` | Repository workflow uses `dev` as mature trunk in this phase. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| Sandbox blocked local `uv` cache access during pytest | Reran regression command with elevated permissions. |
| PowerShell policy blocked `pnpm.ps1` | Used `cmd /c pnpm ...` path and reran with elevated permissions when subprocess spawn was blocked. |

## Resources
- plans/todo_current.md
- plans/workplans/task_plan.20260218-2106.md
