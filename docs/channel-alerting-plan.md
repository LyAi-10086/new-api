# 渠道监控告警规划

## 1. 背景与目标

当前系统已经有渠道自动禁用、自动恢复、定时检测、SMTP 邮件、用户通知方式等能力。现有逻辑更偏“检测失败后改变渠道状态”，例如自动禁用后通知 root 用户。管理员想要的是更细一层的“渠道异常告警”：某个渠道在短时间内连续出现错误时，先通知指定收件人，方便人工判断和处理。

本规划新增“渠道告警”能力，目标是：

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

第一版可以只做渠道编辑里的开关，列表展示放第二阶段。

### 2.2 系统设置侧

在 `系统设置 -> 运维设置 -> 监控与告警` 增加“渠道告警”区域：

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

第一版建议接入两类来源：

1. 真实请求失败
   - 在 relay 请求链路已经得到 channelId、statusCode、error message、requestId 时记录。
   - 只记录错误事件，不阻塞请求返回。

2. 定时渠道检测失败
   - 复用现有渠道测试任务结果。
   - 定时检测失败可以触发告警，但手动测试失败默认不触发。

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

“同一类告警”建议按以下字段归类：

- `channel_id`
- `rule_type`：status_code / keyword / channel_error / timeout
- `status_code`：有状态码时使用
- `error_code`：系统内部错误码，有则使用

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

第一版建议不新增渠道表字段，复用 `channels.other_settings` JSON，给 `ChannelOtherSettings` 增加：

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

建议新增轻量表：

```text
channel_alert_events
```

字段建议：

- `id`
- `channel_id`
- `channel_name`
- `channel_type`
- `channel_tag`
- `channel_group`
- `source`：relay / scheduled_test / manual_test
- `rule_type`：status_code / keyword / channel_error / timeout / recovery
- `status_code`
- `error_code`
- `error_preview`
- `request_id`
- `model_name`
- `group`
- `count_in_window`
- `window_seconds`
- `alert_sent`
- `created_at`

用途：

- 记录错误事件。
- 支持窗口计数。
- 支持最近告警查看。
- 便于排查误报。

### 4.4 告警状态表

建议新增：

```text
channel_alert_states
```

字段建议：

- `channel_id`
- `rule_key`
- `active`
- `last_alert_at`
- `last_recovery_at`
- `last_event_at`
- `last_error_preview`
- `event_count`
- `updated_at`

用途：

- 判断冷却。
- 判断是否需要恢复通知。
- 避免只靠查询事件表推断状态导致性能问题。

如果想更极简，第一版也可以只建事件表，并用 Redis 或内存保存冷却状态。但生产重启后会丢状态，不建议。

## 5. 后端实现方案

### 5.1 新增文件

建议新增：

- `setting/channel_alert_setting.go`
- `model/channel_alert.go`
- `service/channel_alert.go`
- `controller/channel_alert.go`

### 5.2 接口设计

系统设置接口可以继续走现有 `/api/option` 保存配置，也可以新增专用接口。

建议第一版使用专用接口，避免前端拼散落 option：

```text
GET /api/channel-alert/settings
PUT /api/channel-alert/settings
GET /api/channel-alert/events
GET /api/channel-alert/states
POST /api/channel-alert/test
```

权限：

- 使用 `RootAuth`，因为涉及全局收件人和告警策略。

渠道编辑：

- 复用现有渠道创建/更新接口，在 `other_settings.channel_alert_enabled` 中保存开关。

### 5.3 记录错误事件

新增服务函数：

```go
ObserveChannelFailure(ctx, params)
ObserveChannelRecovery(ctx, params)
```

接入点：

- relay 请求确定渠道失败后，异步记录错误事件。
- 渠道自动测试失败后，异步记录错误事件。
- 渠道自动测试成功或渠道重新启用后，记录恢复事件。

要求：

- 不阻塞主请求。
- 不因告警失败影响用户请求。
- 服务日志只输出告警 ID、渠道 ID、状态码，不输出完整错误内容。

### 5.4 告警发送

发送逻辑：

1. 检查全局开关。
2. 检查渠道是否启用告警。
3. 判断错误是否命中状态码或关键词。
4. 写入 `channel_alert_events`。
5. 查询窗口内同渠道同规则事件数。
6. 达到阈值后检查 `channel_alert_states` 冷却。
7. 未冷却则发送邮件。
8. 更新告警状态。

邮件发送：

- 第一版直接复用 `common.SendEmail`。
- 支持多个收件人。
- 每个收件人发送失败要记录，但不能影响其他收件人。
- SMTP 未配置时只记录系统日志，并在测试接口中返回明确错误。

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

第一版可以先不做完整记录页，只在渠道详情或列表显示最近一次告警状态。

第二阶段增加：

- `/channel-alerts`
- 告警事件列表。
- 筛选：渠道、来源、状态码、时间范围、是否已发送。
- 状态页：当前仍处于告警中的渠道。

## 7. 测试与验收

### 7.1 后端验证

- 全局告警关闭时不记录、不发送。
- 渠道未启用告警时不发送。
- 状态码命中规则时记录事件。
- 关键词命中规则时记录事件。
- 60 秒内达到阈值后发送邮件。
- 未达到阈值不发送。
- 冷却期内不重复发送。
- 冷却期后再次达到阈值可再次发送。
- SMTP 未配置时返回明确测试错误。
- 真实请求链路不因告警发送失败而失败。
- 恢复成功后只在开启恢复通知时发送。

### 7.2 前端验证

- 系统设置可保存并回显告警规则。
- 多收件人输入能正确校验。
- 渠道编辑页可开启和关闭告警。
- 测试告警能显示成功或失败原因。
- 空收件人时不允许开启全局告警，或保存时提示。

### 7.3 生产安全验证

- 告警邮件不包含 API Key 明文。
- 告警邮件不包含用户请求内容。
- 告警事件只保存错误预览，长度限制。
- 告警发送失败不影响用户请求。
- 告警事件表有保留周期或后续清理方案。

## 8. 实施阶段

### 阶段一：基础告警

- 新增全局告警配置。
- 渠道编辑页增加告警开关。
- 新增事件表和状态表。
- 接入真实请求失败和定时检测失败。
- 支持邮件告警、冷却、恢复通知。

### 阶段二：告警可视化

- 渠道列表显示最近告警状态。
- 新增告警事件列表。
- 支持筛选和分页。
- 支持手动清除告警状态。

### 阶段三：规则增强

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
