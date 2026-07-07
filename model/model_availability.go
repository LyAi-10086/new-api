package model

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type ModelAvailabilityMetricFilter struct {
	StartTimestamp int64
	EndTimestamp   int64
	Groups         []string
	Group          string
	Model          string
}

type ModelAvailabilityMetricRow struct {
	SourceModelName string `json:"source_model_name" gorm:"column:source_model_name"`
	SourceGroup     string `json:"source_group" gorm:"column:source_group"`
	RequestCount    int64  `json:"request_count" gorm:"column:request_count"`
	SuccessCount    int64  `json:"success_count" gorm:"column:success_count"`
	TotalLatencyMs  int64  `json:"total_latency_ms" gorm:"column:total_latency_ms"`
	TtftSumMs       int64  `json:"ttft_sum_ms" gorm:"column:ttft_sum_ms"`
	TtftCount       int64  `json:"ttft_count" gorm:"column:ttft_count"`
	OutputTokens    int64  `json:"output_tokens" gorm:"column:output_tokens"`
	GenerationMs    int64  `json:"generation_ms" gorm:"column:generation_ms"`
	UpdatedAt       int64  `json:"updated_at" gorm:"column:updated_at"`
}

type ModelAvailabilityErrorFilter struct {
	StartTimestamp int64
	EndTimestamp   int64
	Model          string
	Group          string
	ChannelId      int
}

type ModelAvailabilityErrorLog struct {
	CreatedAt         int64  `json:"created_at"`
	ModelName         string `json:"model_name"`
	Group             string `json:"group"`
	ChannelId         int    `json:"channel_id"`
	ChannelName       string `json:"channel_name"`
	StatusCode        int    `json:"status_code"`
	ErrorCode         string `json:"error_code"`
	ErrorType         string `json:"error_type"`
	RequestPath       string `json:"request_path"`
	RequestId         string `json:"request_id"`
	UpstreamRequestId string `json:"upstream_request_id"`
	Content           string `json:"content"`
}

func QueryModelAvailabilityMetrics(filter ModelAvailabilityMetricFilter) ([]ModelAvailabilityMetricRow, error) {
	rows := []ModelAvailabilityMetricRow{}
	if filter.Groups != nil && len(filter.Groups) == 0 {
		return rows, nil
	}
	query := DB.Model(&PerfMetric{}).
		Select("model_name AS source_model_name, "+commonGroupCol+" AS source_group, COALESCE(SUM(request_count), 0) AS request_count, COALESCE(SUM(success_count), 0) AS success_count, COALESCE(SUM(total_latency_ms), 0) AS total_latency_ms, COALESCE(SUM(ttft_sum_ms), 0) AS ttft_sum_ms, COALESCE(SUM(ttft_count), 0) AS ttft_count, COALESCE(SUM(output_tokens), 0) AS output_tokens, COALESCE(SUM(generation_ms), 0) AS generation_ms, COALESCE(MAX(bucket_ts), 0) AS updated_at").
		Where("bucket_ts >= ? AND bucket_ts <= ?", filter.StartTimestamp, filter.EndTimestamp)
	if filter.Group != "" {
		query = query.Where(commonGroupCol+" = ?", filter.Group)
	} else if filter.Groups != nil {
		query = query.Where(commonGroupCol+" IN ?", filter.Groups)
	}
	if filter.Model != "" {
		query = query.Where("model_name = ?", filter.Model)
	}
	err := query.
		Group("model_name, " + commonGroupCol).
		Having("SUM(request_count) > 0").
		Order("request_count DESC").
		Scan(&rows).Error
	return rows, err
}

func QueryModelAvailabilityErrorLogs(filter ModelAvailabilityErrorFilter, offset int, limit int) ([]ModelAvailabilityErrorLog, int64, error) {
	if limit <= 0 {
		limit = common.ItemsPerPage
	}
	query := LOG_DB.Model(&Log{}).Where("type = ?", LogTypeError)
	if filter.StartTimestamp > 0 {
		query = query.Where("created_at >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp > 0 {
		query = query.Where("created_at <= ?", filter.EndTimestamp)
	}
	if filter.Model != "" {
		query = query.Where("model_name = ?", filter.Model)
	}
	if filter.Group != "" {
		query = query.Where(logGroupCol+" = ?", filter.Group)
	}
	if filter.ChannelId > 0 {
		query = query.Where("channel_id = ?", filter.ChannelId)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	order := "created_at DESC, id DESC"
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		order = clickHouseLogOrder("")
	}
	var logs []*Log
	if err := query.Order(order).Limit(limit).Offset(offset).Find(&logs).Error; err != nil {
		return nil, 0, err
	}
	items := make([]ModelAvailabilityErrorLog, 0, len(logs))
	channelIds := make([]int, 0, len(logs))
	seenChannelIds := map[int]struct{}{}
	for _, log := range logs {
		item := modelAvailabilityErrorLogFromLog(log)
		items = append(items, item)
		if item.ChannelId > 0 {
			if _, ok := seenChannelIds[item.ChannelId]; !ok {
				seenChannelIds[item.ChannelId] = struct{}{}
				channelIds = append(channelIds, item.ChannelId)
			}
		}
	}
	if len(channelIds) == 0 {
		return items, total, nil
	}
	channelNames, err := getModelAvailabilityChannelNames(channelIds)
	if err != nil {
		return items, total, err
	}
	for i := range items {
		items[i].ChannelName = channelNames[items[i].ChannelId]
	}
	return items, total, nil
}

func getModelAvailabilityChannelNames(ids []int) (map[int]string, error) {
	channels := []struct {
		Id   int
		Name string
	}{}
	if err := DB.Model(&Channel{}).Select("id, name").Where("id IN ?", ids).Find(&channels).Error; err != nil {
		return nil, err
	}
	names := make(map[int]string, len(channels))
	for _, channel := range channels {
		names[channel.Id] = channel.Name
	}
	return names, nil
}

func modelAvailabilityErrorLogFromLog(log *Log) ModelAvailabilityErrorLog {
	item := ModelAvailabilityErrorLog{
		CreatedAt:         log.CreatedAt,
		ModelName:         log.ModelName,
		Group:             log.Group,
		ChannelId:         log.ChannelId,
		RequestId:         log.RequestId,
		UpstreamRequestId: log.UpstreamRequestId,
		Content:           log.Content,
	}
	other := map[string]interface{}{}
	if strings.TrimSpace(log.Other) != "" {
		_ = common.UnmarshalJsonStr(log.Other, &other)
	}
	item.StatusCode = modelAvailabilityMapInt(other, "status_code")
	item.ErrorCode = modelAvailabilityMapString(other, "error_code")
	item.ErrorType = modelAvailabilityMapString(other, "error_type")
	item.RequestPath = modelAvailabilityMapString(other, "request_path")
	return item
}

func modelAvailabilityMapString(values map[string]interface{}, key string) string {
	value, ok := values[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	default:
		return strings.TrimSpace(common.GetJsonString(typed))
	}
}

func modelAvailabilityMapInt(values map[string]interface{}, key string) int {
	value, ok := values[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case string:
		parsed, _ := strconv.Atoi(strings.TrimSpace(typed))
		return parsed
	default:
		return 0
	}
}
