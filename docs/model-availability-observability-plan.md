# 模型可用性观测页面规划

## 1. 背景与目标

这个模块不做“定时测试”或“定时探活”。核心思路是用真实用户请求来观察模型是否可用：

- 用户真实请求成功，说明当前模型在对应分组、渠道、请求格式下有真实可用样本。
- 用户真实请求失败，记录失败类型、状态码、渠道、模型、分组、请求路径，用于判断模型健康度。
- 没有用户请求时，不把模型判定为不可用，只标记为“样本不足”或“暂无数据”。

目标不是只做一个后台页面，而是拆成两个页面：

```text
管理后台 -> 模型可用性
用户侧 -> 模型状态
```

管理员页用于详细监测和排障，可以看到模型、分组、渠道、错误码、request_id、最近错误样本等信息。用户页用于给用户一个脱敏后的服务状态参考，只展示用户自己可用模型的概览，不暴露渠道、内部错误、上游信息和其他用户数据。

这个页面和“渠道告警”不是同一个东西：

- 管理员模型可用性页面：给管理员看模型维度的真实请求成功率、错误率、延迟、分组差异和错误追踪。
- 用户模型状态页面：给用户看自己可用模型的近期可用性和性能摘要，所有数据必须脱敏和降粒度。
- 渠道告警：针对具体渠道故障触发通知。
- 管理端数据统计：看充值、消耗、活跃、排行等运营指标。

## 2. 现有代码基础

当前系统已经有一套非常接近该需求的真实请求性能统计。

### 2.1 `perf_metrics` 聚合表

相关文件：

- `model/perf_metric.go`
- `pkg/perf_metrics/metrics.go`
- `pkg/perf_metrics/flush.go`
- `pkg/perf_metrics/types.go`
- `controller/perf_metrics.go`
- `router/api-router.go`

现有聚合维度：

- `model_name`
- `group`
- `bucket_ts`

现有指标：

- `request_count`
- `success_count`
- `total_latency_ms`
- `ttft_sum_ms`
- `ttft_count`
- `output_tokens`
- `generation_ms`

现有接口：

```text
GET /api/perf-metrics/summary
GET /api/perf-metrics?model=模型名&group=分组&hours=24
```

现有前端已使用这些接口展示模型性能：

- `web/default/src/features/performance-metrics/api.ts`
- `web/default/src/features/performance-metrics/types.ts`
- `web/default/src/features/pricing/components/model-perf-badge.tsx`
- `web/default/src/features/pricing/components/model-details-performance.tsx`
- `web/default/src/features/dashboard/components/overview/performance-health-panel.tsx`
- `web/default/src/features/dashboard/components/models/performance-overview.tsx`

这说明系统里已经有“根据真实请求观察模型表现”的基础能力。后续不要重复造一套大系统，应该复用这条链路。

### 2.2 成功样本来源

成功请求会在结算和消费日志完成后记录性能样本：

- `service/text_quota.go`
- `service/quota.go`

核心调用：

```text
perfmetrics.RecordRelaySample(relayInfo, true, outputTokens)
```

记录内容使用：

- `relayInfo.OriginModelName`
- `relayInfo.UsingGroup`
- `relayInfo.StartTime`
- `relayInfo.FirstResponseTime`
- completion tokens / output tokens

这里使用 `OriginModelName` 很关键，因为管理员想看的是用户侧请求的模型名是否可用，而不是某个渠道内部映射后的上游模型名。

### 2.3 失败样本来源

最终失败请求会在 relay 结束后记录失败样本：

- `controller/relay.go`

核心调用：

```text
perfmetrics.RecordRelaySample(relayInfo, false, 0)
```

当前逻辑记录的是“用户最终看到的失败”。如果某个请求中间换了渠道重试，最后成功，则模型可用性页面应该把它算作用户感知成功；中间失败可以留给渠道错误分析使用。

### 2.4 错误日志来源

详细错误信息来自 `logs` 表：

- `model/log.go`
- `controller/relay.go`
- `controller/log.go`

相关字段：

