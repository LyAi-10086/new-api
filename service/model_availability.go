package service

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const (
	ModelAvailabilityStatusAvailable    = "available"
	ModelAvailabilityStatusDegraded     = "degraded"
	ModelAvailabilityStatusUnavailable  = "unavailable"
	ModelAvailabilityStatusInsufficient = "insufficient"

	ModelAvailabilitySampleNone   = "none"
	ModelAvailabilitySampleLow    = "low"
	ModelAvailabilitySampleEnough = "enough"
)

const (
	defaultModelAvailabilityHours       = 24
	maxModelAvailabilityHours           = 24 * 30
	modelAvailabilityDefaultMinSample1h = 5
	modelAvailabilityDefaultMinSample   = 20
)

type ModelAvailabilityModelParams struct {
	Hours     int
	Group     string
	Model     string
	Status    string
	MinSample int
}

type ModelAvailabilityErrorParams struct {
	Hours     int
	Model     string
	Group     string
	ChannelId int
}

type ModelAvailabilitySummary struct {
	WindowHours        int     `json:"window_hours"`
	UpdatedAt          int64   `json:"updated_at"`
	TotalModels        int     `json:"total_models"`
	AvailableModels    int     `json:"available_models"`
	DegradedModels     int     `json:"degraded_models"`
	UnavailableModels  int     `json:"unavailable_models"`
	InsufficientModels int     `json:"insufficient_models"`
	RequestCount       int64   `json:"request_count"`
	SuccessCount       int64   `json:"success_count"`
	ErrorCount         int64   `json:"error_count"`
	AvailabilityRate   float64 `json:"availability_rate"`
	AvgLatencyMs       int64   `json:"avg_latency_ms"`
	AvgTtftMs          int64   `json:"avg_ttft_ms"`
}

type ModelAvailabilityModelItem struct {
	ModelName         string  `json:"model_name"`
	Group             string  `json:"group"`
	DisplayName       string  `json:"display_name,omitempty"`
	RequestCount      int64   `json:"request_count"`
	SuccessCount      int64   `json:"success_count"`
	ErrorCount        int64   `json:"error_count"`
	SuccessRate       float64 `json:"success_rate"`
	ErrorRate         float64 `json:"error_rate"`
	AvgLatencyMs      int64   `json:"avg_latency_ms"`
	AvgTtftMs         int64   `json:"avg_ttft_ms"`
	AvgTps            float64 `json:"avg_tps"`
	Status            string  `json:"status"`
	SampleLevel       string  `json:"sample_level"`
	LatencyLevel      string  `json:"latency_level"`
	TtftLevel         string  `json:"ttft_level"`
	AvailabilityLevel string  `json:"availability_level"`
	WindowHours       int     `json:"window_hours"`
	UpdatedAt         int64   `json:"updated_at"`
}

type ModelAvailabilityModelList struct {
	WindowHours int                          `json:"window_hours"`
	UpdatedAt   int64                        `json:"updated_at"`
	Total       int                          `json:"total"`
	Items       []ModelAvailabilityModelItem `json:"items"`
}

type ModelAvailabilityErrorList struct {
	WindowHours int                               `json:"window_hours"`
	Total       int64                             `json:"total"`
	Page        int                               `json:"page"`
	PageSize    int                               `json:"page_size"`
	Items       []model.ModelAvailabilityErrorLog `json:"items"`
}

type UserModelStatusScope struct {
	Groups       []string
	GroupSet     map[string]struct{}
	PublicModels []UserModelStatusPublicModel
	ModelByGroup map[string]map[string]UserModelStatusPublicModel
}

type UserModelStatusPublicModel struct {
	ModelName    string
	DisplayName  string
	DisplayOrder int
}

type UserModelStatusItem struct {
	PublicModelId     string `json:"public_model_id"`
	DisplayName       string `json:"display_name"`
	Status            string `json:"status"`
	SampleLevel       string `json:"sample_level"`
	LatencyLevel      string `json:"latency_level"`
	TtftLevel         string `json:"ttft_level"`
	AvailabilityLevel string `json:"availability_level"`
	WindowHours       int    `json:"window_hours"`
	UpdatedAt         int64  `json:"updated_at"`
}

type UserModelStatusList struct {
	PublicEnabled bool                  `json:"public_enabled"`
	WindowHours   int                   `json:"window_hours"`
	UpdatedAt     int64                 `json:"updated_at"`
	Total         int                   `json:"total"`
	Items         []UserModelStatusItem `json:"items"`
}

