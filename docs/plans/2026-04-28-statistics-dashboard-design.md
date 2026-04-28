# Statistics Dashboard Design

## Goal

为当前账单归档 Web App 增加 M1 统计能力：用户上传一个 Daily/Bar 月度 Excel 和一个 Office 月度 Excel 后，系统生成收入、支出、盈利和 Office type 下钻统计图。

M1 不引入数据库，不自动从 batch 历史配对月份。统计入口明确为“两个 Excel 文件上传预览”，这样能复用当前已稳定的输出数据，也避免过早绑定未来存储方案。

## Confirmed Accounting Rules

统计口径按三个大类聚合：

- Daily/Z-Bon 收入：Daily/Bar 月度 Excel 的 `Umsatz Brutto` 累加。
- Daily/Bar 日常支出：Daily/Bar 月度 Excel 中所有 `Ausgabe <N> Brutto` 明细列累加。
- Office 支出：Office 月度 Excel 的 `Brutto` 累加。
- 盈利：`Umsatz Brutto - Daily/Bar Ausgabe Brutto - Office Brutto`。

`Ausgabe sum Brutto` 是 Daily Excel 的每日中间汇总列，后续应由系统生成，方便人工查看。但统计服务不把它作为源字段参与总计算，避免与 `Ausgabe <N> Brutto` 明细列重复计算。

示例文件里的 `Datum` 只用于验证字段结构，不代表业务月份。M1 统计不根据文件名或示例日期强制判断月份。

## Recommended Approach

采用后端解析 Excel、前端展示图表的方案。

后端负责：

- 校验 Excel 文件和必要字段。
- 从 Daily/Bar workbook 聚合收入、日常支出和每日趋势。
- 从 Office workbook 聚合总支出、按 `Type` 下钻和明细。
- 返回稳定 JSON contract。

前端负责：

- 提供两个 Excel 上传控件。
- 调用统计 preview API。
- 展示 KPI、趋势图、收入支出桥图、Office type 下钻和 warning。

该方案保持业务口径集中在后端，前端只消费结构化统计结果。以后如果数据源改为数据库或对象存储，前端和 API response 结构可以基本保留。

## Alternatives Considered

### Frontend Parses Excel

优点是后端改动少。但业务口径会散到浏览器，Excel 解析依赖和错误处理也会进入前端。后续部署到 Azure Static Web Apps 或 Docker 单容器时，文件权限、性能和可审计性都更差。因此不推荐。

### Database-backed Statistics First

长期上更完整，但当前录入主链路刚完成，统计的真实源数据仍是月度 Excel。M1 直接上数据库会扩大范围，且会牵涉历史数据迁移、batch 月份配对、存储生命周期和权限模型。建议作为 M2/M3 演进。

## API Design

新增 additive endpoint：

```text
POST /v1/statistics/monthly-preview
```

Multipart fields:

- `daily_excel`: Daily/Bar 月度 Excel，`.xlsx` 或 `.xlsm`。
- `office_excel`: Office 月度 Excel，`.xlsx` 或 `.xlsm`。

Response shape:

```json
{
  "schema_version": "v1",
  "summary": {
    "revenue_brutto": 100411.24,
    "daily_expense_brutto": 1183.74,
    "office_expense_brutto": 111535.95,
    "profit_brutto": -12308.45
  },
  "daily_series": [
    {
      "date": "2025-11-01",
      "revenue_brutto": 2437.3,
      "daily_expense_brutto": 0,
      "profit_before_office_brutto": 2437.3
    }
  ],
  "office_by_type": [
    {
      "type": "Miete",
      "brutto": 5590,
      "count": 2,
      "share": 0.0501
    }
  ],
  "office_rows": [
    {
      "date": "2025-12-11",
      "type": "Miete",
      "name": "Linda Simgen Ramen ippin Kaiserslautern",
      "brutto": 4760
    }
  ],
  "warnings": []
}
```