- `type = LogTypeError`
- `created_at`
- `user_id`
- `username`
- `model_name`
- `channel_id`
- `channel_name`
- `token_id`
- `token_name`
- `group`
- `use_time`
- `request_id`
- `upstream_request_id`
- `other.status_code`
- `other.error_code`
- `other.error_type`
- `other.request_path`
- `other.admin_info.use_channel`

这部分适合用来做错误分布、渠道下钻、状态码分布和最近失败样本，但不应该把用户 prompt 原文放进模型可用性页面。

## 3. 产品方案

### 3.1 双页面入口

建议新增两个页面。

管理员页面：

```text
管理后台 -> 模型可用性
```

路由建议：

```text
/admin/model-availability
```

如果更想和现有“性能健康”表达统一，也可以用：

```text
/admin/model-health
```

用户页面：

```text
模型状态
```

路由建议：

```text
/model-status
```

也可以放在模型广场附近：

```text
模型广场 -> 模型状态
```

推荐第一版做独立用户页面，而不是塞到模型广场详情里。模型广场可以放一个轻量入口，点击后进入完整状态页。

权限建议：

- 管理员页面仅管理员可见。
- 管理员详细错误样本、渠道下钻、用户/令牌维度建议使用超级管理员权限。
- 用户页面仅登录用户可见。
- 用户页面只返回当前用户可用模型范围内的脱敏状态。
- 后端接口必须做权限校验，不能只依赖前端隐藏菜单。

### 3.2 管理员页面结构

管理员页面第一版建议分 5 个区域。

#### 总览卡片

- 最近 5 分钟请求数。
- 最近 1 小时请求数。
- 最近 24 小时成功率。
- 最近 24 小时失败数。
- 平均响应耗时。
- 平均首 token 时间。
- 样本不足模型数。
- 异常模型数。

#### 模型健康列表

每行一个模型，展示：

- 模型名。
- 请求数。
- 成功率。
- 错误率。
- 平均延迟。
- 平均 TTFT。
- 输出速度。
- 最近 3 个时间桶成功率。
- 健康状态：健康、波动、异常、样本不足。
- 主要异常分组。
- 主要异常渠道。
- 最近主要错误码。
- 最后一次失败时间。

支持筛选：

- 时间窗口：5 分钟、1 小时、24 小时、7 天、30 天。
- 分组。
- 模型名。
- 健康状态。
- 最小样本数。
- 状态码。
- 错误码。
- 渠道。

#### 分组对比

同一个模型在不同分组下可能表现不同，因此详情页需要展示：

- 分组请求数。
- 分组成功率。
- 分组错误率。
- 分组平均延迟。
- 分组平均 TTFT。
- 分组输出速度。

示例：

```text
gpt-5.4
default: 成功率 99.2%，平均延迟 2.1s
vip:     成功率 96.8%，平均延迟 3.8s
auto:    样本不足
```

#### 渠道下钻

用于回答：

- 是整个模型不可用，还是某个渠道异常。
- 是某个分组路由到的渠道异常，还是所有分组都异常。
- 是否大量 429、401、403、5xx、超时。

第一版渠道下钻可以基于 `logs` 表做查询，不必立刻改 `perf_metrics` 表结构。

展示字段：

- 渠道 ID。
- 渠道名称。
- 渠道类型。
- 模型名。
- 分组。
- 错误数。
- 最近错误时间。
- 主要状态码。
- 主要错误码。
- 最近 request_id。

#### 最近错误样本

管理员页面可以展示最近失败请求，但仍必须做安全处理：

- 时间。
- 模型。
- 分组。
- 渠道。
- 状态码。
- 错误码。
- 错误类型。
- request_id。
- upstream_request_id。
- 请求路径。
- 简短错误信息。
- 是否最终失败。
- 是否经历重试。
- 使用过的渠道链路。

不展示：

- 用户 prompt。
- 完整请求内容。
- API Key。
- token key。
- 上游密钥。
- 完整敏感错误堆栈。

管理员页面可以展示 `request_id` 和 `upstream_request_id`，因为它们用于排障；但不要在用户页面展示这些内部追踪标识。

### 3.3 用户页面结构

用户页面的目标是让用户知道“我现在能不能用、哪个模型更稳、哪个模型近期波动”，不是让用户排查供应商或渠道。

