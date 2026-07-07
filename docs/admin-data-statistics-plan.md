# 管理端数据统计模块规划

## 1. 背景与目标

当前系统已有若干分散的数据入口，例如用户仪表盘、日志统计、充值记录、排行榜、性能指标等，但管理员想完整查看运营和使用数据时，需要在多个页面之间切换，且缺少统一筛选、统一趋势、实时概览和余额账本视角。

本模块新增独立的管理端数据统计页，当前第一版落地路由为 `/data-statistics`，用于集中查看充值、余额、活跃、登录、注册趋势、模型排行、分组排行、用户排行等运营数据。

第一版定位为“只读运营统计中心”：

- 只做管理端查看，不改变用户侧计费、充值、转发和日志写入流程。
- 优先复用现有 `logs`、`topups`、`users`、`perf_metrics` 等数据源。
- 不新建复杂报表任务系统，先通过按时间范围聚合和短 TTL 缓存满足管理端查看。
- 后续如果数据量变大，再追加每日快照表或异步报表任务。

## 2. 产品方案

### 2.1 页面入口

- 新增页面：`管理后台 -> 数据统计`
- 第一版路由：`/data-statistics`
- 权限：第一版使用 `RootAuth`，只允许超级管理员访问充值、余额和全平台聚合数据。
- 页面不放入系统设置卡片中，避免和配置项混在一起。

### 2.2 页面结构

页面分为 6 个区域：

1. 总览卡片
   - 今日充值金额
   - 今日充值额度
   - 今日消耗额度
   - 当前用户余额总量
   - 今日请求数
   - 今日活跃用户数
   - 今日登录用户数
   - 今日注册用户数

2. 趋势图
   - 充值金额趋势
   - 充值额度趋势
   - 消耗额度趋势
   - 请求数趋势
   - 活跃用户趋势
   - 登录趋势
   - 注册趋势

3. 排行榜
   - 模型消耗排行
   - 分组消耗排行
   - 用户消耗排行
   - 渠道消耗排行
   - 充值用户排行
   - 余额用户排行

4. 余额与账本
   - 平台用户余额总量
   - 用户余额分布
   - 额度变动流水
   - 充值入账、消费扣减、退款、邀请返佣、管理员调整等来源分类

5. 实时运营面板
   - 通过 SSE 展示当前请求数、RPM、TPM、最近充值、最近异常、最近活跃模型。
   - 只做轻量实时刷新，不在 SSE 中返回大列表和敏感内容。

6. 明细表
   - 充值明细
   - 消耗明细
   - 登录明细
   - 注册明细
   - 余额流水明细

### 2.3 筛选条件

统一筛选栏建议包含：

- 时间范围：今天、昨天、最近 7 天、最近 30 天、自定义。
- 粒度：小时、天、周、月。
- 模型：下拉选择已有模型，不允许手输。
- 分组：下拉选择已有分组。
- 用户：按用户 ID 或用户名搜索。
- 渠道：下拉选择渠道。
- 支付渠道：Stripe、Creem、Waffo、Waffo Pancake、易支付、余额等。

默认时间范围建议为最近 7 天，自定义查询设置最大范围，第一版建议不超过 180 天，避免大表全量扫描。

## 3. 统计口径

### 3.1 充值统计

数据源：

- `topups` 表。
- 字段参考：`user_id`、`amount`、`money`、`trade_no`、`payment_method`、`payment_provider`、`create_time`、`complete_time`、`status`。

口径：

- 只统计 `status = success` 的订单。
- 趋势时间优先使用 `complete_time`，没有完成时间时不进入成功充值统计。
- 充值金额展示使用 `money`，充值额度展示使用 `amount` 或回调中实际入账额度，具体要按支付方式核对。
- 支付渠道使用 `payment_provider`，支付方式使用 `payment_method`。

注意：

- 当前系统不同支付渠道对 `amount`、`money`、`quota` 的含义不完全一致，第一版页面必须明确区分“支付金额”和“入账额度”。
- 统计页面只展示结果，不改现有充值换算逻辑。

### 3.2 消耗与请求统计

数据源：

