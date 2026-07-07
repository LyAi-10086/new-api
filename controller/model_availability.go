package controller

import (
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func GetModelAvailabilitySummary(c *gin.Context) {
	summary, err := service.GetAdminModelAvailabilitySummary(parseModelAvailabilityHours(c))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func GetModelAvailabilityModels(c *gin.Context) {
	minSample, _ := strconv.Atoi(c.Query("min_sample"))
	data, err := service.GetAdminModelAvailabilityModels(service.ModelAvailabilityModelParams{
		Hours:     parseModelAvailabilityHours(c),
		Group:     strings.TrimSpace(c.Query("group")),
		Model:     strings.TrimSpace(c.Query("model")),
		Status:    strings.TrimSpace(firstNonEmpty(c.Query("status"), c.Query("health_status"))),
		MinSample: minSample,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}

func GetModelAvailabilityErrors(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	data, err := service.GetAdminModelAvailabilityErrors(service.ModelAvailabilityErrorParams{
		Hours:     parseModelAvailabilityHours(c),
		Model:     strings.TrimSpace(c.Query("model")),
		Group:     strings.TrimSpace(c.Query("group")),
		ChannelId: common.String2Int(c.Query("channel_id")),
	}, pageInfo.GetPage(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}

func GetModelAvailabilityDisplaySettings(c *gin.Context) {
	common.ApiSuccess(c, operation_setting.GetModelAvailabilityDisplaySetting())
}

func UpdateModelAvailabilityDisplaySettings(c *gin.Context) {
	var req operation_setting.ModelAvailabilityDisplaySetting
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	setting, err := service.UpdateModelAvailabilityDisplaySetting(req)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, setting)
}

func GetModelStatusSummary(c *gin.Context) {
	scope, err := buildUserModelStatusScope(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary, err := service.GetUserModelStatusSummary(scope, parseModelAvailabilityHours(c))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func GetModelStatusModels(c *gin.Context) {
	scope, err := buildUserModelStatusScope(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	data, err := service.GetUserModelStatusModels(scope, parseModelAvailabilityHours(c))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, data)
}

func parseModelAvailabilityHours(c *gin.Context) int {
	hours, _ := strconv.Atoi(c.Query("hours"))
	if hours == 0 {
		hours, _ = strconv.Atoi(c.Query("window_hours"))
	}
	return service.NormalizeModelAvailabilityHours(hours)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			return value
		}
	}
	return ""
}

func buildUserModelStatusScope(c *gin.Context) (service.UserModelStatusScope, error) {
	userGroup, err := model.GetUserGroup(c.GetInt("id"), false)
	if err != nil {
		return service.UserModelStatusScope{}, err
	}
	usableGroups := service.GetUserUsableGroups(userGroup)
	groupSet := make(map[string]struct{}, len(usableGroups))
	groups := make([]string, 0, len(usableGroups))
	for group := range usableGroups {
		group = strings.TrimSpace(group)
		if group == "" {
			continue
		}
		groupSet[group] = struct{}{}
		groups = append(groups, group)
	}
	sort.Strings(groups)

	pricing := filterPricingByUsableGroups(model.GetPricing(), usableGroups)
	modelByName := map[string]service.UserModelStatusPublicModel{}
	modelByGroup := map[string]map[string]service.UserModelStatusPublicModel{}
	for _, item := range pricing {
		displayName := strings.TrimSpace(item.DisplayName)
		if displayName == "" {
			displayName = item.ModelName
		}
		publicModel := service.UserModelStatusPublicModel{
			ModelName:    item.ModelName,
			DisplayName:  displayName,
			DisplayOrder: item.DisplayOrder,
		}
		if current, ok := modelByName[item.ModelName]; !ok || publicModel.DisplayOrder < current.DisplayOrder {
			modelByName[item.ModelName] = publicModel
		}
		for _, group := range item.EnableGroup {
			if group == "all" {
				for _, usableGroup := range groups {
					addUserModelStatusGroupModel(modelByGroup, usableGroup, publicModel)
				}
				continue
			}
			if _, ok := groupSet[group]; ok {
				addUserModelStatusGroupModel(modelByGroup, group, publicModel)
			}
		}
	}
	publicModels := make([]service.UserModelStatusPublicModel, 0, len(modelByName))
	for _, item := range modelByName {
		publicModels = append(publicModels, item)
	}
	return service.UserModelStatusScope{
		Groups:       groups,
		GroupSet:     groupSet,
		PublicModels: publicModels,
		ModelByGroup: modelByGroup,
	}, nil
}

func addUserModelStatusGroupModel(modelByGroup map[string]map[string]service.UserModelStatusPublicModel, group string, item service.UserModelStatusPublicModel) {
	if modelByGroup[group] == nil {
		modelByGroup[group] = map[string]service.UserModelStatusPublicModel{}
	}
	modelByGroup[group][item.ModelName] = item
}
