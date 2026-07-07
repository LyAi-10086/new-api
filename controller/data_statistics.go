package controller

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const (
	adminDataStatisticsDefaultWindowSeconds int64 = 7 * 24 * 60 * 60
	adminDataStatisticsMaxWindowSeconds     int64 = 180 * 24 * 60 * 60
	adminDataStatisticsMaxHourWindowSeconds int64 = 7 * 24 * 60 * 60
)

func parseAdminDataStatisticsFilter(c *gin.Context) (model.AdminDataStatisticsFilter, error) {
	now := common.GetTimestamp()
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	if endTimestamp <= 0 {
		endTimestamp = now
	}
	if startTimestamp <= 0 {
		startTimestamp = endTimestamp - adminDataStatisticsDefaultWindowSeconds
	}
	if startTimestamp > endTimestamp {
		return model.AdminDataStatisticsFilter{}, errors.New("开始时间不能晚于结束时间")
	}
	if endTimestamp-startTimestamp > adminDataStatisticsMaxWindowSeconds {
		return model.AdminDataStatisticsFilter{}, errors.New("统计时间范围不能超过 180 天")
	}

	granularity := strings.TrimSpace(c.Query("granularity"))
	if granularity != "hour" {
		granularity = "day"
	}
	if granularity == "hour" && endTimestamp-startTimestamp > adminDataStatisticsMaxHourWindowSeconds {
		return model.AdminDataStatisticsFilter{}, errors.New("小时粒度统计时间范围不能超过 7 天")
	}

	return model.AdminDataStatisticsFilter{
		StartTimestamp:  startTimestamp,
		EndTimestamp:    endTimestamp,
		Granularity:     granularity,
		ModelName:       strings.TrimSpace(c.Query("model_name")),
		Group:           strings.TrimSpace(c.Query("group")),
		UserId:          common.String2Int(c.Query("user_id")),
		ChannelId:       common.String2Int(c.Query("channel_id")),
		PaymentProvider: strings.TrimSpace(c.Query("payment_provider")),
	}, nil
}

func previousAdminDataStatisticsFilter(filter model.AdminDataStatisticsFilter) model.AdminDataStatisticsFilter {
	windowSeconds := filter.EndTimestamp - filter.StartTimestamp + 1
	if windowSeconds <= 0 {
		windowSeconds = adminDataStatisticsDefaultWindowSeconds
	}
	previous := filter
	previous.EndTimestamp = filter.StartTimestamp - 1
	previous.StartTimestamp = previous.EndTimestamp - windowSeconds + 1
	return previous
}

func adminDataStatisticsSummaryDeltaRate(current float64, previous float64) *float64 {
	if previous == 0 {
		if current == 0 {
			zero := 0.0
			return &zero
		}
		return nil
	}
	rate := (current - previous) / previous
	return &rate
}