- `logs` 表中 `type = LogTypeConsume`。
- 字段参考：`created_at`、`user_id`、`username`、`model_name`、`quota`、`prompt_tokens`、`completion_tokens`、`use_time`、`is_stream`、`channel_id`、`token_id`、`group`、`request_id`。

口径：

- 请求数：消费日志条数。
- 消耗额度：`sum(quota)`。
- 输入 Token：`sum(prompt_tokens)`。
- 输出 Token：`sum(completion_tokens)`。
- 总 Token：输入 Token + 输出 Token。
- 活跃用户：指定时间范围内产生消费日志的去重 `user_id`。
- 模型排行：按 `model_name` 聚合。
- 分组排行：按 `group` 聚合。
- 用户排行：按 `user_id` 或 `username` 聚合。
- 渠道排行：按 `channel_id` 聚合，并补充渠道名称。

注意：

- 日志库可能是主库，也可能是 ClickHouse。聚合代码需要通过现有 `LOG_DB` 和数据库类型判断兼容两种模式。
- 不能在列表接口返回 prompt 原文或完整请求内容，数据统计页只展示运营指标。

### 3.3 登录与注册统计

登录数据源：

- `logs` 表中 `type = LogTypeLogin`。

注册数据源：

- `users` 表的 `created_at`。

口径：

- 登录次数：登录日志条数。
- 登录用户数：登录日志去重 `user_id`。
- 注册数：按用户 `created_at` 聚合。
- 新注册活跃：注册后在同一时间范围内产生消费日志的用户数，可作为后续增强。

### 3.4 余额统计

数据源：

- `users` 表。
- 字段参考：`quota`、`used_quota`、`request_count`、`group`、`status`、`aff_quota`、`aff_history`。

口径：

- 当前余额总量：`sum(quota)`。
- 历史消耗总量：`sum(used_quota)`。
- 用户请求总量：`sum(request_count)`。
- 邀请可用额度：`sum(aff_quota)`。
- 邀请历史额度：`sum(aff_history)`。
- 余额排行：按 `quota` 倒序。
- 分组余额：按 `group` 聚合 `sum(quota)`。

注意：

- 当前用户余额是快照，不是历史趋势。第一版只展示当前快照。
- 如果要做历史余额趋势，需要新增余额快照表或从完整额度流水推导，建议放到第二阶段。

### 3.5 余额账本

第一版建议使用现有日志构造“只读账本视图”，不立即新增账本写入表。

可纳入来源：

- 充值：`logs.type = LogTypeTopup` 或 `topups` 成功订单。
- 消费：`logs.type = LogTypeConsume`。
- 退款：`logs.type = LogTypeRefund`。
- 系统赠送、邀请注册赠送、管理员调整：`logs.type = LogTypeSystem` 或 `LogTypeManage`，需要谨慎解析。
- 邀请充值返佣：`affiliate_commissions` 表。

第一版处理方式：

- 账本列表先按来源拆成几类固定查询，不强行解析所有自然语言日志。
- 对无法可靠识别额度正负的系统日志，只作为“操作记录”展示，不参与金额汇总。
- 如果后续需要严谨财务账本，再新增 `quota_ledger` 专表，在所有额度变动处统一写入。

## 4. 后端方案

### 4.1 文件组织

建议新增：

- `controller/data_statistics.go`
- `service/data_statistics.go`
- `model/data_statistics.go` 或 `model/statistics_query.go`

原则：

- 控制器只做参数解析、权限响应和错误返回。
- 聚合逻辑放在 `service` 或 `model` 查询层。
- 不改充值、计费、渠道、模型映射、转发主链路。

### 4.2 接口设计

早期可选的 `/api/admin/data-statistics/*` 路由不符合当前项目后台接口风格，第一版采用资源型接口组：

```text
GET /api/data-statistics/summary
GET /api/data-statistics/trends
GET /api/data-statistics/rankings
GET /api/data-statistics/filters
```

后续阶段可按同一接口组继续追加：

```text
GET /api/data-statistics/balance
GET /api/data-statistics/ledger
GET /api/data-statistics/stream
```

并在路由组上挂 `middleware.AdminAuth()` 或 `middleware.RootAuth()`。

### 4.3 查询参数

通用参数：

