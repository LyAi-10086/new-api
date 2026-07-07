package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

func GetChannelAlertSettings(c *gin.Context) {
	common.ApiSuccess(c, operation_setting.GetChannelAlertSetting())
}

func UpdateChannelAlertSettings(c *gin.Context) {
	var req operation_setting.ChannelAlertSetting
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	req = operation_setting.NormalizeChannelAlertSetting(req)
	if err := operation_setting.ValidateChannelAlertSetting(req); err != nil {
		common.ApiError(c, err)
		return
	}
	recipients, err := common.Marshal(req.Recipients)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	keywords, err := common.Marshal(req.Keywords)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	values := map[string]string{
		"channel_alert_setting.enabled":                   strconv.FormatBool(req.Enabled),
		"channel_alert_setting.recipients":                string(recipients),
		"channel_alert_setting.window_seconds":            strconv.Itoa(req.WindowSeconds),
		"channel_alert_setting.failure_threshold":         strconv.Itoa(req.FailureThreshold),
		"channel_alert_setting.cooldown_seconds":          strconv.Itoa(req.CooldownSeconds),
		"channel_alert_setting.recovery_enabled":          strconv.FormatBool(req.RecoveryEnabled),
		"channel_alert_setting.recovery_cooldown_seconds": strconv.Itoa(req.RecoveryCooldownSeconds),
		"channel_alert_setting.status_codes":              req.StatusCodes,
		"channel_alert_setting.keywords":                  string(keywords),
		"channel_alert_setting.include_relay_errors":      strconv.FormatBool(req.IncludeRelayErrors),
		"channel_alert_setting.include_scheduled_tests":   strconv.FormatBool(req.IncludeScheduledTests),
		"channel_alert_setting.include_manual_tests":      strconv.FormatBool(req.IncludeManualTests),
	}
	if err := model.UpdateOptionsBulk(values); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, operation_setting.GetChannelAlertSetting())
}

func TestChannelAlertEmail(c *gin.Context) {
	if err := service.SendChannelAlertTest(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"sent": true})
}

func GetChannelAlertEvents(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := model.ChannelAlertEventFilter{
		ChannelId: common.String2Int(c.Query("channel_id")),
		Source:    c.Query("source"),
		RuleKey:   c.Query("rule_key"),
		StartTime: int64(common.String2Int(c.Query("start_time"))),
		EndTime:   int64(common.String2Int(c.Query("end_time"))),
	}
	events, total, err := model.ListChannelAlertEvents(filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items":     events,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}

func GetChannelAlertStates(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	onlyActive, _ := strconv.ParseBool(c.Query("active"))
	states, total, err := model.ListChannelAlertStates(common.String2Int(c.Query("channel_id")), onlyActive, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items":     states,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}
