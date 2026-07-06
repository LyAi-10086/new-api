# 渠道而外设置说明

该配置用于设置一些额外的渠道参数，可以通过 JSON 对象进行配置。主要包含以下两个设置项：

1. force_format
    - 用于标识是否对数据进行强制格式化为 OpenAI 格式
    - 类型为布尔值，设置为 true 时启用强制格式化

2. proxy
    - 用于配置网络代理
    - 类型为字符串，填写代理地址（例如 socks5 协议的代理地址）

3. thinking_to_content
   - 用于标识是否将思考内容`reasoning_content`转换为`<think>`标签拼接到内容中返回
   - 类型为布尔值，设置为 true 时启用思考内容转换

--------------------------------------------------------------

## JSON 格式示例

以下是一个示例配置，启用强制格式化并设置了代理地址：

```json
{
    "force_format": true,
   "thinking_to_content": true,
    "proxy": "socks5://xxxxxxx"
}
```

--------------------------------------------------------------

通过调整上述 JSON 配置中的值，可以灵活控制渠道的额外行为，比如是否进行格式化以及使用特定的网络代理。

---

# 功能规划附录

# 请求头与客户端统一改写调查

## 结论

当前仓库已经具备渠道级的请求体参数改写和请求头改写能力，核心字段是渠道表里的 `param_override` 与 `header_override`。它们适合把某个渠道的上游请求改成固定客户端形态，例如固定 `User-Agent`、覆盖鉴权头、传递或重写下游请求头、给 Anthropic beta 等头部做归一化。

现有能力更偏“按渠道配置”，不是全局统一策略。也就是说，想让所有请求伪装成同一个客户端，需要给所有相关渠道批量配置相同的覆盖规则，或者后续新增一个全局模板层。

## 如何开启

在渠道配置里填写：

- `header_override`：覆盖发往上游的 HTTP 请求头。
- `param_override`：覆盖或操作发往上游的 JSON 请求体，也能通过操作模式动态设置请求头。

简单固定请求头示例：

```json
{
  "User-Agent": "OpenAI/Python 1.0.0",
  "X-Custom-Client": "new-api"
}
```

使用下游请求头作为上游请求头示例：

```json
{
  "User-Agent": "{client_header:User-Agent}",
  "X-Request-Client": "{client_header:X-Client-Name}"
}
```

使用 `param_override` 操作动态设置请求头示例：

```json
{
  "operations": [
    {
      "mode": "set_header",
      "path": "User-Agent",
      "value": "OpenAI/Python 1.0.0"
    }
  ]
}
```

## 关键代码位置

- `model/channel.go`
  - `Channel.ParamOverride`、`Channel.HeaderOverride` 持久化渠道级配置。
  - `GetParamOverride()`、`GetHeaderOverride()` 把 JSON 字符串解析成 map。
- `controller/channel.go`
  - 编辑渠道标签时支持 `param_override`、`header_override`。
  - 保存前只做 JSON 合法性校验。
  - 修改这两个敏感字段需要 `ChannelSensitiveWrite` 权限。
- `middleware/distributor.go`
  - 选中渠道后在 `SetupContextForSelectedChannel()` 中把覆盖配置写进请求上下文。
- `relay/common/relay_info.go`
  - `RelayInfo` 保存 `ParamOverride`、`HeadersOverride`、运行时 `RuntimeHeadersOverride`。
- `relay/common/override.go`
  - `ApplyParamOverrideWithRelayInfo()` 负责应用参数覆盖。
  - 操作模式支持 `set_header`、`delete_header`、`copy_header`、`move_header`、`pass_headers`。
  - 动态请求头会同步到 `RuntimeHeadersOverride`。
- `relay/channel/api_request.go`
  - 发起上游 HTTP/WebSocket 请求前，在 `SetupRequestHeader` 后应用 header override，所以覆盖规则优先级高于适配器默认头。
- `controller/channel-test.go`
  - 渠道测试路径也会应用参数覆盖，能提前暴露配置错误。

## 请求链路

1. 请求进入后，分发中间件选择渠道。
2. `SetupContextForSelectedChannel()` 读取渠道配置里的 `param_override` 和 `header_override`。
3. `RelayInfo.InitChannelMeta()` 从上下文拿到覆盖配置。
4. 各 relay handler 在请求体转换后执行 `ApplyParamOverrideWithRelayInfo()`。
5. 如果 `param_override` 里操作了请求头，会生成运行时 header override。
6. `relay/channel/api_request.go` 组装上游请求头，并在适配器默认头之后应用最终覆盖。

## 现有能力边界

- `header_override` 是静态渠道配置，适合固定上游客户端标识。
- `{client_header:<name>}` 可以把下游请求头透传到上游，但只能作为完整值使用。
- `param_override` 操作模式可以按请求体内容、请求头上下文做条件处理，能力更强。
- WebSocket 路径也会应用 header override。
- 请求头覆盖会跳过不安全透传规则，避免直接透传 hop-by-hop 等风险头。