```text
start_timestamp: 秒级 Unix 时间戳
end_timestamp: 秒级 Unix 时间戳
granularity: hour | day | week | month
model_name: 模型名
group: 分组名
user_id: 用户 ID
username: 用户名
channel_id: 渠道 ID
payment_provider: 支付渠道
page: 页码
page_size: 每页数量
```

默认值：

- `end_timestamp` 默认当前时间。
- `start_timestamp` 默认最近 7 天。
- `granularity` 默认按天；时间范围小于 48 小时时可默认按小时。
- `page_size` 默认 20，最大 100。
- 自定义时间范围第一版建议最大 180 天。

### 4.4 返回结构

`summary` 示例：

```json
{
  "success": true,
  "data": {
    "topup_money": 1288.5,
    "topup_quota": 1288500,
    "consume_quota": 933200,
    "request_count": 8241,
    "active_user_count": 153,
    "login_user_count": 91,
    "new_user_count": 37,
    "current_balance_quota": 2300000
  }
}
```

`trends` 示例：

```json
{
  "success": true,
  "data": {
    "granularity": "day",
    "items": [
      {
        "time": 1783267200,
        "topup_money": 100.0,
        "topup_quota": 100000,
        "consume_quota": 82000,
        "request_count": 1000,
        "active_user_count": 20,
        "login_user_count": 16,
        "new_user_count": 5
      }
    ]
  }
}
```

`rankings` 示例：

```json
{
  "success": true,
  "data": {
    "models": [],
    "groups": [],
    "users": [],
    "channels": [],
    "topup_users": [],
    "balance_users": []
  }
}
```

`stream` 示例事件：

```text
event: snapshot
data: {"request_count_60s":12,"rpm":12,"tpm":23000,"consume_quota_60s":1024}

event: heartbeat
data: {"time":1783330000}
```

### 4.5 SSE 设计

SSE 接口用于实时运营面板，建议：

- 响应头：`Content-Type: text/event-stream`。
- 鉴权：必须和普通接口一致，禁止匿名访问。
- 周期：默认 5 秒或 10 秒推送一次。
- 断开：监听客户端取消，及时退出循环。
- 心跳：每 15 到 30 秒发送 `heartbeat`。
- 数据范围：只查询最近 60 秒、5 分钟或缓存好的快照。
- 连接限制：后续可按管理员 ID 或 IP 限制同时连接数。

SSE 不应做：

- 不返回用户 prompt、请求内容、token key、支付完整单号等敏感信息。
- 不每次推送都全表聚合。
- 不绕过现有登录态和 CSRF/请求头约束。

### 4.6 性能与索引

优先使用已有索引：

- `logs.created_at`
- `logs.type`
- `logs.user_id`
- `logs.model_name`
- `logs.group`
- `logs.channel_id`
- `logs.token_id`
- `topups.user_id`
- `topups.trade_no`
- `users.created_at`
- `users.group`

建议补充评估的索引：

- `topups(status, complete_time)`
- `topups(payment_provider, complete_time)`
- `logs(type, created_at, model_name)`
- `logs(type, created_at, group)`
- `logs(type, created_at, user_id)`

第一版控制策略：

- 所有接口必须带默认时间范围。
- 自定义范围加最大跨度限制。
- 排行榜只取 Top N，默认 10，最大 100。
- 明细接口必须分页。
- 对 summary 和 trends 使用 10 到 30 秒短 TTL 缓存。
- ClickHouse 场景避免使用不兼容 SQL 函数，时间分桶需要单独适配。

## 5. 前端方案

### 5.1 文件组织

建议新增：

- `web/default/src/features/admin-data-statistics/index.tsx`
- `web/default/src/features/admin-data-statistics/api.ts`
- `web/default/src/features/admin-data-statistics/types.ts`
- `web/default/src/features/admin-data-statistics/components/summary-cards.tsx`
- `web/default/src/features/admin-data-statistics/components/trend-charts.tsx`
- `web/default/src/features/admin-data-statistics/components/ranking-tables.tsx`
- `web/default/src/features/admin-data-statistics/components/balance-ledger-table.tsx`
- `web/default/src/features/admin-data-statistics/components/live-panel.tsx`

路由文件按当前 TanStack Router 结构新增：

- `web/default/src/routes/_authenticated/data-statistics/index.tsx`

