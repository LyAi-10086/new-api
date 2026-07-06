package service

import (
	"errors"
	"fmt"
	"html"
	"net/mail"
	"regexp"
	"strings"
	"sync/atomic"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

const (
	ChannelAlertSourceRelay         = "relay"
	ChannelAlertSourceScheduledTest = "scheduled_test"
	ChannelAlertSourceManualTest    = "manual_test"
	channelAlertPreviewLimit        = 600
	channelAlertRetentionSeconds    = 30 * 86400
	channelAlertCleanupInterval     = 3600
)

var (
	channelAlertSecretPattern = regexp.MustCompile(`(?i)(authorization\s*:\s*bearer\s+|api[_-]?key\s*[:=]\s*|secret\s*[:=]\s*|token\s*[:=]\s*|password\s*[:=]\s*|access[_-]?key\s*[:=]\s*|refresh[_-]?token\s*[:=]\s*)["']?[^"'\s,;]+`)
	channelAlertKeyPattern    = regexp.MustCompile(`(?i)\b(sk-[a-z0-9_-]{12,}|ghp_[a-z0-9_]{12,}|github_pat_[a-z0-9_]{12,}|akia[0-9a-z]{12,}|ai[a-z0-9_-]{24,})\b`)
	lastChannelAlertCleanupAt int64
)

type ChannelAlertFailureParams struct {
	ChannelId    int
	ChannelName  string
	ChannelType  int
	Source       string
	StatusCode   int
	ErrorCode    string
	ErrorType    string
	ErrorPreview string
	ModelName    string
	GroupName    string
	RequestPath  string
	RequestId    string
}

type ChannelAlertRecoveryParams struct {
	ChannelId   int
	ChannelName string
	ChannelType int
	Source      string
}

func ObserveChannelFailureAsync(params ChannelAlertFailureParams) {
	gopool.Go(func() {
		ObserveChannelFailure(params)
	})
}

func ObserveChannelFailure(params ChannelAlertFailureParams) {
	policy := operation_setting.GetChannelAlertSetting()
	if !policy.Enabled || params.ChannelId <= 0 || !isChannelAlertSourceEnabled(policy, params.Source) {
		return
	}
	recipients, err := ParseChannelAlertRecipients(policy.Recipients)
	if err != nil || len(recipients) == 0 {
		common.SysError(fmt.Sprintf("channel alert skipped: invalid recipients, channel_id=%d err=%v", params.ChannelId, err))
		return
	}
	channel, alertEnabled := getChannelAlertChannel(params.ChannelId)
	if channel == nil || !alertEnabled {
		return
	}

	params.ChannelName = fallbackString(params.ChannelName, channel.Name)
	params.ChannelType = fallbackInt(params.ChannelType, channel.Type)
	params.ErrorPreview = BuildSafeChannelAlertPreview(params.ErrorPreview)
	ruleKey, ok := matchChannelAlertRule(policy, params)
	if !ok {
		return
	}
	now := common.GetTimestamp()
	cleanupExpiredChannelAlertEvents(now)
	if shouldSkipChannelAlertEvent(params.ChannelId, ruleKey, policy.CooldownSeconds, now) {
		return
	}

	event := &model.ChannelAlertEvent{
		ChannelId:    params.ChannelId,
		ChannelName:  params.ChannelName,
		ChannelType:  params.ChannelType,
		Source:       params.Source,
		RuleKey:      ruleKey,
		StatusCode:   params.StatusCode,
		ErrorCode:    params.ErrorCode,
		ErrorType:    params.ErrorType,
		ModelName:    params.ModelName,
		GroupName:    params.GroupName,
		RequestPath:  params.RequestPath,
		RequestId:    params.RequestId,
		ErrorPreview: params.ErrorPreview,
	}
	if err := model.CreateChannelAlertEvent(event); err != nil {
		common.SysError(fmt.Sprintf("failed to record channel alert event: channel_id=%d rule_key=%s err=%v", params.ChannelId, ruleKey, err))
		return
	}

	since := now - int64(policy.WindowSeconds)
	count, err := model.CountRecentChannelAlertEvents(params.ChannelId, ruleKey, since)
	if err != nil {
		common.SysError(fmt.Sprintf("failed to count channel alert events: channel_id=%d rule_key=%s err=%v", params.ChannelId, ruleKey, err))
		return
	}
	if int(count) < policy.FailureThreshold {
		_ = updateChannelAlertState(params.ChannelId, ruleKey, false, 0, 0, event.Id, int(count))
		return
	}

	if !shouldSendChannelAlert(params.ChannelId, ruleKey, policy.CooldownSeconds, event.Id, int(count)) {
		return
	}
	sendChannelFailureAlert(policy, recipients, params, event.Id, int(count))
}

func ObserveChannelRecovery(params ChannelAlertRecoveryParams) {
	policy := operation_setting.GetChannelAlertSetting()
	if !policy.Enabled || !policy.RecoveryEnabled || params.ChannelId <= 0 {
		return
	}
	recipients, err := ParseChannelAlertRecipients(policy.Recipients)
	if err != nil || len(recipients) == 0 {
		return
	}
	channel, alertEnabled := getChannelAlertChannel(params.ChannelId)
	if channel == nil || !alertEnabled {
		return
	}
	states, err := model.ListActiveChannelAlertStates(params.ChannelId)
	if err != nil || len(states) == 0 {
		return
	}

	now := common.GetTimestamp()
	shouldSend := false
	rules := make([]string, 0, len(states))
	for _, state := range states {
		if policy.RecoveryCooldownSeconds == 0 || now-state.LastRecoveryAt >= int64(policy.RecoveryCooldownSeconds) {
			shouldSend = true
		}
		rules = append(rules, state.RuleKey)
	}
	if err := model.DB.Model(&model.ChannelAlertState{}).
		Where("channel_id = ? AND active = ?", params.ChannelId, true).
		Updates(map[string]any{
			"active":           false,
			"last_recovery_at": now,
			"updated_at":       now,
		}).Error; err != nil {
		common.SysError(fmt.Sprintf("failed to update channel alert recovery state: channel_id=%d err=%v", params.ChannelId, err))
		return
	}
	if shouldSend {
		params.ChannelName = fallbackString(params.ChannelName, channel.Name)
		params.ChannelType = fallbackInt(params.ChannelType, channel.Type)
		sendChannelRecoveryAlert(policy, recipients, params, rules)
	}
}

func SendChannelAlertTest() error {
	policy := operation_setting.GetChannelAlertSetting()
	recipients, err := ParseChannelAlertRecipients(policy.Recipients)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return fmt.Errorf("channel alert recipients are empty")
	}
	params := ChannelAlertFailureParams{
		ChannelId:    0,
		ChannelName:  "Test Channel",
		Source:       "test",
		StatusCode:   500,
		ErrorCode:    "test_channel_alert",
		ErrorType:    "test",
		ErrorPreview: "This is a channel alert test email.",
		ModelName:    "test-model",
		GroupName:    "default",
		RequestPath:  "/api/channel-alert/test",
		RequestId:    "test",
	}
	return sendChannelAlertEmail(recipients, "New API 渠道告警测试", buildChannelFailureAlertContent(params, 0, 1, policy.WindowSeconds))
}