type UserModelStatusSummary struct {
	PublicEnabled      bool  `json:"public_enabled"`
	WindowHours        int   `json:"window_hours"`
	UpdatedAt          int64 `json:"updated_at"`
	TotalModels        int   `json:"total_models"`
	AvailableModels    int   `json:"available_models"`
	DegradedModels     int   `json:"degraded_models"`
	UnavailableModels  int   `json:"unavailable_models"`
	InsufficientModels int   `json:"insufficient_models"`
}

func NormalizeModelAvailabilityHours(hours int) int {
	if hours <= 0 {
		return defaultModelAvailabilityHours
	}
	if hours > maxModelAvailabilityHours {
		return maxModelAvailabilityHours
	}
	return hours
}

func DefaultModelAvailabilityMinSample(hours int) int {
	if NormalizeModelAvailabilityHours(hours) <= 1 {
		return modelAvailabilityDefaultMinSample1h
	}
	return modelAvailabilityDefaultMinSample
}

func GetAdminModelAvailabilitySummary(hours int) (ModelAvailabilitySummary, error) {
	params := ModelAvailabilityModelParams{Hours: hours}
	list, err := GetAdminModelAvailabilityModels(params)
	if err != nil {
		return ModelAvailabilitySummary{}, err
	}
	summary := ModelAvailabilitySummary{
		WindowHours: list.WindowHours,
		UpdatedAt:   list.UpdatedAt,
		TotalModels: len(list.Items),
	}
	var totalLatencyMs int64
	var totalTtftMs int64
	var totalTtftCount int64
	for _, item := range list.Items {
		summary.RequestCount += item.RequestCount
		summary.SuccessCount += item.SuccessCount
		summary.ErrorCount += item.ErrorCount
		totalLatencyMs += item.AvgLatencyMs * item.RequestCount
		if item.AvgTtftMs > 0 {
			totalTtftMs += item.AvgTtftMs
			totalTtftCount++
		}
		switch item.Status {
		case ModelAvailabilityStatusAvailable:
			summary.AvailableModels++
		case ModelAvailabilityStatusDegraded:
			summary.DegradedModels++
		case ModelAvailabilityStatusUnavailable:
			summary.UnavailableModels++
		default:
			summary.InsufficientModels++
		}
	}
	if summary.RequestCount > 0 {
		summary.AvailabilityRate = roundRate(float64(summary.SuccessCount) / float64(summary.RequestCount) * 100)
		summary.AvgLatencyMs = totalLatencyMs / summary.RequestCount
	}
	if totalTtftCount > 0 {
		summary.AvgTtftMs = totalTtftMs / totalTtftCount
	}
	return summary, nil
}

func GetAdminModelAvailabilityModels(params ModelAvailabilityModelParams) (ModelAvailabilityModelList, error) {
	hours := NormalizeModelAvailabilityHours(params.Hours)
	minSample := params.MinSample
	if minSample <= 0 {
		minSample = DefaultModelAvailabilityMinSample(hours)
	}
	startTs, endTs := modelAvailabilityWindow(hours)
	rows, err := model.QueryModelAvailabilityMetrics(model.ModelAvailabilityMetricFilter{
		StartTimestamp: startTs,
		EndTimestamp:   endTs,
		Group:          strings.TrimSpace(params.Group),
		Model:          strings.TrimSpace(params.Model),
	})
	if err != nil {
		return ModelAvailabilityModelList{}, err
	}
	modelNames := make([]string, 0, len(rows))
	for _, row := range rows {
		modelNames = append(modelNames, row.SourceModelName)
	}
	metaMap, _ := model.GetModelAvailabilityMetaMap(modelNames)

	items := make([]ModelAvailabilityModelItem, 0, len(rows))
	for _, row := range rows {
		item := modelAvailabilityItemFromMetric(row, hours, minSample)
		if meta, ok := metaMap[row.SourceModelName]; ok {
			item.DisplayName = meta.DisplayName
		}
		if params.Status != "" && item.Status != params.Status {
			continue
		}
		if params.MinSample > 0 && item.RequestCount < int64(params.MinSample) {
			continue
		}
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool {
		left := modelAvailabilityStatusOrder(items[i].Status)
		right := modelAvailabilityStatusOrder(items[j].Status)
		if left != right {
			return left < right
		}
		if items[i].RequestCount != items[j].RequestCount {
			return items[i].RequestCount > items[j].RequestCount
		}
		if items[i].ModelName != items[j].ModelName {
			return items[i].ModelName < items[j].ModelName
		}
		return items[i].Group < items[j].Group
	})
	return ModelAvailabilityModelList{
		WindowHours: hours,
		UpdatedAt:   maxModelAvailabilityUpdatedAt(items),
		Total:       len(items),
		Items:       items,
	}, nil
}

