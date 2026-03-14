# 当前阶段要完成的功能点

可能会动态增删。该文件由 `python scripts/plan_tracker.py ...` 维护，支持多 agent 并行。

| task_id | task | status | plan_id | updated_at | note |
| --- | --- | --- | --- | --- | --- |
| TC-001 | 确认功能：daily要支持：1）按datum覆盖已有项目；2）追加新的条目，并且排序；3）如果没有文件，则用自动创建一个xlsx作为空模板（所以得提炼出模板定义） | DONE | 20260214-1616 | 2026-02-14T21:06:26+01:00 |  |
| TC-002 | review界面要highlight 带审查的项目（复用） | DONE | 20260214-1708 | 2026-02-14T20:56:04+01:00 |  |
| TC-003 | upload后的解析进度实时显示，上传界面—每个item加入status状态 | DONE | 20260214-1725-02 | 2026-02-14T21:08:59+01:00 |  |
| TC-004 | view 如果是本地的，可否直接用默认浏览器打开本地文件，而不是下载 | DONE | 20260214-1725 | 2026-02-14T19:42:51+01:00 |  |
| TC-005 | 语言支持德语，且默认 | DONE | 20260214-1725 | 2026-02-14T19:42:51+01:00 |  |
| TC-006 | merged结果在前端提供打开的链接，放在Submit旁边，等merged后开放下载按钮（要考虑上线后这个merged excel如何处理） | DONE | 20260214-1725-02 | 2026-02-14T21:09:00+01:00 |  |
| TC-007 | daily/office这两个场景，目前都一定有一个模板文件才行，支持一个新情况：当没有模板excel（路径为空）时，直接各自创建新模板后再往里面写 | DONE | 20260218-1936 | 2026-02-18T19:36:15+01:00 |  |
| TC-008 | office场景需要支持地址识别以及校对 | DONE | 20260218-TC-008 | 2026-02-18T22:49:58+01:00 | office receiver/address semantic validation completed |
| TC-100 | M2 Docker单容器化：将FastAPI后端+React前端打包为单容器镜像，客户一键启动试用 | DONE | 20260218-2106 | 2026-02-18T21:59:17+01:00 |  |
| TC-101 | Office type错误样本收集：在review页面添加"Report Type Error"按钮，一键将batch中间结果复制到dataset目录，供开发者改进GPT-4o-mini分类prompt | DONE | 20260221-TC-101 | 2026-02-21T19:05:31+01:00 |  |
| TC-102 | 上传解析改为单文件实时状态跟踪：单文件超时/报错独立失败；取消batch级timeout；仅全失败或batch级异常才标记batch失败 | DONE | 20260221-TC-102 | 2026-02-21T15:06:36+01:00 | TC-102 per-file status tracking, file-level timeout/failure semantics |
| TC-103 | 多页PDF跳过提取但保留空行供手填：local_backend加max_pages检查（从config读取），超限写skip_reason并生成空row；BatchReviewRow加skip_reason字段；review表格对skip_reason非空条目显示⚠图标 | DONE | 20260221-TC-103 | 2026-02-21T16:49:22+01:00 |  |
| TC-104 | 1）upload阶段添加PDF页数超限⚠提醒+查看PDF；2）review阶段支持删除行（不影响JSON，仅影响最终输出） | DONE | 20260221-TC-104 | 2026-02-21T17:36:16+01:00 |  |
| TC-105 | Web API主链路异步优化：预检查后并发执行识别+压缩，超页尽早跳过识别但保留归档，并在汇合阶段重命名 | DONE | 20260221-TC-105 | 2026-02-21T19:35:58+01:00 | Implemented async precheck+parallel fan-out/join with extract concurrency limits |
| TC-106 | office receiver城市化：Upload选择城市，按配置自动匹配地址并参与receiver校验（地址只读、可扩展mapping） | DONE | 20260222-TC-106 | 2026-02-23T21:27:49+01:00 | manual test completed; receiver city mapping flow validated |
| TC-107 | Web UI自动化测试基线：新增Playwright E2E覆盖upload→review→merge主链路，MCP仅用于探索式手工测试，不纳入CI门禁 | PLANNED | 20260223-TC-107 | 2026-02-23T21:18:21+01:00 | Phase-1: smoke可运行；非强制门禁 |
| TC-108 | 抽离可复用的 agent workflow、skills、指令模板与 bootstrap 机制到独立 agent-assets repo，支持 Codex / Claude / Gemini 多 agent 接入 | PLANNED | 20260314-TC-108 | 2026-03-14T10:03:35+01:00 | standalone agent-assets bootstrap repo |
