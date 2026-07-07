# 渠道监控告警规划与落地状态

## 0. 当前实现状态（截至 2026-07-07）

结论：当前基础渠道告警能力已经落地，后续主要是增强、验收补齐和体验完善，不再是从零实现。

### 0.1 已落地

- 全局配置已落在 `channel_alert_setting.*` options 下，并由 `setting/operation_setting/channel_alert_setting.go` 注册默认值与归一化规则。
- 后端专用接口已存在：`GET /api/channel-alert/settings`、`PUT /api/channel-alert/settings`、`GET /api/channel-alert/events`、`GET /api/channel-alert/states`、`POST /api/channel-alert/states/:id/clear`、`POST /api/channel-alert/test`，路由均在 RootAuth 下，测试邮件额外走 `CriticalRateLimit`。
- 渠道级开关已接入新版渠道新增/编辑抽屉，保存到渠道 `settings` JSON（Go 字段为 `Channel.OtherSettings`，前端字段为 `settings`）里的 `channel_alert_enabled`。
- `channel_alert_events` 与 `channel_alert_states` 两张表已在 `model/main.go` 的普通与快速迁移中注册。
- 后端服务已实现异步失败观察、窗口计数、状态码/关键词/`channel:` 错误码匹配、冷却控制、邮件发送、敏感信息遮蔽、恢复通知、恢复事件记录和 30 天事件清理。
- 真实请求失败已从 relay 错误处理入口接入；定时检测失败和手动测试失败已从渠道测试入口接入，并受 `include_relay_errors`、`include_scheduled_tests`、`include_manual_tests` 控制。
- 渠道重新启用时会触发恢复观察，满足条件时发送恢复邮件并关闭活动告警状态。
- 新版系统设置的“路由可靠性”区域已经有渠道告警配置表单、测试告警按钮、最近事件表和活动状态表。

### 0.2 当前实现与原规划差异

- 原规划写“复用 `channels.other_settings`”，当前实际是 `channels.settings` 列，对应 Go 字段 `Channel.OtherSettings` 和前端 `settings` 字段。
- 后端专用 `PUT /api/channel-alert/settings` 已就绪；新版系统设置页当前仍沿用通用 option 保存链路逐项写入 `channel_alert_setting.*`。
- `channel_alert_events` 当前记录 `rule_key`，格式主要为 `status:<code>`、`keyword:<word>`、`error_code:<code>`；没有单独的 `rule_type` 列。
- 事件表当前包含 `error_type`、`request_path`、`email_recipients` 等实现字段；原规划中的 `channel_tag`、`channel_group`、`count_in_window`、`window_seconds` 尚未作为事件列落地。
- 状态表当前使用 `last_event_id` 与 `window_count`；原规划中的 `last_error_preview`、`event_count` 尚未作为状态列落地。
- 冷却期内如果同渠道同规则仍处于 active 且未过冷却，当前实现会直接跳过重复事件记录，因此事件列表不是完整失败审计日志。
- 恢复通知当前会更新 `channel_alert_states`，并写入一条 `recovery` 类型事件；如果邮件发送成功，会把该恢复事件标记为已发送。
- 系统设置页已内嵌最近事件和活动状态表；后端已支持事件筛选、状态筛选和手动清除状态接口，新版前端已新增独立 `/channel-alerts` 页面。
- 当前保存全局告警时，前端和后端都会校验：开启总开关时收件人不能为空；测试接口也会在收件人为空或 SMTP 不可用时返回明确错误。

### 0.3 待增强

- 渠道列表展示最近告警时间、最近恢复时间、最近原因预览和告警启用状态。
- 渠道告警独立事件页已接入筛选、分页、活动状态和手动清除状态。
- 手动清除状态仅允许清除 active 状态，会写入 `manual_clear` 事件，方便审计和运营闭环。
- 每渠道覆盖阈值、窗口、冷却时间，以及按标签批量启用告警。
- 告警级别、渠道余额异常、响应时间持续超阈值、模型不可用比例等更细规则。
- Webhook、Bark、Gotify 等非邮件通知方式。
- 开启总开关时的收件人前端/后端保存期校验和更明确的配置提示。
- 针对服务层、接口和前端表单的自动化测试；当前未看到专门的 channel alert 测试用例。

### 0.4 验收入口