func GetAdminModelAvailabilityErrors(params ModelAvailabilityErrorParams, page int, pageSize int) (ModelAvailabilityErrorList, error) {
	hours := NormalizeModelAvailabilityHours(params.Hours)
	startTs, endTs := modelAvailabilityWindow(hours)
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = common.ItemsPerPage
	}
	if pageSize > 100 {
		pageSize = 100
	}
	items, total, err := model.QueryModelAvailabilityErrorLogs(model.ModelAvailabilityErrorFilter{
		StartTimestamp: startTs,
		EndTimestamp:   endTs,
		Model:          strings.TrimSpace(params.Model),
		Group:          strings.TrimSpace(params.Group),
		ChannelId:      params.ChannelId,
	}, (page-1)*pageSize, pageSize)
	if err != nil {
		return ModelAvailabilityErrorList{}, err
	}
	return ModelAvailabilityErrorList{
		WindowHours: hours,
		Total:       total,
		Page:        page,
		PageSize:    pageSize,
		Items:       items,
	}, nil
}

func UpdateModelAvailabilityDisplaySetting(setting operation_setting.ModelAvailabilityDisplaySetting) (operation_setting.ModelAvailabilityDisplaySetting, error) {
	raw, err := operation_setting.ModelAvailabilityDisplaySettingToJSONString(setting)
	if err != nil {
		return operation_setting.ModelAvailabilityDisplaySetting{}, err
	}
	if err := model.UpdateOption(operation_setting.ModelAvailabilityDisplaySettingOptionKey, raw); err != nil {
		return operation_setting.ModelAvailabilityDisplaySetting{}, err
	}
	return operation_setting.GetModelAvailabilityDisplaySetting(), nil
}

func GetUserModelStatusSummary(scope UserModelStatusScope, hours int) (UserModelStatusSummary, error) {
	list, err := GetUserModelStatusModels(scope, hours)
	if err != nil {
		return UserModelStatusSummary{}, err
	}
	summary := UserModelStatusSummary{
		PublicEnabled: list.PublicEnabled,
		WindowHours:   list.WindowHours,
		UpdatedAt:     list.UpdatedAt,
		TotalModels:   list.Total,
	}
	for _, item := range list.Items {
		switch item.Status {
		case ModelAvailabilityStatusAvailable:
			summary.AvailableModels++
		case ModelAvailabilityStatusDegraded:
			summary.DegradedModels++
		case ModelAvailabilityStatusUnavailable:
			summary.UnavailableModels++
		default:
			summary.InsufficientModels++
		}
	}
	return summary, nil
}

func GetUserModelStatusModels(scope UserModelStatusScope, hours int) (UserModelStatusList, error) {
	hours = NormalizeModelAvailabilityHours(hours)
	setting := operation_setting.GetModelAvailabilityDisplaySetting()
	if !setting.PublicEnabled {
		return UserModelStatusList{PublicEnabled: false, WindowHours: hours, Items: []UserModelStatusItem{}}, nil
	}
	startTs, endTs := modelAvailabilityWindow(hours)
	rows, err := model.QueryModelAvailabilityMetrics(model.ModelAvailabilityMetricFilter{
		StartTimestamp: startTs,
		EndTimestamp:   endTs,
		Groups:         scope.Groups,
	})
	if err != nil {
		return UserModelStatusList{}, err
	}
	minSample := DefaultModelAvailabilityMinSample(hours)
	metricsByGroupModel := make(map[string]model.ModelAvailabilityMetricRow, len(rows))
	metricsByModel := map[string]model.ModelAvailabilityMetricRow{}
	for _, row := range rows {
		metricsByGroupModel[availabilityGroupModelKey(row.SourceGroup, row.SourceModelName)] = row
		current := metricsByModel[row.SourceModelName]
		metricsByModel[row.SourceModelName] = mergeAvailabilityMetricRows(current, row)
	}

	var items []UserModelStatusItem
	if len(setting.Entries) > 0 {
		items = userModelStatusItemsFromDisplaySetting(setting, scope, metricsByGroupModel, hours, minSample)
	} else {
		items = userModelStatusItemsFromAutoScope(scope, metricsByModel, hours, minSample)
	}
	return UserModelStatusList{
		PublicEnabled: true,
		WindowHours:   hours,
		UpdatedAt:     maxUserModelStatusUpdatedAt(items),
		Total:         len(items),
		Items:         items,
	}, nil
}

