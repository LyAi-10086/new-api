package operation_setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const (
	ModelAvailabilityDisplaySettingOptionKey = "ModelAvailabilityDisplaySetting"
	maxModelAvailabilityDisplayEntries       = 1000
	maxModelAvailabilityDisplayTextLength    = 128
)

type ModelAvailabilityDisplaySetting struct {
	PublicEnabled bool                                   `json:"public_enabled"`
	Entries       []ModelAvailabilityDisplaySettingEntry `json:"entries"`
}

type ModelAvailabilityDisplaySettingEntry struct {
	Group           string `json:"group"`
	SourceModelName string `json:"source_model_name"`
	PublicModelId   string `json:"public_model_id"`
	DisplayName     string `json:"display_name"`
	Visible         bool   `json:"visible"`
	StatusEnabled   bool   `json:"status_enabled"`
	SortOrder       int    `json:"sort_order"`
}

func DefaultModelAvailabilityDisplaySetting() ModelAvailabilityDisplaySetting {
	return ModelAvailabilityDisplaySetting{
		PublicEnabled: false,
		Entries:       []ModelAvailabilityDisplaySettingEntry{},
	}
}

func GetModelAvailabilityDisplaySetting() ModelAvailabilityDisplaySetting {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[ModelAvailabilityDisplaySettingOptionKey]
	common.OptionMapRWMutex.RUnlock()
	setting, err := ModelAvailabilityDisplaySettingFromJSONString(raw)
	if err != nil {
		return DefaultModelAvailabilityDisplaySetting()
	}
	return setting
}

func ModelAvailabilityDisplaySettingToJSONString(setting ModelAvailabilityDisplaySetting) (string, error) {
	normalized, err := ValidateModelAvailabilityDisplaySetting(setting)
	if err != nil {
		return "", err
	}
	bytes, err := common.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func ModelAvailabilityDisplaySettingFromJSONString(value string) (ModelAvailabilityDisplaySetting, error) {
	if strings.TrimSpace(value) == "" {
		return DefaultModelAvailabilityDisplaySetting(), nil
	}
	setting := DefaultModelAvailabilityDisplaySetting()
	if err := common.UnmarshalJsonStr(value, &setting); err != nil {
		return setting, err
	}
	return ValidateModelAvailabilityDisplaySetting(setting)
}

func ValidateModelAvailabilityDisplaySetting(setting ModelAvailabilityDisplaySetting) (ModelAvailabilityDisplaySetting, error) {
	setting = NormalizeModelAvailabilityDisplaySetting(setting)
	if len(setting.Entries) > maxModelAvailabilityDisplayEntries {
		return setting, fmt.Errorf("用户侧模型状态展示配置最多支持 %d 条", maxModelAvailabilityDisplayEntries)
	}
	seen := make(map[string]struct{}, len(setting.Entries))
	for i, entry := range setting.Entries {
		if entry.Group == "" {
			return setting, fmt.Errorf("第 %d 条展示配置缺少分组", i+1)
		}
		if entry.SourceModelName == "" {
			return setting, fmt.Errorf("第 %d 条展示配置缺少真实模型名", i+1)
		}
		if entry.PublicModelId == "" {
			return setting, fmt.Errorf("第 %d 条展示配置缺少用户侧模型 ID", i+1)
		}
		if entry.DisplayName == "" {
			return setting, fmt.Errorf("第 %d 条展示配置缺少展示名称", i+1)
		}
		// 用户可能同时拥有多个可用分组，因此公开 ID 需要全局唯一，避免用户状态页出现不可区分的重复行。
		key := entry.PublicModelId
		if _, ok := seen[key]; ok {
			return setting, fmt.Errorf("用户侧模型 ID %s 重复，请使用包含分组或业务前缀的唯一 ID", entry.PublicModelId)
		}
		seen[key] = struct{}{}
	}
	return setting, nil
}

func NormalizeModelAvailabilityDisplaySetting(setting ModelAvailabilityDisplaySetting) ModelAvailabilityDisplaySetting {
	if setting.Entries == nil {
		setting.Entries = []ModelAvailabilityDisplaySettingEntry{}
	}
	if len(setting.Entries) > maxModelAvailabilityDisplayEntries {
		setting.Entries = setting.Entries[:maxModelAvailabilityDisplayEntries]
	}
	for i := range setting.Entries {
		entry := &setting.Entries[i]
		entry.Group = limitModelAvailabilityDisplayText(strings.TrimSpace(entry.Group))
		entry.SourceModelName = limitModelAvailabilityDisplayText(strings.TrimSpace(entry.SourceModelName))
		entry.PublicModelId = limitModelAvailabilityDisplayText(strings.TrimSpace(entry.PublicModelId))
		entry.DisplayName = limitModelAvailabilityDisplayText(strings.TrimSpace(entry.DisplayName))
		if entry.PublicModelId == "" {
			entry.PublicModelId = entry.SourceModelName
		}
		if entry.DisplayName == "" {
			entry.DisplayName = entry.PublicModelId
		}
	}
	return setting
}

func limitModelAvailabilityDisplayText(value string) string {
	runes := []rune(value)
	if len(runes) <= maxModelAvailabilityDisplayTextLength {
		return value
	}
	return string(runes[:maxModelAvailabilityDisplayTextLength])
}