- 全局配置：后台 `系统设置 -> 模型设置 -> 路由可靠性 -> Channel alerts` 区域。
- 渠道级开关：新版渠道新增/编辑抽屉中的 `Channel alert` 开关。
- 测试邮件：`POST /api/channel-alert/test`，或系统设置里的 `Send test alert` 按钮。
- 事件查询：`GET /api/channel-alert/events?p=1&page_size=10`，支持 `channel_id`、`source`、`rule_key`、`alert_sent`、`start_time`、`end_time` 筛选，也可在系统设置页的 `Recent alert events` 表查看。
- 状态查询：`GET /api/channel-alert/states?active=true&p=1&page_size=10`，支持 `active`、`channel_id` 筛选，也可在系统设置页的 `Active alert states` 表查看。
- 手动清除状态：`POST /api/channel-alert/states/:id/clear`，会将状态置为 inactive，写入 `manual_clear` 事件，不发送邮件。
- 真实请求验收：全局告警开启、收件人有效、渠道 `channel_alert_enabled=true`，触发配置内状态码/关键词并达到窗口阈值后，应发送异常邮件并写入事件/状态。
- 定时/手动测试验收：分别打开 `include_scheduled_tests` 或 `include_manual_tests`，让渠道测试产生命中规则的失败，达到阈值后应发送告警。
- 恢复验收：已有 active 告警状态后，渠道重新启用并开启恢复通知，应发送恢复邮件、写入 recovery 事件并将 active 状态置为 false。

### 0.5 注意事项

- 告警链路只负责通知，不改变渠道启停状态；自动禁用/自动恢复仍走既有规则。
- 告警事件保存的是经过遮蔽和截断的错误预览，不应写入 API Key、用户请求内容、用户 Token 或完整上游响应。
- 测试邮件不要求全局开关开启，也不要求具体渠道开启，只校验收件人和 SMTP 发送链路。
- 冷却期跳过重复事件会降低事件量，但也意味着事件表不能作为完整失败次数审计来源。
- 事件清理目前由服务层按 30 天保留周期机会触发；如果需要强 SLA 清理，可后续增加定时任务或可配置保留天数。

## 1. 背景与目标

当前系统已经有渠道自动禁用、自动恢复、定时检测、SMTP 邮件、用户通知方式等能力。现有逻辑更偏“检测失败后改变渠道状态”，例如自动禁用后通知 root 用户。管理员想要的是更细一层的“渠道异常告警”：某个渠道在短时间内连续出现错误时，先通知指定收件人，方便人工判断和处理。

“渠道告警”能力目标是：

- 在渠道管理中单独启用或关闭某个渠道的告警。
- 在系统设置中配置告警收件人、判定规则、冷却时间、恢复通知等全局规则。
- 按错误频率判断是否触发告警，例如 1 分钟内同一渠道出现指定错误 3 次。
- 告警与自动禁用解耦：告警负责通知，自动禁用仍由现有自动禁用规则决定。
- 复用现有 SMTP 与通知链路，尽量少改主请求链路。

## 2. 产品方案

### 2.1 渠道管理侧

在渠道新增/编辑页面增加“告警”小节：

- 启用渠道告警：开关，默认关闭。
- 使用全局规则：默认开启。
- 覆盖错误阈值：可选，第一版可不做。
- 覆盖冷却时间：可选，第一版可不做。
- 告警备注：可选，用于邮件里标注渠道用途。

渠道列表建议增加轻量展示：

- 告警状态：已启用 / 未启用。
- 最近告警时间。
- 最近恢复时间。
- 最近告警原因预览。

当前已经落地渠道编辑里的开关。渠道列表的最近告警、最近恢复和原因预览仍属于后续增强。

### 2.2 系统设置侧

当前在新版前端 `系统设置 -> 路由可靠性` 区域展示“渠道告警”配置：

- 总开关：是否启用渠道告警。
- 告警收件人：支持多个邮箱，按逗号、换行或分号分隔。
- 告警窗口：例如 60 秒。
- 触发阈值：例如窗口内同一渠道出现 3 次命中错误。
- 告警冷却：例如同一渠道 30 分钟内只发一次同类告警。
- 恢复通知：渠道恢复正常后是否发送恢复邮件。
- 告警状态码：例如 `401,403,429,500-599`。
- 告警关键词：每行一个，例如 `insufficient_quota`、`rate limit`、`invalid api key`。
- 是否包含定时检测失败：默认开启。
- 是否包含真实请求失败：默认开启。
- 是否包含手动测试失败：默认关闭，避免管理员测试时刷邮件。

### 2.3 告警邮件内容

告警邮件建议包含：