`office_rows` 用于前端点击某个 `Type` 后展示明细。M1 不需要再做 Office 明细二次分页，Excel 行数可控。

## Backend Design

新增 `src/bills_analysis/services/statistics_service.py`，作为纯业务聚合模块。它接收两个 `Path`，返回 Pydantic response model 所需的结构。

Daily parsing:

- 使用 active sheet。
- 必须存在 `Datum`、`Umsatz Brutto`。
- 支出列用正则匹配 `^Ausgabe \d+ Brutto$`。
- 每行：
  - `revenue_brutto = Umsatz Brutto`
  - `daily_expense_brutto = sum(Ausgabe <N> Brutto)`
  - `profit_before_office_brutto = revenue_brutto - daily_expense_brutto`
- 空金额按 `0` 处理。
- 非数字金额记录 warning，并按 `0` 处理。

Office parsing:

- 使用 active sheet。
- 必须存在 `Type`、`Brutto`。
- 每行：
  - `type` 为空时归为 `Uncategorized`。
  - `brutto` 空值按 `0`。
  - 非数字金额记录 warning，并按 `0`。
- `office_by_type` 按金额降序排序。
- `share = type_brutto / office_total`，office total 为 0 时 share 为 0。

错误策略：

- 必要字段缺失：返回 422。
- 文件无法读取或格式不支持：返回 400。
- 单元格金额或日期有问题：返回成功响应并带 warning，除非整张表无法解析。

## Daily Excel Template Addition

在 Daily merge/template 链路中补两个中间汇总列：

- `Ausgabe sum Brutto`
- `Ausgabe Sum Netto`

生成规则：

- Brutto 汇总：所有 `Ausgabe <N> Brutto` 明细列求和。
- Netto 汇总：所有 `Ausgabe <N> Netto` 明细列求和。

这些列用于人工复核和 Excel 可读性，不作为统计服务的源字段。

## Frontend Design

新增 `/statistics` 页面，并加入左侧导航。

页面区域：

1. 上传区：两个 Excel 文件选择控件，分别对应 Daily/Bar 和 Office。
2. 操作区：`Generate statistics` 按钮，两个文件都选中后启用。
3. KPI strip：收入、Daily 支出、Office 支出、盈利。
4. Profit bridge：展示收入、两类支出和最终盈利。
5. Daily trend：按日展示收入、Daily 支出和日净额。
6. Office type breakdown：按 `Type` 展示 Office 支出，点击 type 后显示明细行。
7. Warnings panel：展示后端 warning。

M1 不新增图表依赖，优先用轻量 SVG 组件实现柱状、折线和桥图。当前图表数量少，避免引入 Recharts 等依赖带来的打包、样式和测试成本。若后续统计页面明显扩展，再评估图表库。

## Contract and Versioning

现有 v1 batch contract 在 M1 冻结，统计功能以新增 endpoint 和新增 schema 的方式进入 v1。该改动是 additive，不改变现有 batch 请求/响应字段。

需要更新 OpenAPI baseline，因为 `/v1/statistics/monthly-preview` 是新的 public API。

## Testing Strategy

后端：

- `statistics_service` 单元测试覆盖聚合口径、空值、非数字 warning、缺字段错误。
- API contract 测试覆盖 multipart 上传、response schema、OpenAPI baseline。
- Daily merge parity 测试覆盖新增汇总列。

前端：

- client 测试覆盖 multipart 字段名。
- 页面测试覆盖文件选择、按钮状态、KPI 渲染、Office type 选择和 warning。
- Playwright mock 覆盖统计页面 happy path。

## Future Extensions

后续可扩展：

- 按归档月份自动选择 Daily 和 Office merge output。
- 数据库存储统计快照。
- 多月趋势和同比/环比。
- Office type 配置标准化，避免手工 type 拼写分裂。
- 导出统计报表 Excel/PDF。