建议页面结构：

#### 状态总览

- 当前可用模型数。
- 近期稳定模型数。
- 近期波动模型数。
- 样本不足模型数。
- 数据更新时间。

#### 用户可用模型状态列表

每行一个用户可用模型，展示：

- 模型名。
- 状态：可用、波动、可能异常、样本不足。
- 速度：快、正常、较慢。
- 首响：快、正常、较慢。
- 近期请求热度：高、中、低、暂无样本。
- 数据窗口：例如最近 24 小时。

不展示精确内部字段：

- 不展示渠道 ID。
- 不展示渠道名称。
- 不展示状态码。
- 不展示错误码。
- 不展示 request_id。
- 不展示 upstream_request_id。
- 不展示其他用户请求量。
- 不展示内部重试链路。

可以展示降粒度指标：

```text
可用性：99%+
延迟：约 2 秒
首响：约 800 毫秒
样本：充足
```

也可以进一步简化为：

```text
可用性：高
响应速度：正常
样本状态：充足
```

第一版建议使用“状态 + 区间”的方式，不直接展示完整成功率和错误数，避免用户误读或反向推测平台流量。

#### 模型详情

用户点击模型后只展示：

- 最近 24 小时状态趋势。
- 简化延迟趋势。
- 样本状态。
- 常见说明。

例如：

```text
该模型近期整体可用，但部分时间响应较慢。
数据来自平台真实请求统计，不包含定时测试。
```

不展示错误样本和渠道信息。

#### 空状态

- 当前用户暂无可用模型。
- 当前模型暂无足够真实请求样本。
- 当前时间窗口内暂无状态数据。

### 3.4 管理员页和用户页的边界

两边可以共用同一套底层数据，但 API 和返回字段必须拆开。

管理员页：

- 目标：排障、追踪、定位问题。
- 粒度：模型、分组、渠道、状态码、错误码、请求路径、request_id。
- 权限：管理员或超级管理员。
- 风险：内部信息泄露，需要严格鉴权。

用户页：

- 目标：给用户选择模型时的状态参考。
- 粒度：当前用户可用模型、状态标签、延迟区间、样本状态。
- 权限：登录用户。
- 风险：不能泄露渠道、错误码、平台总体流量和其他用户使用情况。

## 4. 判定规则

### 4.1 样本口径

第一版只用真实用户请求，不用定时探活。

推荐口径：

```text
请求数 = request_count
成功数 = success_count
失败数 = request_count - success_count
成功率 = success_count / request_count
错误率 = 1 - 成功率
平均延迟 = total_latency_ms / request_count
平均 TTFT = ttft_sum_ms / ttft_count
输出速度 = output_tokens / generation_ms
```

注意：

- `perf_metrics` 当前按最终请求结果统计，更适合表示用户感知可用性。
- `logs.type = LogTypeError` 更适合表示渠道尝试失败、错误类型和排障细节。
- 如果一个请求重试了 2 个失败渠道后第 3 个渠道成功，模型可用性应算用户感知成功；渠道错误页面可以记录前两个渠道失败。

### 4.2 样本不足

没有请求不能判定模型不可用。

建议默认：

```text
最近 1 小时请求数 < 5：样本不足
最近 24 小时请求数 < 20：低样本
```

样本不足时页面只显示：

```text
暂无足够真实请求样本
```

不要显示“不可用”。

### 4.3 健康状态

第一版可以使用简单规则：

```text
样本不足：
  request_count < min_sample

健康：
  success_rate >= 99%

波动：
  95% <= success_rate < 99%

异常：
  success_rate < 95%

严重异常：
  request_count >= min_sample 且 success_count = 0
```

延迟只作为辅助提示，不直接判定模型不可用：

```text
平均延迟 > 15s：慢
平均 TTFT > 8s：首响慢
```

后续如果要更精细，可以引入 P95/P99 延迟，但当前 `perf_metrics` 只保存平均值和累计值，第一版不建议为此大改数据结构。

### 4.4 错误分类

建议按状态码和错误码分组：