- 告警级别：异常 / 恢复。
- 渠道名称与 ID。
- 渠道类型、分组、标签。
- 命中规则：状态码、关键词、错误类型。
- 时间窗口和错误次数。
- 最近错误时间。
- 最近错误预览，限制长度，不输出完整请求内容。
- 处理建议：检查上游账号、余额、额度、Key 状态、代理、Base URL。
- 后台渠道链接。

不应包含：

- API Key 明文。
- 用户请求内容。
- 用户 Token 明文。
- 完整上游响应体。
- 支付或用户隐私字段。

## 3. 判定规则

### 3.1 错误来源

当前已经接入以下来源：

1. 真实请求失败
   - 在 relay 请求链路已经得到 channelId、statusCode、error message、requestId 时记录。
   - 只记录错误事件，不阻塞请求返回。

2. 定时渠道检测失败
   - 复用现有渠道测试任务结果。
   - 定时检测失败可以触发告警。

3. 手动测试失败
   - 已有开关控制，默认关闭，避免管理员测试时刷邮件。

后续可扩展：

- 渠道余额异常。
- 响应时间持续超阈值。
- 连续自动恢复失败。
- 模型不可用比例过高。

### 3.2 告警条件

默认规则建议：

```text
同一渠道在 60 秒内命中告警错误 >= 3 次，触发告警。
同一渠道同一类告警 30 分钟内只发送 1 次。
渠道恢复后，如果开启恢复通知，则发送 1 次恢复通知。
```

“同一类告警”当前通过 `rule_key` 归类：

- `channel_id`
- `status:<status_code>`：命中状态码规则时使用。
- `keyword:<keyword>`：命中关键词规则时使用。
- `error_code:<error_code>`：系统内部错误码以 `channel:` 开头时使用。

这样可以避免同一个渠道同时出现 401 和 500 时互相覆盖。

### 3.3 状态码规则

支持格式：

```text
401,403,429,500-599
```

默认建议：

- `401` / `403`：认证、权限、账号失效。
- `429`：额度或频率限制。
- `500-599`：上游服务异常。

注意：

- 不是所有 429 都应该自动禁用渠道，但可以告警。
- 404、400 可能是模型或请求参数问题，不建议默认告警，除非管理员主动配置。

### 3.4 关键词规则

每行一个关键词，大小写不敏感。

建议默认空，由管理员自行配置。可选参考关键词：

```text
insufficient quota
rate limit
invalid api key
unauthorized
permission denied
account disabled
quota exceeded
```

关键词只用于错误预览，不保存完整响应体。

### 3.5 恢复规则

恢复通知建议满足：

- 渠道此前处于“已告警未恢复”状态。
- 后续真实请求或定时检测成功。
- 或渠道从自动禁用恢复为启用。
- 同一渠道恢复通知也应有冷却，避免反复抖动。

恢复通知不等于自动启用渠道。自动启用仍走现有 `AutomaticEnableChannelEnabled`。

## 4. 数据设计

### 4.1 系统配置

为减少迁移和上游冲突，第一版全局配置继续走 `options` 表。

第一版实现使用 `options` 表里的 `channel_alert_setting.*` 配置项，由 `GlobalConfig.Register("channel_alert_setting", ...)` 统一加载，避免新增单独配置表。

配置结构示例：

```json
{
  "enabled": false,
  "recipients": [],
  "window_seconds": 60,
  "failure_threshold": 3,
  "cooldown_seconds": 1800,
  "recovery_enabled": true,
  "recovery_cooldown_seconds": 1800,
  "status_codes": "401,403,429,500-599",
  "keywords": [],
  "include_relay_errors": true,
  "include_scheduled_tests": true,
  "include_manual_tests": false
}
```

默认关闭，避免升级后立即发邮件。

### 4.2 渠道配置

当前实现未新增渠道表字段，复用 `channels.settings` JSON（Go 字段 `Channel.OtherSettings`，前端字段 `settings`），给 `ChannelOtherSettings` 增加：

```json
{
  "channel_alert_enabled": false
}
```

原因：

- 避免新增渠道表迁移。
- 每个渠道只需要一个开关，读写成本低。
- 后续如果需要按告警状态筛选、排序、批量操作，再考虑提升为独立列。

如果后续需要每渠道覆盖规则，可扩展：

```json
{
  "channel_alert_enabled": true,
  "channel_alert_override": {
    "window_seconds": 60,
    "failure_threshold": 5,
    "cooldown_seconds": 3600
  }
}
```

### 4.3 告警事件表

当前已新增轻量表：

```text
channel_alert_events
```

已落地字段：