func userModelStatusItemsFromDisplaySetting(setting operation_setting.ModelAvailabilityDisplaySetting, scope UserModelStatusScope, metrics map[string]model.ModelAvailabilityMetricRow, hours int, minSample int) []UserModelStatusItem {
	type orderedItem struct {
		sortOrder int
		id        string
		item      UserModelStatusItem
	}
	ordered := make([]orderedItem, 0, len(setting.Entries))
	for _, entry := range setting.Entries {
		if !entry.Visible || !entry.StatusEnabled {
			continue
		}
		if _, ok := scope.GroupSet[entry.Group]; !ok {
			continue
		}
		if !scopeAllowsModel(scope, entry.Group, entry.SourceModelName) {
			continue
		}
		metric := metrics[availabilityGroupModelKey(entry.Group, entry.SourceModelName)]
		ordered = append(ordered, orderedItem{
			sortOrder: entry.SortOrder,
			id:        entry.PublicModelId,
			item:      userModelStatusItemFromMetric(metric, entry.PublicModelId, entry.DisplayName, hours, minSample),
		})
	}
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].sortOrder != ordered[j].sortOrder {
			return ordered[i].sortOrder < ordered[j].sortOrder
		}
		return ordered[i].id < ordered[j].id
	})
	items := make([]UserModelStatusItem, 0, len(ordered))
	for _, item := range ordered {
		items = append(items, item.item)
	}
	return items
}

func userModelStatusItemsFromAutoScope(scope UserModelStatusScope, metrics map[string]model.ModelAvailabilityMetricRow, hours int, minSample int) []UserModelStatusItem {
	models := append([]UserModelStatusPublicModel(nil), scope.PublicModels...)
	sort.SliceStable(models, func(i, j int) bool {
		if models[i].DisplayOrder != models[j].DisplayOrder {
			return models[i].DisplayOrder < models[j].DisplayOrder
		}
		return models[i].ModelName < models[j].ModelName
	})
	items := make([]UserModelStatusItem, 0, len(models))
	for _, publicModel := range models {
		displayName := strings.TrimSpace(publicModel.DisplayName)
		if displayName == "" {
			displayName = publicModel.ModelName
		}
		items = append(items, userModelStatusItemFromMetric(metrics[publicModel.ModelName], publicModel.ModelName, displayName, hours, minSample))
	}
	return items
}

func scopeAllowsModel(scope UserModelStatusScope, group string, modelName string) bool {
	models := scope.ModelByGroup[group]
	if len(models) == 0 {
		return false
	}
	_, ok := models[modelName]
	return ok
}

func modelAvailabilityItemFromMetric(row model.ModelAvailabilityMetricRow, hours int, minSample int) ModelAvailabilityModelItem {
	errorCount := row.RequestCount - row.SuccessCount
	if errorCount < 0 {
		errorCount = 0
	}
	successRate := availabilitySuccessRate(row)
	item := ModelAvailabilityModelItem{
		ModelName:    row.SourceModelName,
		Group:        row.SourceGroup,
		RequestCount: row.RequestCount,
		SuccessCount: row.SuccessCount,
		ErrorCount:   errorCount,
		SuccessRate:  successRate,
		ErrorRate:    roundRate(100 - successRate),
		AvgLatencyMs: avgInt(row.TotalLatencyMs, row.RequestCount),
		AvgTtftMs:    avgInt(row.TtftSumMs, row.TtftCount),
		AvgTps:       avgTps(row.OutputTokens, row.GenerationMs),
		WindowHours:  hours,
		UpdatedAt:    row.UpdatedAt,
	}
	item.SampleLevel = sampleLevel(row.RequestCount, minSample)
	item.Status = availabilityStatus(row, minSample)
	item.LatencyLevel = latencyLevel(item.AvgLatencyMs, row.RequestCount, minSample)
	item.TtftLevel = ttftLevel(item.AvgTtftMs, row.TtftCount, row.RequestCount, minSample)
	item.AvailabilityLevel = availabilityLevel(item.Status, successRate)
	return item
}

func userModelStatusItemFromMetric(row model.ModelAvailabilityMetricRow, publicModelId string, displayName string, hours int, minSample int) UserModelStatusItem {
	adminItem := modelAvailabilityItemFromMetric(row, hours, minSample)
	return UserModelStatusItem{
		PublicModelId:     publicModelId,
		DisplayName:       displayName,
		Status:            adminItem.Status,
		SampleLevel:       adminItem.SampleLevel,
		LatencyLevel:      adminItem.LatencyLevel,
		TtftLevel:         adminItem.TtftLevel,
		AvailabilityLevel: adminItem.AvailabilityLevel,
		WindowHours:       hours,
		UpdatedAt:         adminItem.UpdatedAt,
	}
}

