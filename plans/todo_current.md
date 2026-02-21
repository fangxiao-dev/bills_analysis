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
| TC-101 | Office type错误样本收集：在review页面添加"Report Type Error"按钮，一键将batch中间结果复制到dataset目录，供开发者改进GPT-4o-mini分类prompt | PLANNED | 20260221-TC-101 | 2026-02-21T10:09:25+01:00 |  |
| TC-102 | 上传解析改为单文件实时状态跟踪：单文件超时/报错独立失败；取消batch级timeout；仅全失败或batch级异常才标记batch失败 | PLANNED | 20260221-TC-102 | 2026-02-21T14:38:10+01:00 | TC-102 per-file status tracking, file-level timeout/failure semantics |
| TC-103 | 多页PDF跳过提取但保留空行供手填：local_backend加max_pages检查（从config读取），超限写skip_reason并生成空row；BatchReviewRow加skip_reason字段；review表格对skip_reason非空条目显示⚠图标 | PLANNED | 20260221-TC-103 | 2026-02-21T00:00:00+01:00 |  |