- `id`
- `channel_id`
- `channel_name`
- `channel_type`
- `source`：relay / scheduled_test / manual_test
- `rule_key`：例如 `status:401`、`keyword:rate limit`、`error_code:channel:xxx`
- `status_code`
- `error_code`
- `error_type`
- `error_preview`
- `request_id`
- `model_name`
- `group_name`
- `request_path`
- `alert_sent`
- `email_recipients`
- `created_at`

用途：

- 记录错误事件。
- 支持窗口计数。
- 支持最近告警查看。
- 便于排查误报。
- 注意：冷却期内的重复失败当前不会继续写入事件表，因此它不是完整失败审计日志。
- 待增强：如需要更完整的排查维度，可补 `channel_tag`、`channel_group`、`count_in_window`、`window_seconds` 等字段。

### 4.4 告警状态表

当前已新增：

```text
channel_alert_states
```

已落地字段：

- `id`
- `channel_id`
- `rule_key`
- `active`
- `last_alert_at`
- `last_recovery_at`
- `last_event_id`
- `window_count`
- `updated_at`

用途：

- 判断冷却。
- 判断是否需要恢复通知。
- 避免只靠查询事件表推断状态导致性能问题。

待增强：

- 如果运营需要在状态表直接展示原因，可补 `last_error_preview`。
- 如果需要更清晰区分“最近事件时间”和“最近更新时间”，可补 `last_event_at`。

## 5. 后端实现方案

### 5.1 已落地文件

当前已落地：

- `setting/operation_setting/channel_alert_setting.go`
- `model/channel_alert.go`
- `service/channel_alert.go`
- `controller/channel_alert.go`

### 5.2 接口设计

后端已经提供专用接口：

```text
GET /api/channel-alert/settings
PUT /api/channel-alert/settings
GET /api/channel-alert/events
GET /api/channel-alert/states
POST /api/channel-alert/states/:id/clear
POST /api/channel-alert/test
```

权限：

- 使用 `RootAuth`，因为涉及全局收件人和告警策略。
- `POST /api/channel-alert/test` 额外使用 `CriticalRateLimit`。
- `POST /api/channel-alert/states/:id/clear` 使用同一 RootAuth 分组，只做状态确认和审计事件记录，不触发邮件。

注意：

- 新版系统设置页当前仍沿用通用 `/api/option` 保存链路逐项写入 `channel_alert_setting.*`，没有直接调用专用 `PUT /api/channel-alert/settings`。

渠道编辑：

- 复用现有渠道创建/更新接口，在 `settings.channel_alert_enabled` 中保存开关。

### 5.3 记录错误事件

已落地服务函数：

```go
ObserveChannelFailureAsync(params)
ObserveChannelFailure(params)
ObserveChannelRecovery(params)
```

接入点：

- relay 请求确定渠道失败后，异步记录错误事件。
- 渠道自动测试失败后，异步记录错误事件。
- 渠道重新启用后，异步记录恢复观察；恢复通知会额外写入 `channel_alert_events`，`rule_key` 为 `recovery`。

要求：

- 不阻塞主请求。
- 不因告警失败影响用户请求。
- 服务日志只输出告警 ID、渠道 ID、状态码，不输出完整错误内容。

### 5.4 告警发送

发送逻辑：

1. 检查全局开关。
2. 检查渠道是否启用告警。
3. 判断错误是否命中状态码或关键词。
4. 如果同渠道同规则仍处于 active 且处于冷却期，当前实现直接跳过重复事件与邮件。
5. 写入 `channel_alert_events`。
6. 查询窗口内同渠道同规则事件数。
7. 达到阈值后检查并更新 `channel_alert_states`。
8. 未冷却则发送邮件，并将事件标记为已发送。

邮件发送：

- 第一版直接复用 `common.SendEmail`。
- 支持多个收件人。
- 每个收件人发送失败要记录，但不能影响其他收件人。
- SMTP 未配置时只记录系统日志，并在测试接口中返回明确错误。
- 测试邮件不要求全局开关或具体渠道开关开启，只验证收件人与 SMTP 链路。

### 5.5 与现有自动禁用关系

当前已有能力：

- `AutomaticDisableChannelEnabled`
- `AutomaticEnableChannelEnabled`
- `AutomaticDisableStatusCodes`
- `AutomaticDisableKeywords`
- `DisableChannel`
- `EnableChannel`
- `NotifyRootUser`

新告警能力与这些关系如下：

- 告警不改变渠道状态。
- 自动禁用仍由现有规则决定。
- 自动禁用成功后，可以复用告警状态发送更明确的“渠道已自动禁用”通知。
- 恢复通知可以接入 `EnableChannel`，但要走冷却。