- 401 / 403：鉴权或额度问题，偏渠道配置问题。
- 404：模型名、路径或供应商兼容问题。
- 429：限流或上游负载问题。
- 400：请求格式、参数、模型不兼容问题。
- 408 / timeout：超时。
- 5xx：上游服务异常。
- local_error：本系统前置校验、选渠道、读请求体等本地错误。

第一版不要把所有错误都算成“模型不可用”。例如用户额度不足、敏感词拦截、请求体过大、参数错误，更适合标记为“非模型故障”。

## 5. 后端方案

### 5.1 第一版最小改动

第一版建议新增两组只读接口，复用现有数据。

管理员接口：

```text
GET /api/admin/model-availability/summary
GET /api/admin/model-availability/models
GET /api/admin/model-availability/models/:model
GET /api/admin/model-availability/errors
GET /api/admin/model-availability/channels
GET /api/admin/model-availability/filters
```

用户接口：

```text
GET /api/model-status/summary
GET /api/model-status/models
GET /api/model-status/models/:model
```

对应文件建议：

- `controller/model_availability.go`
- `service/model_availability.go`
- `model/model_availability.go`

原则：

- 不改 relay 主链路。
- 不新增定时任务。
- 不改变计费、渠道选择、重试、模型映射。
- 不保存 prompt。
- 先查询 `perf_metrics` 和 `logs`。
- 管理员接口返回详细排障信息。
- 用户接口只返回脱敏摘要。

### 5.2 查询来源

#### 模型总览

来源：

- `perf_metrics`

聚合维度：

- `model_name`
- 可选 `group`
- 时间窗口内 `bucket_ts`

输出：

- 请求数。
- 成功数。
- 失败数。
- 成功率。
- 错误率。
- 平均延迟。
- 平均 TTFT。
- 输出速度。
- 最近几个桶的成功率。
- 健康状态。

#### 模型详情

来源：

- `perf_metrics`
- `logs`

输出：

- 分组对比。
- 时间序列。
- 错误状态码分布。
- 错误码分布。
- 最近错误样本。
- 渠道错误排行。

#### 用户模型状态

来源：

- `perf_metrics`
- 当前用户可用模型列表。
- 当前用户分组或可访问分组。

输出：

- 模型名。
- 状态标签。
- 速度标签。
- 首响标签。
- 样本标签。
- 数据窗口。

用户状态接口必须先按现有用户可用模型逻辑过滤，只返回用户本来就能看到或使用的模型。即使某个隐藏模型有状态数据，也不能通过状态页暴露给普通用户。

#### 渠道下钻

来源：

- `logs.type = LogTypeError`
- `logs.type = LogTypeConsume`

第一版可以先用错误日志展示渠道异常排行，不强行计算“渠道成功率”。原因是当前成功聚合主要在 `perf_metrics`，没有按 `channel_id` 聚合；如果直接用消费日志算渠道成功分母，需要注意成功日志和错误日志的记录口径不完全一致。

### 5.3 返回结构示例

`GET /api/admin/model-availability/models`：

```json
{
  "success": true,
  "data": {
    "window_hours": 24,
    "items": [
      {
        "model_name": "gpt-5.4",
        "request_count": 1200,
        "success_count": 1188,
        "error_count": 12,
        "success_rate": 99.0,
        "error_rate": 1.0,
        "avg_latency_ms": 2100,
        "avg_ttft_ms": 680,
        "avg_tps": 54.2,
        "health_status": "healthy",
        "sample_status": "enough",
        "recent_success_rates": [99.2, 98.8, 99.0]
      }
    ]
  }
}
```

