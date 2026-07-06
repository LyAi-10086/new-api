package setting

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

var CheckSensitiveEnabled = true
var CheckSensitiveOnPromptEnabled = true

const (
	SensitiveCheckModelScopeAll     = "all"
	SensitiveCheckModelScopeInclude = "include"
	SensitiveCheckModelScopeExclude = "exclude"
)

type SensitiveCheckModelScopeConfig struct {
	Mode      string   `json:"mode"`
	Models    []string `json:"models"`
	GroupMode string   `json:"group_mode"`
	Groups    []string `json:"groups"`
}

type SensitiveViolationPolicyConfig struct {
	UserEnabled    bool `json:"user_enabled"`
	UserThreshold  int  `json:"user_threshold"`
	TokenEnabled   bool `json:"token_enabled"`
	TokenThreshold int  `json:"token_threshold"`
}

var SensitiveCheckModelScope = DefaultSensitiveCheckModelScope()
var SensitiveViolationPolicy = DefaultSensitiveViolationPolicy()

//var CheckSensitiveOnCompletionEnabled = true

// StopOnSensitiveEnabled 如果检测到敏感词，是否立刻停止生成，否则替换敏感词
var StopOnSensitiveEnabled = true

// StreamCacheQueueLength 流模式缓存队列长度，0表示无缓存
var StreamCacheQueueLength = 0

// SensitiveWords 敏感词
// var SensitiveWords []string
var SensitiveWords = []string{
	"test_sensitive",
}

func SensitiveWordsToString() string {
	return strings.Join(SensitiveWords, "\n")
}

func SensitiveWordsFromString(s string) {
	SensitiveWords = []string{}
	sw := strings.Split(s, "\n")
	for _, w := range sw {
		w = strings.TrimSpace(w)
		if w != "" {
			SensitiveWords = append(SensitiveWords, w)
		}
	}
}

func ShouldCheckPromptSensitive() bool {
	return CheckSensitiveEnabled && CheckSensitiveOnPromptEnabled
}

func DefaultSensitiveCheckModelScope() SensitiveCheckModelScopeConfig {
	return SensitiveCheckModelScopeConfig{
		Mode:      SensitiveCheckModelScopeAll,
		Models:    []string{},
		GroupMode: SensitiveCheckModelScopeAll,
		Groups:    []string{},
	}
}

func DefaultSensitiveViolationPolicy() SensitiveViolationPolicyConfig {
	return SensitiveViolationPolicyConfig{
		UserEnabled:    false,
		UserThreshold:  0,
		TokenEnabled:   false,
		TokenThreshold: 0,
	}
}

func normalizeSensitiveScopeMode(mode string) string {
	switch mode {
	case SensitiveCheckModelScopeAll, SensitiveCheckModelScopeInclude, SensitiveCheckModelScopeExclude:
		return mode
	default:
		return SensitiveCheckModelScopeAll
	}
}

func normalizeSensitiveScopeItems(items []string) []string {
	normalized := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		normalized = append(normalized, item)
		seen[item] = struct{}{}
	}
	return normalized
}

func NormalizeSensitiveCheckModelScope(config SensitiveCheckModelScopeConfig) SensitiveCheckModelScopeConfig {
	config.Mode = normalizeSensitiveScopeMode(config.Mode)
	config.GroupMode = normalizeSensitiveScopeMode(config.GroupMode)
	config.Models = normalizeSensitiveScopeItems(config.Models)
	config.Groups = normalizeSensitiveScopeItems(config.Groups)
	return config
}

func NormalizeSensitiveViolationPolicy(config SensitiveViolationPolicyConfig) SensitiveViolationPolicyConfig {
	if config.UserThreshold <= 0 {
		config.UserEnabled = false
		config.UserThreshold = 0
	}
	if config.TokenThreshold <= 0 {
		config.TokenEnabled = false
		config.TokenThreshold = 0
	}
	return config
}

func SensitiveCheckModelScopeToJSONString() string {
	bytes, err := common.Marshal(NormalizeSensitiveCheckModelScope(SensitiveCheckModelScope))
	if err != nil {
		bytes, _ = common.Marshal(DefaultSensitiveCheckModelScope())
	}
	return string(bytes)
}

func SensitiveViolationPolicyToJSONString() string {
	bytes, err := common.Marshal(NormalizeSensitiveViolationPolicy(SensitiveViolationPolicy))
	if err != nil {
		bytes, _ = common.Marshal(DefaultSensitiveViolationPolicy())
	}
	return string(bytes)
}

func UpdateSensitiveCheckModelScopeByJSONString(value string) error {
	config := DefaultSensitiveCheckModelScope()
	if strings.TrimSpace(value) != "" {
		if err := common.Unmarshal([]byte(value), &config); err != nil {
			return err
		}
	}
	SensitiveCheckModelScope = NormalizeSensitiveCheckModelScope(config)
	return nil
}

func UpdateSensitiveViolationPolicyByJSONString(value string) error {
	config := DefaultSensitiveViolationPolicy()
	if strings.TrimSpace(value) != "" {
		if err := common.Unmarshal([]byte(value), &config); err != nil {
			return err
		}
	}
	SensitiveViolationPolicy = NormalizeSensitiveViolationPolicy(config)
	return nil
}