## 当前缺陷

- 没有全局统一客户端模板。多渠道需要重复配置，后续维护容易漏。
- 配置入口偏底层 JSON，对普通管理员不友好，容易写错大小写或占位符。
- 目前只做 JSON 格式校验，无法在保存时完整模拟某个请求下的最终头部。
- `header_override` 和 `param_override` 都是渠道粒度，不能直接按用户分组、模型范围、令牌分组统一套模板。
- 若用 `{client_header:User-Agent}`，上游会继承下游客户端标识，不适合“全部伪装成固定客户端”的场景。

## 优化建议

低风险 MVP：

1. 新增“请求客户端模板”文档或预设，不改请求链路。
2. 在渠道编辑页的“请求头覆盖”区域提供官方客户端预设按钮。
3. 第一版只提供 `Codex CLI` 和 `Claude Code` 两个按钮，不加入站点自定义客户端名。
4. 模板本质仍写入 `header_override`，不新增表结构。
5. 增加一个“预览最终请求头”按钮，用当前渠道配置和示例请求展示结果。

后续增强：

1. 增加全局默认 header override，渠道配置可覆盖全局默认。
2. 增加按模型、分组、渠道类型选择模板。
3. 把常见请求头统一改写和参数同步做成可视化表单，底层仍生成现有 JSON。

## 已实现的第一版预设

渠道编辑页已经在“请求头覆盖”区域提供两个预设按钮：

- `Codex CLI`
- `Claude Code`

点击按钮会把对应预设合并进当前 `header_override` JSON。若当前 JSON 已有其他请求头，保留原有键并覆盖同名预设键。

`Codex CLI` 预设：

```json
{
  "User-Agent": "codex-cli/0.142.5",
  "X-Client-Name": "codex-cli",
  "X-Stainless-Lang": "node",
  "X-Stainless-Package-Version": "0.142.5",
  "X-Stainless-Runtime": "node",
  "X-Stainless-OS": "Windows",
  "X-Stainless-Arch": "x64"
}
```

`Claude Code` 预设：

```json
{
  "User-Agent": "claude-code/2.1.197",
  "X-Client-Name": "claude-code",
  "anthropic-version": "2023-06-01",
  "X-Stainless-Lang": "js",
  "X-Stainless-Package-Version": "2.1.197",
  "X-Stainless-Runtime": "node",
  "X-Stainless-OS": "Windows",
  "X-Stainless-Arch": "x64"
}
```

## 建议先用的配置方式

如果只是把所有请求统一成某个固定客户端，建议先在每个目标渠道配置相同的 `header_override`：

```json
{
  "User-Agent": "codex-cli/0.142.5",
  "X-Client-Name": "codex-cli",
  "X-Stainless-Lang": "node",
  "X-Stainless-Package-Version": "0.142.5"
}
```

如果还要根据下游请求动态传递部分标识，再考虑 `param_override` 的 `pass_headers` 或 `{client_header:<name>}`。

---

# 邀请充值返佣 v1 规划与实现说明

## 1. 背景

当前系统已有邀请注册奖励：

- 用户表已有 `aff_code`、`aff_count`、`aff_quota`、`aff_history`、`inviter_id`。
- 用户注册时可绑定邀请人。
- 旧逻辑在邀请注册时发放固定奖励。
- 用户可通过 `POST /api/user/aff_transfer` 把邀请额度转入余额。

本次 v1 的目标是把邀请关系延伸到“被邀请人充值成功后按比例给邀请人返佣”，但不重做整套邀请系统，尽量减少后续合并上游时的冲突。

## 2. v1 产品边界

### 已纳入 v1

- 管理员可在系统设置里配置充值返佣策略。
- 功能默认关闭，开启后才生成充值返佣。
- 只做一级返佣：A 邀请 B，B 充值只给 A 返佣。
- 支持 7 天内、30 天内两档归因窗口。
- 支持首充和复充不同返佣比例。
- 支持结算期，充值成功后先生成待结算记录，到期后进入可转余额。
- 支持手动触发到期结算。
- 支持管理员查看返佣记录。
- 用户钱包邀请卡片展示待结算、可用、累计返佣。
- 转余额沿用现有邀请额度转余额入口。

### v1 暂不纳入

- 等级体系。
- 多级分销。
- 现金提现。
- 退款自动冲正。
- 订阅订单返佣。
- 管理员手动作废返佣记录。

这些能力后续可以在独立账本基础上继续加，不需要修改本次 v1 的核心数据结构。

## 3. 默认策略

配置项为 `AffiliateRechargePolicy`，存入 `options` 表。

默认值：

- `enabled`: `false`
- `attribution_days`: `30`
- `settlement_days`: `7`
- `include_manual_topup`: `true`
- `min_topup_money`: `0`
- `first_topup_rate_within_7_days`: `0.10`
- `repeat_topup_rate_within_7_days`: `0.05`
- `first_topup_rate_within_30_days`: `0.06`
- `repeat_topup_rate_within_30_days`: `0.03`