func availabilityStatus(row model.ModelAvailabilityMetricRow, minSample int) string {
	if row.RequestCount < int64(minSample) {
		return ModelAvailabilityStatusInsufficient
	}
	rate := availabilitySuccessRate(row)
	if row.SuccessCount == 0 {
		return ModelAvailabilityStatusUnavailable
	}
	if rate < 95 {
		return ModelAvailabilityStatusUnavailable
	}
	if rate < 99 {
		return ModelAvailabilityStatusDegraded
	}
	return ModelAvailabilityStatusAvailable
}

func sampleLevel(requestCount int64, minSample int) string {
	if requestCount == 0 {
		return ModelAvailabilitySampleNone
	}
	if requestCount < int64(minSample) {
		return ModelAvailabilitySampleLow
	}
	return ModelAvailabilitySampleEnough
}

func latencyLevel(avgLatencyMs int64, requestCount int64, minSample int) string {
	if requestCount < int64(minSample) {
		return "unknown"
	}
	if avgLatencyMs <= 0 {
		return "unknown"
	}
	if avgLatencyMs <= 3000 {
		return "fast"
	}
	if avgLatencyMs > 15000 {
		return "slow"
	}
	return "normal"
}

func ttftLevel(avgTtftMs int64, ttftCount int64, requestCount int64, minSample int) string {
	if requestCount < int64(minSample) || ttftCount == 0 {
		return "unknown"
	}
	if avgTtftMs <= 1000 {
		return "fast"
	}
	if avgTtftMs > 8000 {
		return "slow"
	}
	return "normal"
}

func availabilityLevel(status string, successRate float64) string {
	switch status {
	case ModelAvailabilityStatusInsufficient:
		return "unknown"
	case ModelAvailabilityStatusUnavailable:
		return "low"
	case ModelAvailabilityStatusDegraded:
		return "medium"
	default:
		if successRate >= 99 {
			return "high"
		}
		return "medium"
	}
}

func modelAvailabilityWindow(hours int) (int64, int64) {
	hours = NormalizeModelAvailabilityHours(hours)
	endTs := time.Now().Unix()
	return endTs - int64(hours)*3600, endTs
}

func availabilitySuccessRate(row model.ModelAvailabilityMetricRow) float64 {
	if row.RequestCount <= 0 {
		return 0
	}
	return roundRate(float64(row.SuccessCount) / float64(row.RequestCount) * 100)
}

func roundRate(value float64) float64 {
	return math.Round(value*100) / 100
}

func avgInt(sum int64, count int64) int64 {
	if count <= 0 {
		return 0
	}
	return sum / count
}

func avgTps(outputTokens int64, generationMs int64) float64 {
	if outputTokens <= 0 || generationMs <= 0 {
		return 0
	}
	return roundRate(float64(outputTokens) / (float64(generationMs) / 1000.0))
}

func modelAvailabilityStatusOrder(status string) int {
	switch status {
	case ModelAvailabilityStatusUnavailable:
		return 0
	case ModelAvailabilityStatusDegraded:
		return 1
	case ModelAvailabilityStatusAvailable:
		return 2
	default:
		return 3
	}
}

func maxModelAvailabilityUpdatedAt(items []ModelAvailabilityModelItem) int64 {
	var updatedAt int64
	for _, item := range items {
		if item.UpdatedAt > updatedAt {
			updatedAt = item.UpdatedAt
		}
	}
	return updatedAt
}

func maxUserModelStatusUpdatedAt(items []UserModelStatusItem) int64 {
	var updatedAt int64
	for _, item := range items {
		if item.UpdatedAt > updatedAt {
			updatedAt = item.UpdatedAt
		}
	}
	return updatedAt
}

func availabilityGroupModelKey(group string, modelName string) string {
	return group + "\x00" + modelName
}

func mergeAvailabilityMetricRows(left model.ModelAvailabilityMetricRow, right model.ModelAvailabilityMetricRow) model.ModelAvailabilityMetricRow {
	if left.SourceModelName == "" {
		left.SourceModelName = right.SourceModelName
	}
	left.RequestCount += right.RequestCount
	left.SuccessCount += right.SuccessCount
	left.TotalLatencyMs += right.TotalLatencyMs
	left.TtftSumMs += right.TtftSumMs
	left.TtftCount += right.TtftCount
	left.OutputTokens += right.OutputTokens
	left.GenerationMs += right.GenerationMs
	if right.UpdatedAt > left.UpdatedAt {
		left.UpdatedAt = right.UpdatedAt
	}
	return left
}
