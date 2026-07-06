package model

import (
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const adminDataStatisticsMaxRankingLimit = 20

type AdminDataStatisticsFilter struct {
	StartTimestamp  int64  `json:"start_timestamp"`
	EndTimestamp    int64  `json:"end_timestamp"`
	Granularity     string `json:"granularity"`
	ModelName       string `json:"model_name"`
	Group           string `json:"group"`
	UserId          int    `json:"user_id"`
	ChannelId       int    `json:"channel_id"`
	PaymentProvider string `json:"payment_provider"`
}

type AdminDataStatisticsSummary struct {
	ConsumeQuota      int64   `json:"consume_quota"`
	RequestCount      int64   `json:"request_count"`
	PromptTokens      int64   `json:"prompt_tokens"`
	CompletionTokens  int64   `json:"completion_tokens"`
	ActiveUsers       int64   `json:"active_users"`
	ErrorCount        int64   `json:"error_count"`
	LoginCount        int64   `json:"login_count"`
	LoginUsers        int64   `json:"login_users"`
	RegisteredUsers   int64   `json:"registered_users"`
	TopupMoney        float64 `json:"topup_money"`
	TopupAmount       int64   `json:"topup_amount"`
	CurrentBalance    int64   `json:"current_balance"`
	TotalUsedQuota    int64   `json:"total_used_quota"`
	TotalRequestCount int64   `json:"total_request_count"`
}

type AdminDataStatisticsTrendPoint struct {
	Bucket          int64   `json:"bucket"`
	ConsumeQuota    int64   `json:"consume_quota"`
	RequestCount    int64   `json:"request_count"`
	ActiveUsers     int64   `json:"active_users"`
	ErrorCount      int64   `json:"error_count"`
	TopupMoney      float64 `json:"topup_money"`
	TopupAmount     int64   `json:"topup_amount"`
	RegisteredUsers int64   `json:"registered_users"`
}

type AdminDataStatisticsRankItem struct {
	Id               int     `json:"id,omitempty"`
	Name             string  `json:"name"`
	Username         string  `json:"username,omitempty"`
	ConsumeQuota     int64   `json:"consume_quota,omitempty"`
	RequestCount     int64   `json:"request_count,omitempty"`
	PromptTokens     int64   `json:"prompt_tokens,omitempty"`
	CompletionTokens int64   `json:"completion_tokens,omitempty"`
	TopupMoney       float64 `json:"topup_money,omitempty"`
	TopupAmount      int64   `json:"topup_amount,omitempty"`
	CurrentBalance   int64   `json:"current_balance,omitempty"`
	UsedQuota        int64   `json:"used_quota,omitempty"`
}

type AdminDataStatisticsRankings struct {
	Models       []AdminDataStatisticsRankItem `json:"models"`
	Groups       []AdminDataStatisticsRankItem `json:"groups"`
	Users        []AdminDataStatisticsRankItem `json:"users"`
	Channels     []AdminDataStatisticsRankItem `json:"channels"`
	TopupUsers   []AdminDataStatisticsRankItem `json:"topup_users"`
	BalanceUsers []AdminDataStatisticsRankItem `json:"balance_users"`
}

type AdminDataStatisticsFilters struct {
	Models           []string                          `json:"models"`
	Groups           []string                          `json:"groups"`
	PaymentProviders []string                          `json:"payment_providers"`
	Channels         []AdminDataStatisticsFilterOption `json:"channels"`
}

type AdminDataStatisticsFilterOption struct {
	Id   int    `json:"id"`
	Name string `json:"name"`
}

func adminStatisticsBucketSeconds(granularity string) int64 {
	if granularity == "hour" {
		return 3600
	}
	return 86400
}

func adminStatisticsLogBucketExpr(granularity string) string {
	seconds := adminStatisticsBucketSeconds(granularity)
	secondsString := strconv.FormatInt(seconds, 10)
	switch common.LogDatabaseType() {
	case common.DatabaseTypeClickHouse:
		return "intDiv(created_at, " + secondsString + ") * " + secondsString
	case common.DatabaseTypePostgreSQL:
		return "FLOOR(created_at / " + secondsString + ".0)::bigint * " + secondsString
	case common.DatabaseTypeMySQL:
		return "FLOOR(created_at / " + secondsString + ") * " + secondsString
	default:
		return "CAST(created_at / " + secondsString + " AS INTEGER) * " + secondsString
	}
}

func adminStatisticsMainBucketExpr(column string, granularity string) string {
	seconds := adminStatisticsBucketSeconds(granularity)
	secondsString := strconv.FormatInt(seconds, 10)
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		return "FLOOR(" + column + " / " + secondsString + ".0)::bigint * " + secondsString
	}
	if common.UsingMainDatabase(common.DatabaseTypeMySQL) {
		return "FLOOR(" + column + " / " + secondsString + ") * " + secondsString
	}
	return "CAST(" + column + " / " + secondsString + " AS INTEGER) * " + secondsString
}