func ParseChannelAlertRecipients(values []string) ([]string, error) {
	seen := make(map[string]struct{}, len(values))
	recipients := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.FieldsFunc(value, func(r rune) bool {
			return r == ',' || r == '，' || r == ';' || r == '\n' || r == '\r'
		}) {
			email := strings.TrimSpace(part)
			if email == "" {
				continue
			}
			if strings.ContainsAny(email, "\r\n") {
				return nil, fmt.Errorf("invalid email recipient")
			}
			addr, err := mail.ParseAddress(email)
			if err != nil || addr.Address == "" || addr.Name != "" {
				return nil, fmt.Errorf("invalid email recipient: %s", common.MaskEmail(email))
			}
			normalized := strings.ToLower(addr.Address)
			if _, ok := seen[normalized]; ok {
				continue
			}
			seen[normalized] = struct{}{}
			recipients = append(recipients, addr.Address)
			if len(recipients) > 20 {
				return nil, fmt.Errorf("channel alert recipients exceed 20")
			}
		}
	}
	return recipients, nil
}

func getChannelAlertChannel(channelId int) (*model.Channel, bool) {
	channel, err := model.GetChannelById(channelId, false)
	if err != nil {
		return nil, false
	}
	settings := dto.ChannelOtherSettings{}
	if strings.TrimSpace(channel.OtherSettings) != "" {
		// 告警链路只需要读取单渠道开关，不能调用会自动保存整行的 GetOtherSettings。
		if err := common.UnmarshalJsonStr(channel.OtherSettings, &settings); err != nil {
			common.SysError(fmt.Sprintf("failed to parse channel alert settings: channel_id=%d err=%v", channelId, err))
			return channel, false
		}
	}
	return channel, settings.ChannelAlertEnabled
}

func BuildSafeChannelAlertPreview(content string) string {
	content = strings.TrimSpace(common.MaskSensitiveInfo(content))
	content = channelAlertSecretPattern.ReplaceAllString(content, "${1}***")
	content = channelAlertKeyPattern.ReplaceAllString(content, "***")
	runes := []rune(content)
	if len(runes) > channelAlertPreviewLimit {
		content = string(runes[:channelAlertPreviewLimit]) + "... [truncated]"
	}
	return content
}