如果当前没有 `/admin` route group，则可直接新增：

- `web/default/src/routes/_authenticated/data-statistics.tsx`

并在侧边栏 Admin 分组中加入：

- 标题：`数据统计`
- 图标：建议 `ChartNoAxesCombined`、`BarChart3` 或 `Activity`
- 角色：管理员；如果接口使用 RootAuth，前端也标记超级管理员可见。

### 5.2 页面交互

页面顶部：

- 标题：数据统计
- 时间范围选择器
- 粒度选择器
- 刷新按钮
- 实时开关

主体：

- KPI 卡片保持紧凑，适合管理员扫数据。
- 趋势图使用折线图或面积图。
- 排行榜使用表格，支持 Top 10 / Top 20。
- 账本表格支持分页和来源筛选。
- SSE 面板显示连接状态：连接中、已连接、已断开、重连中。

### 5.3 i18n

新增文案必须补全当前支持语言：

- `zh`
- `en`
- `fr`
- `ja`
- `ru`
- `vi`

中文文案使用简体中文。实现时需要按项目现有 i18n 规则补充静态键，避免页面出现未翻译 key。

## 6. 权限与安全

### 6.1 权限

- 接口必须使用管理员鉴权。
- 财务、余额、全平台用户统计建议使用超级管理员权限。
- 前端菜单只对满足权限的用户显示。
- 后端不能只依赖前端隐藏菜单，必须在接口层校验。

### 6.2 数据脱敏

默认不展示：

- API Key 明文。
- token key。
- 完整请求内容。
- 用户 prompt。
- 支付回调原始报文。

可展示但建议处理：

- 用户名、邮箱：管理员列表中可展示；公开导出时需要脱敏。
- 交易单号：列表可展示部分，详情页再展示完整值。
- IP：默认不放入统计汇总，必要时只在日志详情里按现有权限展示。

### 6.3 防滥用

- 查询范围限制，避免管理端接口被误用成全表扫描。
- SSE 连接数限制。
- 明细分页硬上限。
- 聚合接口短缓存。
- 大范围导出不放第一版。

## 7. 实施阶段

### 阶段一：只读基础统计

目标：

- 新增独立页面和导航入口。
- 新增 summary、trends、rankings、filters 接口。
- 支持充值、消耗、活跃、登录、注册、模型排行、分组排行、用户排行。

不做：

- 不做 SSE。
- 不做余额账本详情。
- 不做导出。
- 不新增快照表。

### 阶段二：余额与账本

目标：

- 新增 balance 接口。
- 新增 ledger 接口。
- 展示当前余额、历史消耗、邀请额度、分组余额、用户余额排行。
- 账本先基于现有日志、充值表、返佣表组合展示。

后续判断：

- 如果现有日志无法满足严谨财务追踪，再规划 `quota_ledger` 专表。

### 阶段三：SSE 实时面板

目标：

- 新增 `/stream` SSE 接口。
- 前端展示实时请求数、RPM、TPM、60 秒消耗、最近充值、最近异常。
- 做连接状态和自动重连。

性能要求：

- 每次推送只查短窗口数据或缓存快照。
- 不做全量排行榜推送。

### 阶段四：性能增强

触发条件：

- 日志量或充值量明显变大。
- 管理端查询超过可接受耗时。
- ClickHouse 和主库聚合口径需要更强一致性。

可选方案：

- 新增每日统计快照表。
- 新增异步报表任务。
- Redis 缓存热点指标。
- 针对 PostgreSQL 和 ClickHouse 分别优化 SQL。

## 8. 测试与验收

### 8.1 后端验证

- 管理员可以访问统计接口，普通用户不能访问。
- 默认最近 7 天查询正常。
- 自定义时间范围超过限制时返回明确错误。
- 充值统计只包含成功订单。
- 消耗统计只包含消费日志。
- 模型、分组、用户排行排序正确。
- 注册趋势按 `users.created_at` 统计。
- 登录趋势按登录日志统计。
- ClickHouse 日志库场景不使用不兼容 SQL。
- SSE 客户端断开后服务端停止循环。

### 8.2 前端验证

