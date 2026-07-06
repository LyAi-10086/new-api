package controller

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

type SensitiveSettingsPayload struct {
	CheckSensitiveEnabled         bool                                   `json:"check_sensitive_enabled"`
	CheckSensitiveOnPromptEnabled bool                                   `json:"check_sensitive_on_prompt_enabled"`
	SensitiveWords                string                                 `json:"sensitive_words"`
	ModelScope                    setting.SensitiveCheckModelScopeConfig `json:"model_scope"`
	ViolationPolicy               setting.SensitiveViolationPolicyConfig `json:"violation_policy"`
}

func uniqueSortedStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, item := range values {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	sort.Strings(result)
	return result
}

func uniqueSortedModels(models []string) []string {
	return uniqueSortedStrings(models)
}

func enabledSensitiveGroups() []string {
	groups := ratio_setting.GetGroupRatioCopy()
	groupNames := make([]string, 0, len(groups))
	for groupName := range groups {
		groupNames = append(groupNames, groupName)
	}
	return uniqueSortedStrings(groupNames)
}

func validateSensitiveModelScope(scope setting.SensitiveCheckModelScopeConfig) (setting.SensitiveCheckModelScopeConfig, error) {
	scope = setting.NormalizeSensitiveCheckModelScope(scope)
	enabledModels := uniqueSortedModels(model.GetEnabledModels())
	enabledSet := make(map[string]struct{}, len(enabledModels))
	for _, modelName := range enabledModels {
		enabledSet[modelName] = struct{}{}
	}
	for _, modelName := range scope.Models {
		if _, ok := enabledSet[modelName]; !ok {
			return scope, fmt.Errorf("模型 %s 未启用，无法用于敏感词风控范围", modelName)
		}
	}
	enabledGroups := enabledSensitiveGroups()
	enabledGroupSet := make(map[string]struct{}, len(enabledGroups))
	for _, groupName := range enabledGroups {
		enabledGroupSet[groupName] = struct{}{}
	}
	for _, groupName := range scope.Groups {
		if _, ok := enabledGroupSet[groupName]; !ok {
			return scope, fmt.Errorf("分组 %s 未启用，无法用于敏感词风控范围", groupName)
		}
	}
	return scope, nil
}

func sensitiveSettingsOptionValues(payload SensitiveSettingsPayload) (map[string]string, error) {
	scope, err := validateSensitiveModelScope(payload.ModelScope)
	if err != nil {
		return nil, err
	}
	policy := setting.NormalizeSensitiveViolationPolicy(payload.ViolationPolicy)
	scopeBytes, err := common.Marshal(scope)
	if err != nil {
		return nil, err
	}
	policyBytes, err := common.Marshal(policy)
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"CheckSensitiveEnabled":         strconv.FormatBool(payload.CheckSensitiveEnabled),
		"CheckSensitiveOnPromptEnabled": strconv.FormatBool(payload.CheckSensitiveOnPromptEnabled),
		"SensitiveWords":                payload.SensitiveWords,
		"SensitiveCheckModelScope":      string(scopeBytes),
		"SensitiveViolationPolicy":      string(policyBytes),
	}, nil
}

func GetSensitiveSettings(c *gin.Context) {
	common.ApiSuccess(c, SensitiveSettingsPayload{
		CheckSensitiveEnabled:         setting.CheckSensitiveEnabled,
		CheckSensitiveOnPromptEnabled: setting.CheckSensitiveOnPromptEnabled,
		SensitiveWords:                setting.SensitiveWordsToString(),
		ModelScope:                    setting.NormalizeSensitiveCheckModelScope(setting.SensitiveCheckModelScope),
		ViolationPolicy:               setting.NormalizeSensitiveViolationPolicy(setting.SensitiveViolationPolicy),
	})
}

func UpdateSensitiveSettings(c *gin.Context) {
	var payload SensitiveSettingsPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	values, err := sensitiveSettingsOptionValues(payload)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOptionsBulk(values); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func GetSensitiveEnabledModels(c *gin.Context) {
	common.ApiSuccess(c, uniqueSortedModels(model.GetEnabledModels()))
}

func GetSensitiveEnabledGroups(c *gin.Context) {
	common.ApiSuccess(c, enabledSensitiveGroups())
}

func sensitiveViolationFilterFromQuery(c *gin.Context) model.SensitiveViolationFilter {
	parseInt := func(key string) int {
		value, _ := strconv.Atoi(strings.TrimSpace(c.Query(key)))
		return value
	}
	parseInt64 := func(key string) int64 {
		value, _ := strconv.ParseInt(strings.TrimSpace(c.Query(key)), 10, 64)
		return value
	}
	return model.SensitiveViolationFilter{
		UserId:    parseInt("user_id"),
		TokenId:   parseInt("token_id"),
		ModelName: strings.TrimSpace(c.Query("model_name")),
		GroupName: strings.TrimSpace(c.Query("group_name")),
		StartTime: parseInt64("start_time"),
		EndTime:   parseInt64("end_time"),
	}
}

func GetSensitiveViolations(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	violations, total, err := model.ListSensitiveViolations(
		sensitiveViolationFilterFromQuery(c),
		pageInfo.GetStartIdx(),
		pageInfo.GetPageSize(),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(violations)
	common.ApiSuccess(c, pageInfo)
}

func GetSensitiveViolation(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的违规记录 ID")
		return
	}
	violation, err := model.GetSensitiveViolationById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, violation)
}