`GET /api/admin/model-availability/errors`：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "created_at": 1783340000,
        "model_name": "gpt-5.4",
        "group": "default",
        "channel_id": 12,
        "channel_name": "openai-main",
        "status_code": 429,
        "error_code": "rate_limit_exceeded",
        "error_type": "upstream_error",
        "request_id": "req_xxx",
        "upstream_request_id": "up_req_xxx",
        "request_path": "/v1/chat/completions",
        "message_preview": "上游限流"
      }
    ],
    "total": 1
  }
}
```

`GET /api/model-status/models`：

```json
{
  "success": true,
  "data": {
    "window_hours": 24,
    "updated_at": 1783340000,
    "items": [
      {
        "model_name": "gpt-5.4",
        "status": "available",
        "status_label": "可用",
        "latency_level": "normal",
        "ttft_level": "fast",
        "sample_level": "enough",
        "availability_hint": "99%+",
        "latency_hint": "约 2 秒",
        "data_window": "最近 24 小时"
      }
    ]
  }
}
```

用户接口不返回：

- `request_count`
- `success_count`
- `error_count`
- `channel_id`
- `channel_name`
- `status_code`
- `error_code`
- `request_id`
- `upstream_request_id`
- `admin_info`

如果后续想展示更透明的数据，也建议只按区间展示，例如 `99%+`、`95%-99%`、`不足 95%`，不要直接给出小样本下的精确错误率。

### 5.4 配置项

第一版可以先写死默认规则，后续再加配置项：

```json
{
  "min_sample_1h": 5,
  "min_sample_24h": 20,
  "healthy_success_rate": 99,
  "degraded_success_rate": 95,
  "slow_latency_ms": 15000,
  "slow_ttft_ms": 8000,
  "public_enabled": true,
  "public_window_hours": 24,
  "public_min_sample": 20,
  "public_show_exact_rate": false
}
```

如果要做配置，建议仍走 `options` 或现有配置注册机制，不新增复杂表：

```text
ModelAvailabilitySetting
```

### 5.5 后续是否扩展 `perf_metrics`

第一版不建议改 `perf_metrics` 表结构。

如果后续确实需要渠道级成功率、状态码级趋势，可以考虑新增独立聚合表，而不是直接把所有维度塞进现表：

```text
model_availability_metrics
```

建议字段：

- `model_name`
- `group`
- `channel_id`
- `bucket_ts`
- `request_count`
- `success_count`
- `error_count`
- `timeout_count`
- `rate_limit_count`
- `auth_error_count`
- `client_error_count`
- `server_error_count`
- `total_latency_ms`

但这属于第二阶段。第一阶段尽量复用 `perf_metrics` 和 `logs`。

## 6. 前端方案

### 6.1 文件组织

建议拆成管理员功能目录和用户功能目录。

管理员页面：

- `web/default/src/features/model-availability/index.tsx`
- `web/default/src/features/model-availability/api.ts`
- `web/default/src/features/model-availability/types.ts`
- `web/default/src/features/model-availability/components/summary-cards.tsx`
- `web/default/src/features/model-availability/components/model-health-table.tsx`
- `web/default/src/features/model-availability/components/model-health-detail.tsx`
- `web/default/src/features/model-availability/components/error-samples-table.tsx`
- `web/default/src/features/model-availability/components/channel-error-ranking.tsx`

管理员路由建议：

- `web/default/src/routes/_authenticated/admin/model-availability.tsx`

如果当前 admin route 不存在，则按现有侧边栏结构挂到管理员区域。

用户页面：

- `web/default/src/features/model-status/index.tsx`
- `web/default/src/features/model-status/api.ts`
- `web/default/src/features/model-status/types.ts`
- `web/default/src/features/model-status/components/status-summary.tsx`
- `web/default/src/features/model-status/components/model-status-table.tsx`
- `web/default/src/features/model-status/components/model-status-detail.tsx`

用户路由建议：

- `web/default/src/routes/_authenticated/model-status.tsx`

侧边栏或顶部导航建议：

- 名称：`模型状态`
- 入口位置：靠近 `模型广场` 或 `钱包/用量` 这类用户常用区域。

### 6.2 管理员页面交互

顶部筛选：

- 时间窗口。
- 分组。
- 模型。
- 健康状态。
- 最小样本数。

模型列表：

- 默认按异常优先排序。
- 同状态下按请求数倒序。
- 样本不足单独置灰，不混入异常。

详情抽屉：

- 点击模型行打开详情。
- 显示分组趋势、错误分布、渠道下钻、最近错误。

空状态：

- “当前时间窗口内暂无真实请求样本。”
- “该模型样本不足，暂不判定可用性。”

### 6.3 用户页面交互

用户页面不做排障工具，只做状态参考。

顶部：

- 标题：模型状态。
- 数据窗口：最近 24 小时。
- 更新时间。
- 简短说明：数据来自真实请求统计，不包含定时测试。

主体：

- 状态总览。
- 模型状态表。
- 模型状态详情抽屉。

表格列建议：

- 模型。
- 状态。
- 响应速度。
- 首响速度。
- 样本状态。
- 最近趋势。

状态标签建议：

```text
可用
波动
可能异常
样本不足
```

速度标签建议：

```text
快
正常
较慢
暂无数据
```

用户页面不要出现：

- `错误码`
- `状态码`
- `渠道`
- `上游`
- `request_id`
- `重试链路`
- `内部`
- `排障`

### 6.4 视觉与文案边界

管理员页面可以偏工具化，信息密度更高，适合表格、筛选、详情抽屉。

用户页面要更克制：

- 不用“故障”“失败率”这类容易制造恐慌的词作为主视觉。
- 用“近期波动”“样本不足”“响应较慢”这类更准确的描述。
- 明确提示真实请求样本不足时不能代表模型不可用。
- 不展示会让用户推断平台规模的精确请求量。

## 7. 和现有功能的关系

### 7.1 和模型广场性能数据的关系

当前模型广场已经使用 `perf_metrics` 展示性能信息。新页面不是重复模型广场，而是管理端排障面板：

- 模型广场：给用户看模型大致性能。
- 管理员模型可用性：给管理员看模型、分组、渠道、错误码、失败样本。
- 用户模型状态：给用户看自己可用模型的脱敏状态摘要。

模型广场可以显示一个轻量状态入口，例如：

```text
查看模型状态
```

但完整状态页面建议独立，避免把模型价格、介绍、状态、排障信息混在一起。

### 7.2 和渠道告警的关系

渠道告警负责“通知”：

- 某渠道在短时间内错误激增。
- 某渠道连续失败。
- 某渠道恢复。

模型可用性负责“观察和排障”：

- 哪些模型最近不可用。
- 哪些分组受影响。
- 哪些渠道贡献了主要错误。
- 是用户感知失败，还是上游中间失败但最终重试成功。

后续可以让模型可用性页面链接到渠道告警配置，但第一版不要耦合。

### 7.3 和管理端数据统计的关系

管理端数据统计关注运营指标：

- 充值。
- 消耗。
- 注册。
- 活跃。
- 排行。
- 余额。

模型可用性关注服务质量：

- 成功率。
- 错误率。
- 延迟。
- TTFT。
- 分组差异。
- 渠道错误。

这两个页面可以互相跳转，但不要放在同一个大页面里，否则会变成臃肿仪表盘。

## 8. 开源项目参考

这类设计在开源 LLM 可观测项目里比较常见，核心共同点都是“从真实调用链路记录请求，再聚合成可观测指标”。

### 8.1 Helicone

项目：

- <https://github.com/Helicone/helicone>

可吸收：

- 它把 AI Gateway 和 LLM Observability 放在一起，强调请求日志、成本、延迟、质量等指标。
- 它的设计理念和本需求接近：通过网关路径记录真实请求，再做分析页面。
- 可以参考“请求日志 + 指标分析 + 模型/供应商维度”的页面组织方式。

不建议照搬：

- Helicone 有 Worker、ClickHouse、对象存储等较重架构。new-api 第一版已经有 `perf_metrics` 和 `logs`，不需要引入额外服务。

### 8.2 Langfuse

项目：

- <https://github.com/langfuse/langfuse>

可吸收：

- 它是开源 AI 工程平台，覆盖 LLM observability、metrics、prompt management、datasets。
- 可以参考 trace / request / observation 的分层思路，把一次请求、一次上游调用、一次错误样本区分开。
- 它对遥测和原始 trace 的边界说明比较清楚，适合参考隐私边界。

不建议照搬：

- Langfuse 更偏应用链路追踪和评估平台，范围比 new-api 管理端可用性页面大很多。第一版不要引入完整 trace 系统。

### 8.3 LiteLLM Proxy

项目：

- <https://github.com/BerriAI/litellm>

可吸收：

- 它作为 AI Gateway / Proxy Server，覆盖成本追踪、日志、负载均衡、鉴权和管理 UI。
- 可以参考按模型、项目、用户、虚拟 key 的成本和请求统计方式。
- 它的代理层监控思路和 new-api 位置接近，都在请求转发层天然能拿到真实请求结果。

不建议照搬：

- LiteLLM 的多租户、项目、预算、策略体系较重。new-api 只需要吸收“真实请求日志聚合”的部分。

### 8.4 Portkey Gateway

项目：

- <https://github.com/Portkey-AI/gateway>

可吸收：

- 它强调网关、重试、fallback、负载均衡、guardrails 和 observability。
- 可以参考它把路由稳定性和可观测性结合的产品思路。

不建议照搬：

- Guardrails、复杂条件路由不是本模块第一阶段目标。

### 8.5 OpenLLMetry

项目：

- <https://github.com/traceloop/openllmetry>

可吸收：

- 它基于 OpenTelemetry 做 LLM 可观测。
- 适合后续作为外部观测系统导出的参考，例如把模型请求指标导出到 Grafana、Datadog、New Relic。

不建议照搬：

- 第一版不需要 OpenTelemetry SDK，也不需要外部 collector。当前目标是 new-api 内部管理页。

### 8.6 Arize Phoenix

项目：

- <https://github.com/Arize-ai/phoenix>

可吸收：

- 它关注 AI observability、tracing、evaluation 和 troubleshooting。
- 可以参考“排障详情页”的组织方式，尤其是从聚合指标跳到具体样本。

不建议照搬：

- Phoenix 更偏应用评估和实验，不是网关运营后台。第一版不要做质量评测、数据集、实验管理。

### 8.7 TensorZero

项目：

- <https://github.com/tensorzero/tensorzero>

可吸收：

- 它把 Gateway、observability、evaluation 和 optimization 连成一条链路。
- 适合参考“生产请求 -> 反馈/指标 -> 数据集 -> 回放/评估 -> 优化”的长期闭环。
- 如果后续要从“模型能不能用”升级到“模型效果好不好”，这类设计很有价值。

不建议照搬：

- 第一版不要做自动调参、自动优化和复杂评估系统。
- 先把请求、错误、延迟、分组、渠道这些事实链路打稳，再考虑反馈和回放。

### 8.8 推荐借鉴顺序

建议按这个顺序吸收：

```text
LiteLLM / Helicone 的网关埋点模型
-> Portkey 的 retry / fallback 链路解释
-> Langfuse 的 trace / feedback 分层
-> OpenTelemetry 的外部导出标准
-> TensorZero 的生产数据闭环
```

这条路线比“定时请求一个模型看是否 200”更贴近真实用户体验，也更适合当前 new-api 的网关形态。

## 9. 推荐实施阶段

### 阶段一：管理员只读模型可用性页面

目标：

- 新增管理端页面。
- 新增只读接口。
- 复用 `perf_metrics` 展示模型请求数、成功率、错误率、延迟、TTFT、输出速度。
- 复用 `logs` 展示最近错误和状态码分布。
- 不新增定时任务。
- 不改 relay 主链路。
- 不改计费。
- 不改渠道选择。

这一阶段先满足管理员监测和追踪错误。

### 阶段二：用户脱敏模型状态页面

目标：

- 新增用户侧 `模型状态` 页面。
- 新增 `/api/model-status/*` 脱敏接口。
- 只展示当前用户可用模型。
- 展示状态标签、速度标签、样本状态和更新时间。
- 不展示渠道、错误码、状态码、request_id 和精确请求量。

这一阶段让用户能自行判断“现在用哪个模型更稳”，同时不暴露平台内部细节。

### 阶段三：分组和渠道下钻增强

目标：

- 模型详情按分组展示。
- 错误按渠道排行。
- 错误按状态码和错误码排行。
- 最近失败样本支持跳转到日志详情。
- 区分用户最终失败和中间渠道失败。

### 阶段四：和渠道告警联动

目标：

- 在模型可用性页面显示“该异常是否已触发渠道告警”。
- 从模型详情跳转到渠道告警规则。
- 对恢复状态做展示，但仍不做定时探活。

### 阶段五：高级观测能力

可选：

- P95 / P99 延迟。
- 按请求路径聚合。
- 按客户端类型聚合。
- 按 token 分组聚合。
- OpenTelemetry / Prometheus 导出。
- 大数据量下增加独立聚合表或 ClickHouse 查询优化。

## 10. 风险与注意事项

### 10.1 真实请求样本偏差

真实用户请求只能反映“有人用过的模型”。没有请求的模型不能判定不可用。

处理方式：

- 样本不足显示为未知。
- 不做红色异常。
- 页面文案明确“基于真实请求统计”。

### 10.2 重试会影响错误率口径

用户请求可能经过多个渠道重试。

建议：

- 模型可用性使用最终结果，表示用户感知可用性。
- 渠道下钻使用错误日志，表示渠道尝试失败。
- 页面上明确区分这两个口径。

### 10.3 非模型故障不要算作模型不可用

例如：

- 用户额度不足。
- 请求体过大。
- 敏感词拦截。
- token 被禁用。
- 参数校验失败。

这些应该归入“本地拒绝 / 用户侧错误”，不要污染模型可用性。

### 10.4 不展示敏感内容

该模块包含管理员页和用户页，两边都不应该默认展示 prompt 和完整请求体。

管理员页允许展示：

- request_id。
- upstream_request_id。
- 状态码。
- 错误码。
- 错误类型。
- 渠道 ID / 名称。
- 模型名。
- 分组。

用户页只允许展示：

- 模型名。
- 状态标签。
- 速度标签。
- 样本状态。
- 数据窗口。
- 更新时间。

所有页面都不展示：

- prompt。
- API Key。
- token key。
- 原始上游鉴权信息。
- 完整未脱敏错误堆栈。

用户页额外不展示：

- request_id。
- upstream_request_id。
- 状态码。
- 错误码。
- 渠道 ID。
- 渠道名称。
- 内部重试链路。
- 精确请求数。
- 精确错误数。

### 10.5 性能风险

`logs` 可能很大，查询错误样本必须：

- 默认限制时间范围。
- 必须分页。
- 最大查询范围受限。
- 错误分布只查最近窗口。
- 聚合优先用 `perf_metrics`，不要直接全表扫 `logs`。

## 11. 验收标准

管理员页面验收：

- 管理端能进入“模型可用性”页面。
- 页面明确说明“基于真实用户请求，不做定时探活”。
- 能看到最近 24 小时每个模型的请求数、成功率、错误率、平均延迟。
- 样本不足模型显示“样本不足”，不是显示异常。
- 点击模型能看到分组维度表现。
- 能看到最近错误样本和状态码分布。
- 普通用户不能访问管理端接口。
- 接口不返回 prompt、完整请求体、API Key、token key。
- 不影响用户请求、计费、渠道选择、重试流程。

用户页面验收：

- 用户能进入“模型状态”页面。
- 页面只展示当前用户可用模型。
- 页面展示模型状态、速度、样本状态和更新时间。
- 样本不足显示为“样本不足”，不显示为“不可用”。
- 用户接口不返回渠道、状态码、错误码、request_id、upstream_request_id。
- 用户接口不返回精确请求数和精确错误数。
- 普通用户无法访问管理员模型可用性接口。
- 用户页面不出现内部排障信息。

## 12. 建议默认决定

- 第一阶段先做管理端只读页面。
- 第二阶段做用户脱敏状态页面。
- 两个页面都不做定时测试。
- 两个页面都复用 `perf_metrics` 和 `logs`。
- 第一阶段不改 `perf_metrics` 表结构。
- 第一阶段不做自动告警，只做观测页面。
- 样本不足不判定异常。
- 以用户最终结果作为模型可用性口径。
- 以错误日志作为渠道排障口径。
- 管理员接口和用户接口分开实现，不共用同一个返回结构。
- 用户页面默认不展示精确成功率和请求数，只展示状态标签和区间提示。
- 后续再和渠道告警、OpenTelemetry、P95/P99 指标联动。