func applyAdminStatisticsLogFilters(queryType int, filter AdminDataStatisticsFilter) *gorm.DB {
	tx := LOG_DB.Table("logs").Where("type = ?", queryType)
	if filter.StartTimestamp > 0 {
		tx = tx.Where("created_at >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp > 0 {
		tx = tx.Where("created_at <= ?", filter.EndTimestamp)
	}
	if filter.ModelName != "" {
		tx = tx.Where("model_name = ?", filter.ModelName)
	}
	if filter.Group != "" {
		tx = tx.Where(logGroupCol+" = ?", filter.Group)
	}
	if filter.UserId > 0 {
		tx = tx.Where("user_id = ?", filter.UserId)
	}
	if filter.ChannelId > 0 {
		tx = tx.Where("channel_id = ?", filter.ChannelId)
	}
	return tx
}

func adminStatisticsConsumeQuery(filter AdminDataStatisticsFilter) *gorm.DB {
	return applyAdminStatisticsLogFilters(LogTypeConsume, filter)
}

func adminStatisticsErrorQuery(filter AdminDataStatisticsFilter) *gorm.DB {
	return applyAdminStatisticsLogFilters(LogTypeError, filter)
}

func adminStatisticsLoginQuery(filter AdminDataStatisticsFilter) *gorm.DB {
	return applyAdminStatisticsLogFilters(LogTypeLogin, filter)
}

func adminStatisticsTopupQuery(filter AdminDataStatisticsFilter) *gorm.DB {
	tx := DB.Model(&TopUp{}).Where("status = ?", common.TopUpStatusSuccess)
	if filter.StartTimestamp > 0 {
		tx = tx.Where("complete_time >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp > 0 {
		tx = tx.Where("complete_time <= ?", filter.EndTimestamp)
	}
	if filter.UserId > 0 {
		tx = tx.Where("user_id = ?", filter.UserId)
	}
	if filter.PaymentProvider != "" {
		tx = tx.Where("payment_provider = ?", filter.PaymentProvider)
	}
	return tx
}

func GetAdminDataStatisticsSummary(filter AdminDataStatisticsFilter) (AdminDataStatisticsSummary, error) {
	var summary AdminDataStatisticsSummary

	var consume struct {
		ConsumeQuota     int64
		RequestCount     int64
		PromptTokens     int64
		CompletionTokens int64
		ActiveUsers      int64
	}
	if err := adminStatisticsConsumeQuery(filter).
		Select("COALESCE(SUM(quota), 0) AS consume_quota, COUNT(*) AS request_count, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(completion_tokens), 0) AS completion_tokens, COUNT(DISTINCT user_id) AS active_users").
		Scan(&consume).Error; err != nil {
		return summary, err
	}
	summary.ConsumeQuota = consume.ConsumeQuota
	summary.RequestCount = consume.RequestCount
	summary.PromptTokens = consume.PromptTokens
	summary.CompletionTokens = consume.CompletionTokens
	summary.ActiveUsers = consume.ActiveUsers

	if err := adminStatisticsErrorQuery(filter).Count(&summary.ErrorCount).Error; err != nil {
		return summary, err
	}
	var login struct {
		LoginCount int64
		LoginUsers int64
	}
	if err := adminStatisticsLoginQuery(filter).
		Select("COUNT(*) AS login_count, COUNT(DISTINCT user_id) AS login_users").
		Scan(&login).Error; err != nil {
		return summary, err
	}
	summary.LoginCount = login.LoginCount
	summary.LoginUsers = login.LoginUsers

	userQuery := DB.Model(&User{})
	if filter.StartTimestamp > 0 {
		userQuery = userQuery.Where("created_at >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp > 0 {
		userQuery = userQuery.Where("created_at <= ?", filter.EndTimestamp)
	}
	if filter.Group != "" {
		userQuery = userQuery.Where(commonGroupCol+" = ?", filter.Group)
	}
	if err := userQuery.Count(&summary.RegisteredUsers).Error; err != nil {
		return summary, err
	}

	if err := adminStatisticsTopupQuery(filter).
		Select("COALESCE(SUM(money), 0) AS topup_money, COALESCE(SUM(amount), 0) AS topup_amount").
		Scan(&summary).Error; err != nil {
		return summary, err
	}

	balanceQuery := DB.Model(&User{})
	if filter.Group != "" {
		balanceQuery = balanceQuery.Where(commonGroupCol+" = ?", filter.Group)
	}
	if err := balanceQuery.
		Select("COALESCE(SUM(quota), 0) AS current_balance, COALESCE(SUM(used_quota), 0) AS total_used_quota, COALESCE(SUM(request_count), 0) AS total_request_count").
		Scan(&summary).Error; err != nil {
		return summary, err
	}

	return summary, nil
}

func GetAdminDataStatisticsTrends(filter AdminDataStatisticsFilter) ([]AdminDataStatisticsTrendPoint, error) {
	points := map[int64]*AdminDataStatisticsTrendPoint{}
	ensurePoint := func(bucket int64) *AdminDataStatisticsTrendPoint {
		if points[bucket] == nil {
			points[bucket] = &AdminDataStatisticsTrendPoint{Bucket: bucket}
		}
		return points[bucket]
	}

	logBucket := adminStatisticsLogBucketExpr(filter.Granularity)
	var consumeRows []AdminDataStatisticsTrendPoint
	if err := adminStatisticsConsumeQuery(filter).
		Select(logBucket + " AS bucket, COALESCE(SUM(quota), 0) AS consume_quota, COUNT(*) AS request_count, COUNT(DISTINCT user_id) AS active_users").
		Group("bucket").
		Order("bucket asc").
		Scan(&consumeRows).Error; err != nil {
		return nil, err
	}
	for _, row := range consumeRows {
		point := ensurePoint(row.Bucket)
		point.ConsumeQuota = row.ConsumeQuota
		point.RequestCount = row.RequestCount
		point.ActiveUsers = row.ActiveUsers
	}

	var errorRows []AdminDataStatisticsTrendPoint
	if err := adminStatisticsErrorQuery(filter).
		Select(logBucket + " AS bucket, COUNT(*) AS error_count").
		Group("bucket").
		Order("bucket asc").
		Scan(&errorRows).Error; err != nil {
		return nil, err
	}
	for _, row := range errorRows {
		ensurePoint(row.Bucket).ErrorCount = row.ErrorCount
	}

	mainBucket := adminStatisticsMainBucketExpr("complete_time", filter.Granularity)
	var topupRows []AdminDataStatisticsTrendPoint
	if err := adminStatisticsTopupQuery(filter).
		Select(mainBucket + " AS bucket, COALESCE(SUM(money), 0) AS topup_money, COALESCE(SUM(amount), 0) AS topup_amount").
		Group("bucket").
		Order("bucket asc").
		Scan(&topupRows).Error; err != nil {
		return nil, err
	}
	for _, row := range topupRows {
		point := ensurePoint(row.Bucket)
		point.TopupMoney = row.TopupMoney
		point.TopupAmount = row.TopupAmount
	}

	userBucket := adminStatisticsMainBucketExpr("created_at", filter.Granularity)
	var registerRows []AdminDataStatisticsTrendPoint
	userQuery := DB.Model(&User{})
	if filter.StartTimestamp > 0 {
		userQuery = userQuery.Where("created_at >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp > 0 {
		userQuery = userQuery.Where("created_at <= ?", filter.EndTimestamp)
	}
	if filter.Group != "" {
		userQuery = userQuery.Where(commonGroupCol+" = ?", filter.Group)
	}
	if err := userQuery.
		Select(userBucket + " AS bucket, COUNT(*) AS registered_users").
		Group("bucket").
		Order("bucket asc").
		Scan(&registerRows).Error; err != nil {
		return nil, err
	}
	for _, row := range registerRows {
		ensurePoint(row.Bucket).RegisteredUsers = row.RegisteredUsers
	}

	buckets := make([]int64, 0, len(points))
	for bucket := range points {
		buckets = append(buckets, bucket)
	}
	sort.Slice(buckets, func(i, j int) bool { return buckets[i] < buckets[j] })
	result := make([]AdminDataStatisticsTrendPoint, 0, len(buckets))
	for _, bucket := range buckets {
		result = append(result, *points[bucket])
	}
	return result, nil
}

func GetAdminDataStatisticsRankings(filter AdminDataStatisticsFilter) (AdminDataStatisticsRankings, error) {
	var rankings AdminDataStatisticsRankings
	var err error
	if rankings.Models, err = adminStatisticsLogRanking(filter, "model_name", "model_name <> ''", ""); err != nil {
		return rankings, err
	}
	if rankings.Groups, err = adminStatisticsLogRanking(filter, logGroupCol, logGroupCol+" <> ''", ""); err != nil {
		return rankings, err
	}
	if rankings.Users, err = adminStatisticsLogRanking(filter, "user_id", "user_id > 0", "username"); err != nil {
		return rankings, err
	}
	if rankings.Channels, err = adminStatisticsChannelRanking(filter); err != nil {
		return rankings, err
	}
	if rankings.TopupUsers, err = adminStatisticsTopupUserRanking(filter); err != nil {
		return rankings, err
	}
	if rankings.BalanceUsers, err = adminStatisticsBalanceUserRanking(filter); err != nil {
		return rankings, err
	}
	return rankings, nil
}

func adminStatisticsLogRanking(filter AdminDataStatisticsFilter, keyColumn string, nonEmptyCondition string, usernameColumn string) ([]AdminDataStatisticsRankItem, error) {
	var rows []AdminDataStatisticsRankItem
	selectFields := keyColumn + " AS name, COALESCE(SUM(quota), 0) AS consume_quota, COUNT(*) AS request_count, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(completion_tokens), 0) AS completion_tokens"
	groupFields := keyColumn
	if keyColumn == "user_id" {
		selectFields = "user_id AS id, MAX(username) AS username, COALESCE(SUM(quota), 0) AS consume_quota, COUNT(*) AS request_count, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(completion_tokens), 0) AS completion_tokens"
		groupFields = "user_id"
	}
	if usernameColumn != "" && keyColumn != "user_id" {
		selectFields += ", MAX(" + usernameColumn + ") AS username"
	}
	query := adminStatisticsConsumeQuery(filter)
	if nonEmptyCondition != "" {
		query = query.Where(nonEmptyCondition)
	}
	if err := query.
		Select(selectFields).
		Group(groupFields).
		Order("consume_quota desc").
		Limit(adminDataStatisticsMaxRankingLimit).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	if keyColumn == "user_id" {
		for i := range rows {
			if rows[i].Username != "" {
				rows[i].Name = rows[i].Username
			} else {
				rows[i].Name = strconv.Itoa(rows[i].Id)
			}
		}
	}
	return rows, nil
}

func adminStatisticsChannelRanking(filter AdminDataStatisticsFilter) ([]AdminDataStatisticsRankItem, error) {
	var rows []AdminDataStatisticsRankItem
	if err := adminStatisticsConsumeQuery(filter).
		Where("channel_id > 0").
		Select("channel_id AS id, COALESCE(SUM(quota), 0) AS consume_quota, COUNT(*) AS request_count, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(completion_tokens), 0) AS completion_tokens").
		Group("channel_id").
		Order("consume_quota desc").
		Limit(adminDataStatisticsMaxRankingLimit).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return rows, nil
	}
	ids := make([]int, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.Id)
	}
	nameMap := map[int]string{}
	var channels []struct {
		Id   int
		Name string
	}
	if err := DB.Model(&Channel{}).Select("id, name").Where("id IN ?", ids).Find(&channels).Error; err != nil {
		return nil, err
	}
	for _, channel := range channels {
		nameMap[channel.Id] = channel.Name
	}
	for i := range rows {
		rows[i].Name = nameMap[rows[i].Id]
		if rows[i].Name == "" {
			rows[i].Name = strconv.Itoa(rows[i].Id)
		}
	}
	return rows, nil
}

func adminStatisticsTopupUserRanking(filter AdminDataStatisticsFilter) ([]AdminDataStatisticsRankItem, error) {
	var rows []AdminDataStatisticsRankItem
	if err := adminStatisticsTopupQuery(filter).
		Select("user_id AS id, COALESCE(SUM(money), 0) AS topup_money, COALESCE(SUM(amount), 0) AS topup_amount").
		Where("user_id > 0").
		Group("user_id").
		Order("topup_money desc").
		Limit(adminDataStatisticsMaxRankingLimit).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	return fillAdminStatisticsUserNames(rows)
}

func adminStatisticsBalanceUserRanking(filter AdminDataStatisticsFilter) ([]AdminDataStatisticsRankItem, error) {
	var rows []AdminDataStatisticsRankItem
	query := DB.Model(&User{})
	if filter.Group != "" {
		query = query.Where(commonGroupCol+" = ?", filter.Group)
	}
	if err := query.
		Select("id, username, quota AS current_balance, used_quota AS used_quota, request_count AS request_count").
		Order("quota desc").
		Limit(adminDataStatisticsMaxRankingLimit).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].Name = rows[i].Username
	}
	return rows, nil
}