比例会在保存时限制在 `0-1`，结算期不能小于 0，归因期小于等于 0 时回退到 30 天。

## 4. 数据设计

新增表：`affiliate_commissions`

核心字段：

| 字段 | 说明 |
| --- | --- |
| `reward_key` | 幂等键，格式 `topup:<topup_id>:inviter:<inviter_id>` |
| `inviter_id` | 邀请人 ID |
| `invitee_id` | 被邀请人 ID |
| `topup_id` | 充值订单 ID |
| `trade_no` | 充值订单号 |
| `payment_provider` | 支付网关 |
| `payment_method` | 支付方式 |
| `topup_money` | 实付金额 |
| `topup_quota` | 实际到账额度 |
| `invite_age_days` | 被邀请人注册到充值成功的天数 |
| `is_first_topup` | 是否首充 |
| `base_rate` | 基础返佣比例 |
| `final_rate` | 最终返佣比例，v1 等于基础比例 |
| `reward_quota` | 返佣额度 |
| `transferred_quota` | 已转余额额度 |
| `status` | `pending` / `available` / `transferred` / `voided` |
| `eligible_at` | 可结算时间 |
| `settled_at` | 实际结算时间 |
| `transferred_at` | 转余额时间 |
| `void_reason` | 作废原因，预留 |

`reward_key` 带唯一索引，支付回调重复、补单重试或服务重启重放时不会重复返佣。

## 5. 后端接入点

### 配置

- `setting/affiliate.go`
  - 定义 `AffiliateRechargePolicy`。
  - 提供 JSON 序列化和反序列化。
  - 统一做配置归一化。
- `model/option.go`
  - 把 `AffiliateRechargePolicy` 纳入 `options` 加载和更新。

### 账本

- `model/affiliate_commission.go`
  - 创建返佣记录。
  - 查询返佣列表和详情。
  - 汇总用户待结算、可用、已转、累计返佣。
  - 结算到期返佣。
  - 转余额时同步标记明细账本的已转额度。

### 充值完成路径

已接入充值成功路径：

- Stripe：`model.Recharge`
- Creem：`model.RechargeCreem`
- Waffo：`model.RechargeWaffo`
- Waffo Pancake：`model.RechargeWaffoPancake`
- 管理员补单：`model.ManualCompleteTopUp`
- 易支付：`model.CompleteEpayTopUp`

易支付原先在控制器里分散完成订单、加额度。本次收敛为 `CompleteEpayTopUp`，在一个事务里完成订单状态、用户额度和返佣记录，减少账务不一致。

## 6. 接口

管理员接口，均需要 `RootAuth`：

- `GET /api/affiliate/settings`
- `PUT /api/affiliate/settings`
- `GET /api/affiliate/commissions`
- `GET /api/affiliate/commissions/:id`
- `POST /api/affiliate/settle`

用户接口，均只能访问当前登录用户自己的返佣数据：

- `GET /api/user/affiliate/summary`
- `GET /api/user/affiliate/commissions`
- 旧转余额入口：`POST /api/user/aff_transfer`

## 7. 前端

管理员侧：

- 新增系统设置分区：`/system-settings/billing/affiliate-commission`
- 页面包括：
  - 返佣总开关。
  - 归因期和结算期。
  - 最低充值金额。
  - 是否包含管理员补单。
  - 7 天内首充/复充比例。
  - 30 天内首充/复充比例。
  - 返佣记录列表和筛选。
  - 手动结算按钮。

用户侧：

- 钱包邀请卡片增加待结算、可用、累计返佣展示。
- 可用额度展示同时兼容旧 `aff_quota` 和新返佣汇总，避免旧邀请注册奖励丢失。
- 转余额弹窗继续复用旧入口。

## 8. 健全性检查

- 默认关闭，升级后不影响旧邀请注册奖励。
- 返佣只读取数据库里的 `inviter_id`，不信任前端或回调参数。
- 邀请人不存在、禁用或自邀请时不返佣。
- 返佣基数使用充值成功后的最终到账额度，不重新相信前端金额。
- 同一充值订单和邀请人使用唯一 `reward_key` 防重复。
- 到期结算使用 `status = pending` 条件更新，重复结算不会重复入账。
- 转余额时先锁定用户，再扣减 `aff_quota`，并同步返佣账本的 `transferred_quota`。
- 普通用户接口强制覆盖 `inviter_id` 为当前用户 ID，不能查看他人返佣。
- 管理员设置、列表、结算接口均走 `RootAuth`。

## 9. 后续建议

后续增强建议按优先级拆模块做：

1. 退款和争议订单冲正：增加自动或手动作废流程。
2. 返佣详情弹窗：展示订单和用户关联信息。
3. 运营统计：按时间、渠道、邀请人统计返佣效果。
4. 等级体系：在 v1 稳定后再加，避免第一版规则过复杂。
