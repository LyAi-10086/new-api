package controller

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

type TimePricingSettingsPayload = setting.TimePricingSettingConfig

func enabledTimePricingGroups() []string {
	groups := ratio_setting.GetGroupRatioCopy()
	groupNames := make([]string, 0, len(groups))
	for groupName := range groups {
		groupNames = append(groupNames, groupName)
	}
	return uniqueSortedStrings(groupNames)
}

func validateTimePricingScopeOptions(config setting.TimePricingSettingConfig) error {
	enabledModels := uniqueSortedModels(model.GetEnabledModels())
	enabledModelSet := make(map[string]struct{}, len(enabledModels))
	for _, modelName := range enabledModels {
		enabledModelSet[modelName] = struct{}{}
	}
	enabledGroups := enabledTimePricingGroups()
	enabledGroupSet := make(map[string]struct{}, len(enabledGroups))
	for _, groupName := range enabledGroups {
		enabledGroupSet[groupName] = struct{}{}
	}
	for _, rule := range config.Rules {
		for _, modelName := range rule.Models {
			if _, ok := enabledModelSet[strings.TrimSpace(modelName)]; !ok {
				return fmt.Errorf("模型 %s 未启用，无法用于分时段计费规则", modelName)
			}
		}
		for _, groupName := range rule.Groups {
			if _, ok := enabledGroupSet[strings.TrimSpace(groupName)]; !ok {
				return fmt.Errorf("分组 %s 未启用，无法用于分时段计费规则", groupName)
			}
		}
	}
	return nil
}

func GetTimePricingSettings(c *gin.Context) {
	common.ApiSuccess(c, setting.GetTimePricingSetting())
}

func UpdateTimePricingSettings(c *gin.Context) {
	var payload TimePricingSettingsPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	normalized, err := setting.ValidateTimePricingSetting(payload)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := validateTimePricingScopeOptions(normalized); err != nil {
		common.ApiError(c, err)
		return
	}
	bytes, err := common.Marshal(normalized)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption(setting.TimePricingSettingOptionKey, string(bytes)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, setting.GetTimePricingSetting())
}

func GetTimePricingEnabledModels(c *gin.Context) {
	common.ApiSuccess(c, uniqueSortedModels(model.GetEnabledModels()))
}

func GetTimePricingEnabledGroups(c *gin.Context) {
	common.ApiSuccess(c, enabledTimePricingGroups())
}

func GetTimePricingPromotions(c *gin.Context) {
	group := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
	if group == "" {
		userGroup, err := model.GetUserGroup(c.GetInt("id"), false)
		if err == nil {
			group = userGroup
		}
	}
	modelNames := model.GetGroupEnabledModels(group)
	sort.Strings(modelNames)
	common.ApiSuccess(c, setting.ListVisibleTimePricingPromotions(group, modelNames, time.Now()))
}
