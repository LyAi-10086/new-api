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