func buildAdminDataStatisticsSummaryComparison(current model.AdminDataStatisticsSummary, previous model.AdminDataStatisticsSummary) (model.AdminDataStatisticsSummary, gin.H) {
	delta := model.AdminDataStatisticsSummary{
		ConsumeQuota:       current.ConsumeQuota - previous.ConsumeQuota,
		RequestCount:       current.RequestCount - previous.RequestCount,
		PromptTokens:       current.PromptTokens - previous.PromptTokens,
		CompletionTokens:   current.CompletionTokens - previous.CompletionTokens,
		TotalTokens:        current.TotalTokens - previous.TotalTokens,
		ActiveUsers:        current.ActiveUsers - previous.ActiveUsers,
		ErrorCount:         current.ErrorCount - previous.ErrorCount,
		ErrorRate:          current.ErrorRate - previous.ErrorRate,
		LoginCount:         current.LoginCount - previous.LoginCount,
		LoginUsers:         current.LoginUsers - previous.LoginUsers,
		AvgUseTime:         current.AvgUseTime - previous.AvgUseTime,
		StreamCount:        current.StreamCount - previous.StreamCount,
		StreamRatio:        current.StreamRatio - previous.StreamRatio,
		NegativeQuotaCount: current.NegativeQuotaCount - previous.NegativeQuotaCount,
		NegativeQuotaSum:   current.NegativeQuotaSum - previous.NegativeQuotaSum,
		RegisteredUsers:    current.RegisteredUsers - previous.RegisteredUsers,
		TotalUsers:         current.TotalUsers - previous.TotalUsers,
		TopupMoney:         current.TopupMoney - previous.TopupMoney,
		TopupAmount:        current.TopupAmount - previous.TopupAmount,
		TopupCount:         current.TopupCount - previous.TopupCount,
		CurrentBalance:     current.CurrentBalance - previous.CurrentBalance,
		TotalUsedQuota:     current.TotalUsedQuota - previous.TotalUsedQuota,
		TotalRequestCount:  current.TotalRequestCount - previous.TotalRequestCount,
	}
	deltaRate := gin.H{
		"consume_quota":        adminDataStatisticsSummaryDeltaRate(float64(current.ConsumeQuota), float64(previous.ConsumeQuota)),
		"request_count":        adminDataStatisticsSummaryDeltaRate(float64(current.RequestCount), float64(previous.RequestCount)),
		"prompt_tokens":        adminDataStatisticsSummaryDeltaRate(float64(current.PromptTokens), float64(previous.PromptTokens)),
		"completion_tokens":    adminDataStatisticsSummaryDeltaRate(float64(current.CompletionTokens), float64(previous.CompletionTokens)),
		"total_tokens":         adminDataStatisticsSummaryDeltaRate(float64(current.TotalTokens), float64(previous.TotalTokens)),
		"active_users":         adminDataStatisticsSummaryDeltaRate(float64(current.ActiveUsers), float64(previous.ActiveUsers)),
		"error_count":          adminDataStatisticsSummaryDeltaRate(float64(current.ErrorCount), float64(previous.ErrorCount)),
		"error_rate":           adminDataStatisticsSummaryDeltaRate(current.ErrorRate, previous.ErrorRate),
		"login_count":          adminDataStatisticsSummaryDeltaRate(float64(current.LoginCount), float64(previous.LoginCount)),
		"login_users":          adminDataStatisticsSummaryDeltaRate(float64(current.LoginUsers), float64(previous.LoginUsers)),
		"avg_use_time":         adminDataStatisticsSummaryDeltaRate(current.AvgUseTime, previous.AvgUseTime),
		"stream_count":         adminDataStatisticsSummaryDeltaRate(float64(current.StreamCount), float64(previous.StreamCount)),
		"stream_ratio":         adminDataStatisticsSummaryDeltaRate(current.StreamRatio, previous.StreamRatio),
		"negative_quota_count": adminDataStatisticsSummaryDeltaRate(float64(current.NegativeQuotaCount), float64(previous.NegativeQuotaCount)),
		"negative_quota_sum":   adminDataStatisticsSummaryDeltaRate(float64(current.NegativeQuotaSum), float64(previous.NegativeQuotaSum)),
		"registered_users":     adminDataStatisticsSummaryDeltaRate(float64(current.RegisteredUsers), float64(previous.RegisteredUsers)),
		"total_users":          adminDataStatisticsSummaryDeltaRate(float64(current.TotalUsers), float64(previous.TotalUsers)),
		"topup_money":          adminDataStatisticsSummaryDeltaRate(current.TopupMoney, previous.TopupMoney),
		"topup_amount":         adminDataStatisticsSummaryDeltaRate(float64(current.TopupAmount), float64(previous.TopupAmount)),
		"topup_count":          adminDataStatisticsSummaryDeltaRate(float64(current.TopupCount), float64(previous.TopupCount)),
		"current_balance":      adminDataStatisticsSummaryDeltaRate(float64(current.CurrentBalance), float64(previous.CurrentBalance)),
		"total_used_quota":     adminDataStatisticsSummaryDeltaRate(float64(current.TotalUsedQuota), float64(previous.TotalUsedQuota)),
		"total_request_count":  adminDataStatisticsSummaryDeltaRate(float64(current.TotalRequestCount), float64(previous.TotalRequestCount)),
	}
	return delta, deltaRate
}

func GetAdminDataStatisticsSummary(c *gin.Context) {
	filter, err := parseAdminDataStatisticsFilter(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary, err := model.GetAdminDataStatisticsSummary(filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	previousSummary, err := model.GetAdminDataStatisticsSummary(previousAdminDataStatisticsFilter(filter))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	delta, deltaRate := buildAdminDataStatisticsSummaryComparison(summary, previousSummary)
	common.ApiSuccess(c, gin.H{
		"filter":           filter,
		"summary":          summary,
		"previous_summary": previousSummary,
		"delta":            delta,
		"delta_rate":       deltaRate,
	})
}

func GetAdminDataStatisticsTrends(c *gin.Context) {
	filter, err := parseAdminDataStatisticsFilter(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	points, err := model.GetAdminDataStatisticsTrends(filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"filter": filter,
		"items":  points,
	})
}

func GetAdminDataStatisticsRankings(c *gin.Context) {
	filter, err := parseAdminDataStatisticsFilter(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	rankings, err := model.GetAdminDataStatisticsRankings(filter)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"filter":   filter,
		"rankings": rankings,
	})
}

func GetAdminDataStatisticsFilters(c *gin.Context) {
	filters, err := model.GetAdminDataStatisticsFilters()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, filters)
}