func sensitiveScopeContainsItem(value string, items []string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func ShouldCheckPromptSensitiveForModel(originModelName string) bool {
	// 兼容旧调用方：真实请求链路需要传入最终生效分组，请使用 ShouldCheckPromptSensitiveForScope。
	return ShouldCheckPromptSensitiveForScope(originModelName, "")
}

func sensitiveScopeMatches(mode string, value string, items []string) bool {
	switch mode {
	case SensitiveCheckModelScopeInclude:
		return sensitiveScopeContainsItem(value, items)
	case SensitiveCheckModelScopeExclude:
		return !sensitiveScopeContainsItem(value, items)
	default:
		return true
	}
}

func ShouldCheckPromptSensitiveForScope(originModelName string, usingGroup string) bool {
	if !ShouldCheckPromptSensitive() {
		return false
	}
	scope := NormalizeSensitiveCheckModelScope(SensitiveCheckModelScope)
	// 敏感词是在请求进入模型映射和渠道选择前执行的，因此必须按用户原始请求模型判断。
	// 这样 include/exclude 的配置不会被后续上游模型名映射影响。
	modelMatched := sensitiveScopeMatches(scope.Mode, originModelName, scope.Models)
	if !modelMatched {
		return false
	}
	// 分组使用本次请求最终生效的 usingGroup。auto 分组会在前置选渠道时落到实际分组，
	// 按该分组判断可以和计费、模型广场展示保持一致。
	return sensitiveScopeMatches(scope.GroupMode, usingGroup, scope.Groups)
}

//func ShouldCheckCompletionSensitive() bool {
//	return CheckSensitiveEnabled && CheckSensitiveOnCompletionEnabled
//}

const AffiliateRechargePolicyOptionKey = "AffiliateRechargePolicy"

type AffiliateRechargePolicyConfig struct {
	Enabled                     bool    `json:"enabled"`
	AttributionDays             int     `json:"attribution_days"`
	SettlementDays              int     `json:"settlement_days"`
	IncludeManualTopup          bool    `json:"include_manual_topup"`
	MinTopupMoney               float64 `json:"min_topup_money"`
	FirstTopupRateWithin7Days   float64 `json:"first_topup_rate_within_7_days"`
	RepeatTopupRateWithin7Days  float64 `json:"repeat_topup_rate_within_7_days"`
	FirstTopupRateWithin30Days  float64 `json:"first_topup_rate_within_30_days"`
	RepeatTopupRateWithin30Days float64 `json:"repeat_topup_rate_within_30_days"`
	FirstTopupRateAfter30Days   float64 `json:"first_topup_rate_after_30_days"`
	RepeatTopupRateAfter30Days  float64 `json:"repeat_topup_rate_after_30_days"`
}

var AffiliateRechargePolicy = DefaultAffiliateRechargePolicy()

func DefaultAffiliateRechargePolicy() AffiliateRechargePolicyConfig {
	return AffiliateRechargePolicyConfig{
		Enabled:                     false,
		AttributionDays:             30,
		SettlementDays:              7,
		IncludeManualTopup:          true,
		MinTopupMoney:               0,
		FirstTopupRateWithin7Days:   0.10,
		RepeatTopupRateWithin7Days:  0.05,
		FirstTopupRateWithin30Days:  0.06,
		RepeatTopupRateWithin30Days: 0.03,
		FirstTopupRateAfter30Days:   0,
		RepeatTopupRateAfter30Days:  0,
	}
}

func normalizeAffiliateRate(rate float64) float64 {
	if rate < 0 {
		return 0
	}
	if rate > 1 {
		return 1
	}
	return rate
}

func NormalizeAffiliateRechargePolicy(config AffiliateRechargePolicyConfig) AffiliateRechargePolicyConfig {
	if config.AttributionDays <= 0 {
		config.AttributionDays = 30
	}
	if config.SettlementDays < 0 {
		config.SettlementDays = 0
	}
	if config.MinTopupMoney < 0 {
		config.MinTopupMoney = 0
	}
	config.FirstTopupRateWithin7Days = normalizeAffiliateRate(config.FirstTopupRateWithin7Days)
	config.RepeatTopupRateWithin7Days = normalizeAffiliateRate(config.RepeatTopupRateWithin7Days)
	config.FirstTopupRateWithin30Days = normalizeAffiliateRate(config.FirstTopupRateWithin30Days)
	config.RepeatTopupRateWithin30Days = normalizeAffiliateRate(config.RepeatTopupRateWithin30Days)
	config.FirstTopupRateAfter30Days = normalizeAffiliateRate(config.FirstTopupRateAfter30Days)
	config.RepeatTopupRateAfter30Days = normalizeAffiliateRate(config.RepeatTopupRateAfter30Days)
	return config
}

func AffiliateRechargePolicyToJSONString() string {
	bytes, err := common.Marshal(NormalizeAffiliateRechargePolicy(AffiliateRechargePolicy))
	if err != nil {
		bytes, _ = common.Marshal(DefaultAffiliateRechargePolicy())
	}
	return string(bytes)
}

func UpdateAffiliateRechargePolicyByJSONString(value string) error {
	config := DefaultAffiliateRechargePolicy()
	if strings.TrimSpace(value) != "" {
		if err := common.Unmarshal([]byte(value), &config); err != nil {
			return err
		}
	}
	AffiliateRechargePolicy = NormalizeAffiliateRechargePolicy(config)
	return nil
}
