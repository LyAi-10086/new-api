package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

type ChannelAlertSetting struct {
	Enabled                 bool     `json:"enabled"`
	Recipients              []string `json:"recipients"`
	WindowSeconds           int      `json:"window_seconds"`
	FailureThreshold        int      `json:"failure_threshold"`
	CooldownSeconds         int      `json:"cooldown_seconds"`
	RecoveryEnabled         bool     `json:"recovery_enabled"`
	RecoveryCooldownSeconds int      `json:"recovery_cooldown_seconds"`
	StatusCodes             string   `json:"status_codes"`
	Keywords                []string `json:"keywords"`
	IncludeRelayErrors      bool     `json:"include_relay_errors"`
	IncludeScheduledTests   bool     `json:"include_scheduled_tests"`
	IncludeManualTests      bool     `json:"include_manual_tests"`
}

var channelAlertSetting = ChannelAlertSetting{
	Enabled:                 false,
	Recipients:              []string{},
	WindowSeconds:           60,
	FailureThreshold:        3,
	CooldownSeconds:         1800,
	RecoveryEnabled:         true,
	RecoveryCooldownSeconds: 1800,
	StatusCodes:             "401,403,429,500-599",
	Keywords:                []string{},
	IncludeRelayErrors:      true,
	IncludeScheduledTests:   true,
	IncludeManualTests:      false,
}

func init() {
	config.GlobalConfig.Register("channel_alert_setting", &channelAlertSetting)
}

func GetChannelAlertSetting() ChannelAlertSetting {
	return NormalizeChannelAlertSetting(channelAlertSetting)
}

func NormalizeChannelAlertSetting(setting ChannelAlertSetting) ChannelAlertSetting {
	if setting.WindowSeconds <= 0 {
		setting.WindowSeconds = 60
	}
	if setting.WindowSeconds > 86400 {
		setting.WindowSeconds = 86400
	}
	if setting.FailureThreshold <= 0 {
		setting.FailureThreshold = 1
	}
	if setting.FailureThreshold > 10000 {
		setting.FailureThreshold = 10000
	}
	if setting.CooldownSeconds < 0 {
		setting.CooldownSeconds = 0
	}
	if setting.CooldownSeconds > 604800 {
		setting.CooldownSeconds = 604800
	}
	if setting.RecoveryCooldownSeconds < 0 {
		setting.RecoveryCooldownSeconds = 0
	}
	if setting.RecoveryCooldownSeconds > 604800 {
		setting.RecoveryCooldownSeconds = 604800
	}
	setting.StatusCodes = strings.TrimSpace(setting.StatusCodes)
	setting.Recipients = normalizeStringSlice(setting.Recipients)
	setting.Keywords = normalizeStringSlice(setting.Keywords)
	return setting
}

func normalizeStringSlice(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, value)
	}
	return result
}