func fillAdminStatisticsUserNames(rows []AdminDataStatisticsRankItem) ([]AdminDataStatisticsRankItem, error) {
	if len(rows) == 0 {
		return rows, nil
	}
	ids := make([]int, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.Id)
	}
	var users []struct {
		Id       int
		Username string
	}
	if err := DB.Model(&User{}).Select("id, username").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	nameMap := map[int]string{}
	for _, user := range users {
		nameMap[user.Id] = user.Username
	}
	for i := range rows {
		rows[i].Username = nameMap[rows[i].Id]
		if rows[i].Username != "" {
			rows[i].Name = rows[i].Username
		} else {
			rows[i].Name = strconv.Itoa(rows[i].Id)
		}
	}
	return rows, nil
}

func GetAdminDataStatisticsFilters() (AdminDataStatisticsFilters, error) {
	var filters AdminDataStatisticsFilters
	if err := LOG_DB.Model(&Log{}).
		Distinct("model_name").
		Where("model_name <> ''").
		Order("model_name asc").
		Limit(500).
		Pluck("model_name", &filters.Models).Error; err != nil {
		return filters, err
	}
	if err := LOG_DB.Model(&Log{}).
		Distinct(logGroupCol).
		Where(logGroupCol+" <> ''").
		Order(logGroupCol+" asc").
		Limit(500).
		Pluck(logGroupCol, &filters.Groups).Error; err != nil {
		return filters, err
	}
	if err := DB.Model(&TopUp{}).
		Distinct("payment_provider").
		Where("payment_provider <> ''").
		Order("payment_provider asc").
		Limit(100).
		Pluck("payment_provider", &filters.PaymentProviders).Error; err != nil {
		return filters, err
	}
	var channels []AdminDataStatisticsFilterOption
	if err := DB.Model(&Channel{}).
		Select("id, name").
		Order("id desc").
		Limit(500).
		Scan(&channels).Error; err != nil {
		return filters, err
	}
	for i := range channels {
		channels[i].Name = strings.TrimSpace(channels[i].Name)
		if channels[i].Name == "" {
			channels[i].Name = strconv.Itoa(channels[i].Id)
		}
	}
	filters.Channels = channels
	return filters, nil
}
