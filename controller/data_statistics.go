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
	common.ApiSuccess(c, gin.H{
		"filter":  filter,
		"summary": summary,
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