func cleanupExpiredChannelAlertEvents(now int64) {
	last := atomic.LoadInt64(&lastChannelAlertCleanupAt)
	if now-last < channelAlertCleanupInterval {
		return
	}
	if !atomic.CompareAndSwapInt64(&lastChannelAlertCleanupAt, last, now) {
		return
	}
	cutoff := now - channelAlertRetentionSeconds
	if err := model.DeleteExpiredChannelAlertEvents(cutoff); err != nil {
		common.SysError(fmt.Sprintf("failed to cleanup channel alert events: err=%v", err))
	}
}

func shouldSkipChannelAlertEvent(channelId int, ruleKey string, cooldownSeconds int, now int64) bool {
	if cooldownSeconds <= 0 {
		return false
	}
	state, err := model.GetChannelAlertState(channelId, ruleKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false
	}
	if err != nil {
		common.SysError(fmt.Sprintf("failed to read channel alert state: channel_id=%d rule_key=%s err=%v", channelId, ruleKey, err))
		return false
	}
	return state.Active && state.LastAlertAt > 0 && now-state.LastAlertAt < int64(cooldownSeconds)
}

func matchChannelAlertRule(policy operation_setting.ChannelAlertSetting, params ChannelAlertFailureParams) (string, bool) {
	if params.StatusCode >= 100 && params.StatusCode <= 599 {
		ranges, err := operation_setting.ParseHTTPStatusCodeRanges(policy.StatusCodes)
		if err == nil {
			for _, r := range ranges {
				if params.StatusCode >= r.Start && params.StatusCode <= r.End {
					return fmt.Sprintf("status:%d", params.StatusCode), true
				}
			}
		}
	}

	if len(policy.Keywords) > 0 {
		ok, words := AcSearch(strings.ToLower(params.ErrorPreview), policy.Keywords, true)
		if ok && len(words) > 0 {
			return "keyword:" + normalizeRuleKeyPart(words[0]), true
		}
	}

	if strings.HasPrefix(params.ErrorCode, "channel:") {
		return "error_code:" + normalizeRuleKeyPart(params.ErrorCode), true
	}
	return "", false
}

func shouldSendChannelAlert(channelId int, ruleKey string, cooldownSeconds int, eventId int, windowCount int) bool {
	now := common.GetTimestamp()
	send := false
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		state, err := model.FirstOrCreateChannelAlertState(tx, channelId, ruleKey)
		if err != nil {
			return err
		}
		if cooldownSeconds == 0 || state.LastAlertAt == 0 || now-state.LastAlertAt >= int64(cooldownSeconds) {
			send = true
			state.LastAlertAt = now
			state.Active = true
			state.LastEventId = eventId
			state.WindowCount = windowCount
		} else {
			state.WindowCount = windowCount
			if state.Active {
				state.LastEventId = eventId
			}
		}
		return model.UpdateChannelAlertState(tx, state)
	})
	if err != nil {
		common.SysError(fmt.Sprintf("failed to update channel alert state: channel_id=%d rule_key=%s err=%v", channelId, ruleKey, err))
		return false
	}
	return send
}

func updateChannelAlertState(channelId int, ruleKey string, active bool, lastAlertAt int64, lastRecoveryAt int64, eventId int, windowCount int) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		state, err := model.FirstOrCreateChannelAlertState(tx, channelId, ruleKey)
		if err != nil {
			return err
		}
		state.Active = active || state.Active
		if lastAlertAt > 0 {
			state.LastAlertAt = lastAlertAt
		}
		if lastRecoveryAt > 0 {
			state.LastRecoveryAt = lastRecoveryAt
		}
		state.LastEventId = eventId
		state.WindowCount = windowCount
		return model.UpdateChannelAlertState(tx, state)
	})
}

func sendChannelFailureAlert(policy operation_setting.ChannelAlertSetting, recipients []string, params ChannelAlertFailureParams, eventId int, windowCount int) {
	subject := fmt.Sprintf("New API 渠道异常告警：%s（#%d）", params.ChannelName, params.ChannelId)
	content := buildChannelFailureAlertContent(params, eventId, windowCount, policy.WindowSeconds)
	if err := sendChannelAlertEmail(recipients, subject, content); err != nil {
		common.SysError(fmt.Sprintf("failed to send channel alert email: event_id=%d channel_id=%d err=%v", eventId, params.ChannelId, err))
		return
	}
	if bytes, err := common.Marshal(recipients); err == nil {
		_ = model.MarkChannelAlertEventSent(eventId, string(bytes))
	}
	common.SysLog(fmt.Sprintf("channel alert sent: event_id=%d channel_id=%d rule_source=%s recipients=%s", eventId, params.ChannelId, params.Source, maskRecipients(recipients)))
}