## 6. 前端实现方案

### 6.1 系统设置

在新版前端：

- `web/default/src/features/system-settings/models/routing-reliability-section.tsx`

第一版放在“路由可靠性”区域，和自动重试、自动禁用、渠道检测放在一起，减少导航和页面改动。

页面控件：

- 总开关。
- 收件人多行输入。
- 告警窗口秒数。
- 触发阈值。
- 冷却时间。
- 恢复通知开关。
- 状态码输入。
- 关键词多行输入。
- 来源开关：真实请求、定时检测、手动测试。
- 测试告警按钮。

### 6.2 渠道管理

在渠道新增/编辑表单中增加：

- `启用渠道告警` 开关。
- 简短说明：启用后，该渠道命中系统告警规则会通知系统设置中的收件人。

不建议第一版做每渠道复杂覆盖规则，避免前端表单太重。

### 6.3 告警记录

当前新版系统设置页已经内嵌：

- 最近告警事件表，读取 `GET /api/channel-alert/events`。
- 活动告警状态表，读取 `GET /api/channel-alert/states?active=true`。
- 后端已支持事件按渠道、来源、规则、发送状态和时间范围筛选，状态按渠道和 active 筛选，并提供手动清除状态接口。

独立告警记录页已经落在 `/channel-alerts`，支持筛选、分页、活动状态查看和手动清除。

第二阶段后续增强：

- 渠道列表展示最近告警、最近恢复和告警启用状态。
- 更细的状态码/错误码筛选。
- 每渠道覆盖阈值、窗口和冷却时间。

## 7. 测试与验收

### 7.1 后端验证

- 全局告警关闭时不记录、不发送。
- 渠道未启用告警时不发送。
- 状态码命中规则时记录事件。
- 关键词命中规则时记录事件。
- 60 秒内达到阈值后发送邮件。
- 未达到阈值不发送。
- 冷却期内不重复发送。
- 当前实现冷却期内也不重复记录同渠道同规则事件。
- 冷却期后再次达到阈值可再次发送。
- SMTP 未配置时返回明确测试错误。
- 真实请求链路不因告警发送失败而失败。
- 恢复成功后只在开启恢复通知时发送。
- 恢复成功后活动状态应被置为 false，并写入恢复事件。
- 手动清除状态应将 active 置为 false，刷新 `last_recovery_at` / `updated_at`，写入 `manual_clear` 事件且不发送邮件。

### 7.2 前端验证

- 系统设置可保存并回显告警规则。
- 多收件人输入能正确校验。
- 渠道编辑页可开启和关闭告警。
- 测试告警能显示成功或失败原因。
- 开启总开关时收件人不能为空；前端表单和后端 option 保存都会阻止空收件人配置。测试告警会提示收件人或 SMTP 链路失败原因。

### 7.3 生产安全验证

- 告警邮件不包含 API Key 明文。
- 告警邮件不包含用户请求内容。
- 告警事件只保存错误预览，长度限制。
- 告警发送失败不影响用户请求。
- 告警事件表有保留周期或后续清理方案。

## 8. 实施阶段与状态

### 阶段一：基础告警（已落地）

- 已新增全局告警配置。
- 已在渠道编辑页增加告警开关。
- 已新增事件表和状态表。
- 已接入真实请求失败、定时检测失败和可选手动测试失败。
- 已支持邮件告警、冷却、恢复通知、测试邮件和敏感信息遮蔽。

### 阶段二：告警可视化（部分落地，后续增强）

- 已在系统设置页内嵌最近告警事件和活动状态表。
- 已新增独立 `/channel-alerts` 页面，展示告警事件、活动状态、筛选、分页和手动清除入口。
- 已补齐后端筛选参数和手动清除状态接口。
- 待增强：渠道列表显示最近告警状态。
- 待增强：更细的筛选项和渠道列表联动。

### 阶段三：规则增强（待增强）

- 每渠道覆盖阈值和冷却。
- 按渠道标签批量启用告警。
- 告警级别：普通、严重、紧急。
- 支持 webhook/Bark/Gotify 等现有用户通知方式。

## 9. 建议默认决定

- 默认关闭全局告警。
- 每个渠道默认关闭告警。
- 默认只通过邮件通知系统设置中的收件人。
- 默认规则：60 秒内 3 次，冷却 30 分钟。
- 默认状态码：`401,403,429,500-599`。
- 默认不包含手动测试失败。
- 告警不自动禁用渠道，自动禁用继续走现有规则。
- 第一版不做每渠道复杂覆盖规则。