- 管理端侧边栏出现“数据统计”。
- 页面加载后展示总览卡片、趋势图和排行榜。
- 筛选条件变化后数据刷新。
- 空数据时有正常空状态。
- 接口报错时有错误提示。
- SSE 开启、断开、重连状态展示正常。
- 移动端和桌面端不出现文字重叠。

### 8.3 生产安全验证

- 新接口不返回敏感请求内容。
- 大范围查询被限制。
- 排行榜和明细分页有上限。
- 未命中统计页面的普通业务请求不受影响。
- 充值、计费、转发、渠道选择流程无改动。

## 9. 风险与注意事项

- 金额和额度口径风险：不同支付渠道的 `amount`、`money`、实际入账额度含义不同，实现前需要逐个支付渠道确认。
- 日志库兼容风险：`LOG_DB` 可能使用 ClickHouse，时间分桶和 SQL 函数需要适配。
- 大表性能风险：`logs` 和 `topups` 可能很大，必须限制时间范围并分页。
- 活跃用户定义风险：需要明确“活跃”按消费日志、登录日志还是二者合并；第一版建议按消费日志。
- 余额账本完整性风险：现有日志并不是严格财务账本，第一版只能做运营视图，不应标成审计级财务流水。
- SSE 成本风险：实时推送不能每次做重聚合，必须短窗口或缓存。

## 10. 建议默认决定

- 第一版只做新版前端，不做 classic 前端完整适配。
- 第一版只读展示，不改业务主流程。
- 默认统计最近 7 天。
- 自定义查询最大 180 天。
- 管理端明细分页最大 100 条。
- SSE 默认关闭，由管理员在页面手动开启。
- 余额账本第一版叫“额度流水视图”，避免误认为严格财务账本。
- 提交时作为独立功能提交，提交信息使用简体中文。

## 11. 当前实现对齐与增强建议

本节用于对齐当前代码实现和上文规划，便于后续继续补齐数据统计能力。截至 2026-07-07，当前实现已落地第一版只读统计中心的主体能力，但仍偏“运营聚合看板”，尚不是完整的账本、实时监控或明细报表系统。

### 11.1 已实现能力

- 页面入口已实现：新版前端已新增 `/data-statistics` 路由，侧边栏 Admin 分组中新增“数据统计”，并通过前端路由限制超级管理员访问。
- 后端接口已实现：`/api/data-statistics/summary`、`/api/data-statistics/trends`、`/api/data-statistics/rankings`、`/api/data-statistics/filters` 已挂载在 `RootAuth` 下。
- 筛选能力已实现：支持 `start_timestamp`、`end_timestamp`、`granularity`、`model_name`、`group`、`user_id`、`channel_id`、`payment_provider`；默认最近 7 天，最大查询范围 180 天；粒度当前支持 `day` 和 `hour`。
- 总览统计已实现：返回消耗额度、请求数、输入 Token、输出 Token、活跃用户数、错误数、登录次数、登录用户数、注册用户数、充值金额、充值额度、当前余额、历史消耗、用户请求总量。
- 趋势统计已实现：按小时或天聚合消耗额度、请求数、活跃用户数、错误数、充值金额、充值额度、注册用户数。
- 排行榜已实现：模型消耗排行、分组消耗排行、用户消耗排行、渠道消耗排行、充值用户排行、余额用户排行已按 Top 20 返回。
- 筛选选项已实现：从日志、充值和渠道数据中返回模型、分组、支付渠道、渠道列表。
- 数据源已复用现有表：消费、错误、登录使用 `logs`；充值使用 `topups` 成功订单和 `complete_time`；注册、余额、历史消耗、请求总量使用 `users`。
- 数据库兼容已做基础处理：日志库和主库的时间分桶按 ClickHouse、PostgreSQL、MySQL、SQLite 分支生成表达式。
- 前端基础页已实现：包含筛选卡片、刷新和应用筛选按钮、4 个总览 KPI、趋势表格、6 个排行榜表格、空状态和加载态。
- 多语言文案已接入：页面新增文案已按当前 `web/default` i18n 机制使用 `t(...)`，并进入各语言 locale 文件。

### 11.2 与原规划的差异和未实现项