func sendChannelRecoveryAlert(policy operation_setting.ChannelAlertSetting, recipients []string, params ChannelAlertRecoveryParams, rules []string) {
	subject := fmt.Sprintf("New API 渠道恢复通知：%s（#%d）", params.ChannelName, params.ChannelId)
	content := buildChannelRecoveryAlertContent(params, rules, policy.WindowSeconds)
	if err := sendChannelAlertEmail(recipients, subject, content); err != nil {
		common.SysError(fmt.Sprintf("failed to send channel recovery email: channel_id=%d err=%v", params.ChannelId, err))
		return
	}
	common.SysLog(fmt.Sprintf("channel recovery alert sent: channel_id=%d recipients=%s", params.ChannelId, maskRecipients(recipients)))
}

func sendChannelAlertEmail(recipients []string, subject string, content string) error {
	var firstErr error
	for _, recipient := range recipients {
		if err := common.SendEmail(subject, recipient, content); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			common.SysError(fmt.Sprintf("failed to send channel alert email to %s: %v", common.MaskEmail(recipient), err))
		}
	}
	return firstErr
}

func buildChannelFailureAlertContent(params ChannelAlertFailureParams, eventId int, windowCount int, windowSeconds int) string {
	link := strings.TrimRight(system_setting.ServerAddress, "/")
	if link != "" {
		link += "/channels"
	}
	return fmt.Sprintf(
		`<p>渠道在最近 %d 秒内达到异常阈值，请及时检查。</p><table border="1" cellpadding="6" cellspacing="0"><tr><td>告警记录</td><td>%d</td></tr><tr><td>渠道</td><td>%s（#%d）</td></tr><tr><td>来源</td><td>%s</td></tr><tr><td>模型/分组</td><td>%s / %s</td></tr><tr><td>状态码</td><td>%d</td></tr><tr><td>错误码</td><td>%s</td></tr><tr><td>窗口命中</td><td>%d</td></tr><tr><td>请求路径</td><td>%s</td></tr><tr><td>请求 ID</td><td>%s</td></tr><tr><td>错误预览</td><td><pre>%s</pre></td></tr></table>%s`,
		windowSeconds,
		eventId,
		escapeAlert(params.ChannelName),
		params.ChannelId,
		escapeAlert(params.Source),
		escapeAlert(params.ModelName),
		escapeAlert(params.GroupName),
		params.StatusCode,
		escapeAlert(params.ErrorCode),
		windowCount,
		escapeAlert(params.RequestPath),
		escapeAlert(params.RequestId),
		escapeAlert(params.ErrorPreview),
		channelAlertLinkHTML(link),
	)
}

func buildChannelRecoveryAlertContent(params ChannelAlertRecoveryParams, rules []string, windowSeconds int) string {
	link := strings.TrimRight(system_setting.ServerAddress, "/")
	if link != "" {
		link += "/channels"
	}
	return fmt.Sprintf(
		`<p>此前异常的渠道已恢复启用。</p><table border="1" cellpadding="6" cellspacing="0"><tr><td>渠道</td><td>%s（#%d）</td></tr><tr><td>来源</td><td>%s</td></tr><tr><td>异常规则</td><td>%s</td></tr><tr><td>统计窗口</td><td>%d 秒</td></tr></table>%s`,
		escapeAlert(params.ChannelName),
		params.ChannelId,
		escapeAlert(params.Source),
		escapeAlert(strings.Join(rules, ", ")),
		windowSeconds,
		channelAlertLinkHTML(link),
	)
}

func channelAlertLinkHTML(link string) string {
	if link == "" {
		return ""
	}
	escaped := escapeAlert(link)
	return fmt.Sprintf(`<p><a href="%s">打开渠道管理</a></p>`, escaped)
}

func isChannelAlertSourceEnabled(policy operation_setting.ChannelAlertSetting, source string) bool {
	switch source {
	case ChannelAlertSourceRelay:
		return policy.IncludeRelayErrors
	case ChannelAlertSourceScheduledTest:
		return policy.IncludeScheduledTests
	case ChannelAlertSourceManualTest:
		return policy.IncludeManualTests
	default:
		return false
	}
}

func normalizeRuleKeyPart(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.Map(func(r rune) rune {
		if r < 32 || r == ':' {
			return '_'
		}
		return r
	}, value)
	if len(value) > 150 {
		value = value[:150]
	}
	return value
}

func fallbackString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func fallbackInt(value int, fallback int) int {
	if value == 0 {
		return fallback
	}
	return value
}

func maskRecipients(recipients []string) string {
	masked := make([]string, 0, len(recipients))
	for _, recipient := range recipients {
		masked = append(masked, common.MaskEmail(recipient))
	}
	return strings.Join(masked, ";")
}

func escapeAlert(value string) string {
	return html.EscapeString(value)
}
