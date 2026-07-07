package operation_setting

import (
	"encoding/json"
	"fmt"
	"net/mail"
	"strconv"
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
				return nil, fmt.Errorf("invalid email recipient: %s", maskChannelAlertEmail(email))
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

func ValidateChannelAlertSetting(setting ChannelAlertSetting) error {
	setting = NormalizeChannelAlertSetting(setting)
	recipients, err := ParseChannelAlertRecipients(setting.Recipients)
	if err != nil {
		return err
	}
	if setting.Enabled && len(recipients) == 0 {
		return fmt.Errorf("channel alert recipients are required when channel alerts are enabled")
	}
	if _, err := ParseHTTPStatusCodeRanges(setting.StatusCodes); err != nil {
		return err
	}
	return nil
}

func ValidateChannelAlertOptionPatch(values map[string]string) error {
	if len(values) == 0 {
		return nil
	}
	next := GetChannelAlertSetting()
	touched := false
	for key, value := range values {
		if !strings.HasPrefix(key, "channel_alert_setting.") {
			continue
		}
		touched = true
		configKey := strings.TrimPrefix(key, "channel_alert_setting.")
		if err := applyChannelAlertOption(&next, configKey, value); err != nil {
			return err
		}
	}
	if !touched {
		return nil
	}
	return ValidateChannelAlertSetting(next)
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

func applyChannelAlertOption(setting *ChannelAlertSetting, key string, value string) error {
	switch key {
	case "enabled":
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return err
		}
		setting.Enabled = parsed
	case "recipients":
		if err := parseChannelAlertStringSlice(value, &setting.Recipients); err != nil {
			return err
		}
	case "window_seconds":
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return err
		}
		setting.WindowSeconds = parsed
	case "failure_threshold":
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return err
		}
		setting.FailureThreshold = parsed
	case "cooldown_seconds":
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return err
		}
		setting.CooldownSeconds = parsed
	case "recovery_enabled":
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return err
		}
		setting.RecoveryEnabled = parsed
	case "recovery_cooldown_seconds":
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return err
		}
		setting.RecoveryCooldownSeconds = parsed
	case "status_codes":
		setting.StatusCodes = value
	case "keywords":
		if err := parseChannelAlertStringSlice(value, &setting.Keywords); err != nil {
			return err
		}
	case "include_relay_errors":
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return err
		}
		setting.IncludeRelayErrors = parsed
	case "include_scheduled_tests":
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return err
		}
		setting.IncludeScheduledTests = parsed
	case "include_manual_tests":
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return err
		}
		setting.IncludeManualTests = parsed
	}
	return nil
}

func parseChannelAlertStringSlice(value string, target *[]string) error {
	if strings.TrimSpace(value) == "" {
		*target = []string{}
		return nil
	}
	var values []string
	if err := json.Unmarshal([]byte(value), &values); err != nil {
		return err
	}
	*target = values
	return nil
}

func maskChannelAlertEmail(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return "***"
	}
	name := parts[0]
	if len(name) <= 1 {
		return "***@" + parts[1]
	}
	return name[:1] + "***@" + parts[1]
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