- 前端趋势当前是表格展示，不是折线图或面积图；暂未提供图表切换、指标勾选或多指标对比。
- 总览区当前只展示 4 个 KPI 卡片，后端返回的 Token、登录次数、当前余额、历史消耗、总请求数等指标尚未全部在页面上显性展示。
- 登录趋势尚未实现：后端 summary 有登录次数和登录用户数，但 trends 当前没有按时间桶返回登录次数、登录用户数。
- Token 趋势尚未实现：summary 和排行榜有输入、输出 Token，trends 当前没有返回输入 Token、输出 Token、总 Token。
- 过滤条件未完全覆盖规划：暂不支持 `username`、`payment_method`、`page`、`page_size`、`week`、`month`；模型、分组、渠道、支付渠道已有下拉，用户当前只支持输入用户 ID。
- 排行榜 Top N 不可配置：后端固定 Top 20，前端没有 Top 10 / Top 20 切换，也没有分页或导出。
- 余额与账本仍未形成独立模块：当前已能返回当前余额、历史消耗和余额用户排行，但没有 `balance` 接口、余额分布、分组余额、额度流水、充值/消费/退款/管理员调整等来源拆分。
- 实时运营面板未实现：尚无 `/stream` SSE 接口，也没有 RPM、TPM、60 秒消耗、最近充值、最近异常、连接状态和自动重连。
- 明细表未实现：充值明细、消耗明细、登录明细、注册明细、余额流水明细仍需复用现有列表或新增分页接口。
- 缓存未实现：summary 和 trends 当前直接查询数据库，尚未添加 10 到 30 秒短 TTL 缓存。
- 查询层实现与原建议略有不同：当前聚合逻辑直接放在 `model/data_statistics.go`，没有新增独立 `service/data_statistics.go`。
- 第一版没有新增表和异步任务：尚未实现每日快照表、异步报表任务、导出任务或严谨财务账本表。

### 11.3 后续让数据更全面的功能建议

- 扩充趋势指标：补充登录次数、登录用户数、输入 Token、输出 Token、总 Token、平均响应耗时、流式请求占比、错误率，让趋势区覆盖“收入、消耗、活跃、质量、性能”五类运营信号。
- 做完整余额视图：新增 `balance` 接口，返回当前余额总量、历史消耗、邀请额度、分组余额、余额区间分布、低余额用户数、高余额沉淀用户数。
- 做轻量额度流水视图：先用 `topups`、消费日志、退款日志、管理日志、返佣数据组合成只读流水；不能可靠判断正负的系统或管理日志只作为操作记录，不进入汇总。
- 补齐明细表：按现有权限新增分页查询，支持充值、消耗、登录、注册、余额流水明细，并统一时间范围、用户、模型、渠道、支付渠道筛选。
- 增强筛选体验：增加用户搜索选择器、支付方式筛选、快捷时间范围、Top N 切换、指标显示开关；后端同步支持 `username`、`payment_method`、`page`、`page_size`。
- 增强图表能力：将趋势表格升级为折线图或面积图，同时保留表格作为精确数值视图；支持按指标分组展示，避免一张图里混入不同单位导致误读。
- 增加短 TTL 缓存：对 summary、trends、filters 增加 10 到 30 秒缓存，缓存键包含时间范围、粒度和筛选条件；排行榜可按相同策略缓存。
- 增加实时面板：新增 SSE 接口，优先推送最近 60 秒请求数、RPM、TPM、错误数、消耗额度和最近充值摘要；只查短窗口或缓存快照，不推送敏感请求内容。
- 规划统计快照表：当日志或充值表规模继续增长时，新增每日统计快照，按日期、模型、分组、渠道、用户维度沉淀常用指标，减少管理端跨大范围查询压力。
- 规划严谨账本表：如需财务级审计，新增 `quota_ledger` 专表，在充值入账、消费扣减、退款、管理员调整、邀请返佣等所有额度变动处统一写入，避免依赖自然语言日志反推。
- 增强质量指标：基于错误日志和性能数据补充错误排行、异常渠道排行、慢请求模型排行、P95/P99 响应耗时，帮助管理员定位可用性问题。
- 增强安全和合规：明细和导出默认不返回 prompt、token key、完整支付回调、完整交易号；如后续增加导出，必须加入权限校验、范围限制和任务审计记录。
