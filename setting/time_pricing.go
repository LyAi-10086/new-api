package setting

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
)

const (
	TimePricingSettingOptionKey = "TimePricingSetting"

	TimePricingScopeAll        = "all"
	TimePricingScopeGroup      = "group"
	TimePricingScopeModel      = "model"
	TimePricingScopeGroupModel = "group_model"

	TimePricingStackingExclusive = "exclusive"
)

const (
	maxTimePricingRules          = 200
	maxTimePricingScopeItems     = 200
	maxTimePricingTitleLength    = 64
	maxTimePricingDescLength     = 200
	defaultTimePricingTimezone   = "Asia/Shanghai"
	defaultTimePricingPreviewDay = 7
)

type TimePricingSettingConfig struct {
	Enabled           bool              `json:"enabled"`
	UserNoticeEnabled bool              `json:"user_notice_enabled"`
	PreviewDays       int               `json:"preview_days"`
	Version           int64             `json:"version"`
	Rules             []TimePricingRule `json:"rules"`
}

type TimePricingRule struct {
	Id              string   `json:"id"`
	Name            string   `json:"name"`
	Enabled         bool     `json:"enabled"`
	Timezone        string   `json:"timezone"`
	StartDate       string   `json:"start_date"`
	EndDate         string   `json:"end_date"`
	DailyStartTime  string   `json:"daily_start_time"`
	DailyEndTime    string   `json:"daily_end_time"`
	DaysOfWeek      []int    `json:"days_of_week"`
	ScopeType       string   `json:"scope_type"`
	Groups          []string `json:"groups"`
	Models          []string `json:"models"`
	Multiplier      float64  `json:"multiplier"`
	Priority        int      `json:"priority"`
	Stacking        string   `json:"stacking"`
	UserVisible     bool     `json:"user_visible"`
	UserTitle       string   `json:"user_title"`
	UserDescription string   `json:"user_description"`
	CreatedAt       int64    `json:"created_at"`
}

type TimePricingMatch struct {
	Matched      bool              `json:"matched"`
	Rule         *TimePricingRule  `json:"rule,omitempty"`
	CoveredRules []TimePricingRule `json:"covered_rules,omitempty"`
	Multiplier   float64           `json:"multiplier"`
	Version      int64             `json:"version"`
}

type TimePricingPromotion struct {
	Id              string   `json:"id"`
	Name            string   `json:"name"`
	UserTitle       string   `json:"user_title"`
	UserDescription string   `json:"user_description"`
	StartDate       string   `json:"start_date"`
	EndDate         string   `json:"end_date"`
	DailyStartTime  string   `json:"daily_start_time"`
	DailyEndTime    string   `json:"daily_end_time"`
	DaysOfWeek      []int    `json:"days_of_week"`
	ScopeType       string   `json:"scope_type"`
	Groups          []string `json:"groups,omitempty"`
	Models          []string `json:"models,omitempty"`
	Multiplier      float64  `json:"multiplier"`
	Priority        int      `json:"priority"`
	Status          string   `json:"status"`
}

var timePricingSetting atomic.Value

func init() {
	timePricingSetting.Store(DefaultTimePricingSetting())
}

func DefaultTimePricingSetting() TimePricingSettingConfig {
	return TimePricingSettingConfig{
		Enabled:           false,
		UserNoticeEnabled: false,
		PreviewDays:       defaultTimePricingPreviewDay,
		Version:           0,
		Rules:             []TimePricingRule{},
	}
}

func GetTimePricingSetting() TimePricingSettingConfig {
	config, ok := timePricingSetting.Load().(TimePricingSettingConfig)
	if !ok {
		return DefaultTimePricingSetting()
	}
	return NormalizeTimePricingSetting(config)
}

func TimePricingSettingToJSONString() string {
	bytes, err := common.Marshal(GetTimePricingSetting())
	if err != nil {
		bytes, _ = common.Marshal(DefaultTimePricingSetting())
	}
	return string(bytes)
}

func UpdateTimePricingSettingByJSONString(value string) error {
	normalized, err := timePricingSettingFromJSONString(value)
	if err != nil {
		return err
	}
	current := GetTimePricingSetting()
	if normalized.Version <= current.Version {
		normalized.Version = current.Version + 1
	}
	timePricingSetting.Store(normalized)
	return nil
}

func ValidateTimePricingSettingJSONString(value string) error {
	_, err := timePricingSettingFromJSONString(value)
	return err
}

func PrepareTimePricingSettingJSONString(value string) (string, error) {
	normalized, err := timePricingSettingFromJSONString(value)
	if err != nil {
		return "", err
	}
	current := GetTimePricingSetting()
	if normalized.Version <= current.Version {
		normalized.Version = current.Version + 1
	}
	bytes, err := common.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func timePricingSettingFromJSONString(value string) (TimePricingSettingConfig, error) {
	config := DefaultTimePricingSetting()
	if strings.TrimSpace(value) != "" {
		if err := common.Unmarshal([]byte(value), &config); err != nil {
			return config, err
		}
	}
	normalized, err := ValidateTimePricingSetting(config)
	if err != nil {
		return normalized, err
	}
	return normalized, nil
}

func NormalizeTimePricingSetting(config TimePricingSettingConfig) TimePricingSettingConfig {
	if config.PreviewDays <= 0 {
		config.PreviewDays = defaultTimePricingPreviewDay
	}
	if config.PreviewDays > 30 {
		config.PreviewDays = 30
	}
	if config.Rules == nil {
		config.Rules = []TimePricingRule{}
	}
	if len(config.Rules) > maxTimePricingRules {
		config.Rules = config.Rules[:maxTimePricingRules]
	}
	for i := range config.Rules {
		config.Rules[i] = NormalizeTimePricingRule(config.Rules[i])
	}
	return config
}

func NormalizeTimePricingRule(rule TimePricingRule) TimePricingRule {
	rule.Id = strings.TrimSpace(rule.Id)
	rule.Name = limitRuneString(strings.TrimSpace(rule.Name), maxTimePricingTitleLength)
	rule.Timezone = strings.TrimSpace(rule.Timezone)
	if rule.Timezone == "" {
		rule.Timezone = defaultTimePricingTimezone
	}
	rule.StartDate = strings.TrimSpace(rule.StartDate)
	rule.EndDate = strings.TrimSpace(rule.EndDate)
	rule.DailyStartTime = strings.TrimSpace(rule.DailyStartTime)
	rule.DailyEndTime = strings.TrimSpace(rule.DailyEndTime)
	rule.ScopeType = normalizeTimePricingScope(rule.ScopeType)
	rule.Groups = normalizeTimePricingItems(rule.Groups, maxTimePricingScopeItems)
	rule.Models = normalizeTimePricingItems(rule.Models, maxTimePricingScopeItems)
	rule.Stacking = strings.TrimSpace(rule.Stacking)
	if rule.Stacking == "" {
		rule.Stacking = TimePricingStackingExclusive
	}
	if rule.UserTitle == "" {
		rule.UserTitle = rule.Name
	}
	rule.UserTitle = limitRuneString(strings.TrimSpace(rule.UserTitle), maxTimePricingTitleLength)
	rule.UserDescription = limitRuneString(strings.TrimSpace(rule.UserDescription), maxTimePricingDescLength)
	if len(rule.DaysOfWeek) == 0 {
		rule.DaysOfWeek = []int{0, 1, 2, 3, 4, 5, 6}
	} else {
		rule.DaysOfWeek = normalizeWeekdays(rule.DaysOfWeek)
	}
	return rule
}

func ValidateTimePricingSetting(config TimePricingSettingConfig) (TimePricingSettingConfig, error) {
	if len(config.Rules) > maxTimePricingRules {
		return NormalizeTimePricingSetting(config), fmt.Errorf("分时段计费规则最多支持 %d 条", maxTimePricingRules)
	}
	config = NormalizeTimePricingSetting(config)
	seenIds := make(map[string]struct{}, len(config.Rules))
	for i := range config.Rules {
		rule := config.Rules[i]
		if err := ValidateTimePricingRule(rule); err != nil {
			return config, fmt.Errorf("规则 %s 校验失败: %w", displayTimePricingRuleName(rule, i), err)
		}
		if rule.Id != "" {
			if _, ok := seenIds[rule.Id]; ok {
				return config, fmt.Errorf("规则 ID %s 重复", rule.Id)
			}
			seenIds[rule.Id] = struct{}{}
		}
		config.Rules[i] = rule
	}
	return config, nil
}

func ValidateTimePricingRule(rule TimePricingRule) error {
	if rule.Id == "" {
		return errors.New("规则 ID 不能为空")
	}
	if rule.Name == "" {
		return errors.New("规则名称不能为空")
	}
	if _, err := time.LoadLocation(rule.Timezone); err != nil {
		return fmt.Errorf("时区无效: %s", rule.Timezone)
	}
	if _, err := parseTimePricingDate(rule.StartDate); err != nil {
		return fmt.Errorf("开始日期无效: %w", err)
	}
	if _, err := parseTimePricingDate(rule.EndDate); err != nil {
		return fmt.Errorf("结束日期无效: %w", err)
	}
	startDate, _ := parseTimePricingDate(rule.StartDate)
	endDate, _ := parseTimePricingDate(rule.EndDate)
	if endDate.Before(startDate) {
		return errors.New("结束日期不能早于开始日期")
	}
	hasDailyStart := rule.DailyStartTime != ""
	hasDailyEnd := rule.DailyEndTime != ""
	if hasDailyStart != hasDailyEnd {
		return errors.New("每日开始时间和结束时间必须同时填写，或同时留空表示全天")
	}
	if hasDailyStart {
		startMinute, err := parseTimePricingClock(rule.DailyStartTime)
		if err != nil {
			return fmt.Errorf("每日开始时间无效: %w", err)
		}
		endMinute, err := parseTimePricingClock(rule.DailyEndTime)
		if err != nil {
			return fmt.Errorf("每日结束时间无效: %w", err)
		}
		if startMinute == endMinute {
			return errors.New("每日开始时间不能等于结束时间；全天请留空每日时段")
		}
	}
	if len(rule.DaysOfWeek) == 0 {
		return errors.New("生效星期不能为空")
	}
	for _, weekday := range rule.DaysOfWeek {
		if weekday < 0 || weekday > 6 {
			return fmt.Errorf("星期值无效: %d", weekday)
		}
	}
	if rule.Multiplier <= 0 || rule.Multiplier > 1 || math.IsNaN(rule.Multiplier) || math.IsInf(rule.Multiplier, 0) {
		return errors.New("计费倍率必须大于 0 且不超过 1")
	}
	if hasMoreThanFourDecimals(rule.Multiplier) {
		return errors.New("计费倍率最多支持 4 位小数")
	}
	if rule.Stacking != TimePricingStackingExclusive {
		return errors.New("第一版仅支持 exclusive 互斥规则")
	}
	switch rule.ScopeType {
	case TimePricingScopeAll:
	case TimePricingScopeGroup:
		if len(rule.Groups) == 0 {
			return errors.New("按分组规则必须选择至少一个分组")
		}
	case TimePricingScopeModel:
		if len(rule.Models) == 0 {
			return errors.New("按模型规则必须选择至少一个模型")
		}
	case TimePricingScopeGroupModel:
		if len(rule.Groups) == 0 || len(rule.Models) == 0 {
			return errors.New("按分组和模型规则必须同时选择分组和模型")
		}
	default:
		return fmt.Errorf("作用范围无效: %s", rule.ScopeType)
	}
	return nil
}

func ResolveTimePricingRule(group string, modelName string, at time.Time) TimePricingMatch {
	config := GetTimePricingSetting()
	if !config.Enabled {
		return TimePricingMatch{Multiplier: 1, Version: config.Version}
	}
	matches := make([]TimePricingRule, 0, 2)
	for _, rule := range config.Rules {
		if !rule.Enabled {
			continue
		}
		if !timePricingRuleMatches(rule, group, modelName, at) {
			continue
		}
		matches = append(matches, rule)
	}
	if len(matches) == 0 {
		return TimePricingMatch{Multiplier: 1, Version: config.Version}
	}
	sort.SliceStable(matches, func(i, j int) bool {
		return timePricingRuleLess(matches[i], matches[j])
	})
	selected := matches[0]
	covered := []TimePricingRule{}
	if len(matches) > 1 {
		covered = append(covered, matches[1:]...)
	}
	return TimePricingMatch{
		Matched:      true,
		Rule:         &selected,
		CoveredRules: covered,
		Multiplier:   selected.Multiplier,
		Version:      config.Version,
	}
}

func BuildTimePricingSnapshot(group string, modelName string, at time.Time, originalQuota int) *types.TimePricingSnapshot {
	if originalQuota <= 0 {
		return nil
	}
	if at.IsZero() {
		at = time.Now()
	}
	match := ResolveTimePricingRule(group, modelName, at)
	if !match.Matched || match.Rule == nil || match.Multiplier <= 0 || match.Multiplier == 1 {
		return nil
	}
	finalQuota := ApplyTimePricingMultiplier(originalQuota, match.Multiplier)
	return &types.TimePricingSnapshot{
		Matched:       true,
		RuleId:        match.Rule.Id,
		RuleName:      match.Rule.Name,
		UserTitle:     match.Rule.UserTitle,
		ScopeType:     match.Rule.ScopeType,
		Multiplier:    match.Multiplier,
		Timezone:      match.Rule.Timezone,
		ConfigVersion: match.Version,
		RequestTime:   at.Unix(),
		OriginalQuota: originalQuota,
		FinalQuota:    finalQuota,
	}
}

func ApplyTimePricingMultiplier(originalQuota int, multiplier float64) int {
	if originalQuota <= 0 || multiplier <= 0 || multiplier == 1 {
		return originalQuota
	}
	finalQuota := int(math.Round(float64(originalQuota) * multiplier))
	if finalQuota <= 0 {
		return 1
	}
	return finalQuota
}

func TimePricingRuleStatus(rule TimePricingRule, now time.Time) string {
	rule = NormalizeTimePricingRule(rule)
	loc, err := time.LoadLocation(rule.Timezone)
	if err != nil {
		return "invalid"
	}
	localNow := now.In(loc)
	activeDate := localNow
	if ruleCrossesDay(rule) {
		currentMinute := localNow.Hour()*60 + localNow.Minute()
		endMinute, _ := parseTimePricingClock(rule.DailyEndTime)
		if currentMinute < endMinute {
			activeDate = activeDate.AddDate(0, 0, -1)
		}
	}
	startDate, err := parseTimePricingDate(rule.StartDate)
	if err != nil {
		return "invalid"
	}
	endDate, err := parseTimePricingDate(rule.EndDate)
	if err != nil {
		return "invalid"
	}
	currentDate := dateOnlyInLocation(activeDate, loc)
	startLocal := dateInLocation(startDate, loc)
	endLocal := dateInLocation(endDate, loc)
	if currentDate.Before(startLocal) {
		return "upcoming"
	}
	if currentDate.After(endLocal) {
		return "ended"
	}
	if timePricingDateTimeMatches(rule, now) {
		return "active"
	}
	return "inactive"
}

func ListVisibleTimePricingPromotions(group string, modelNames []string, now time.Time) []TimePricingPromotion {
	config := GetTimePricingSetting()
	if !config.Enabled || !config.UserNoticeEnabled {
		return []TimePricingPromotion{}
	}
	previewEnd := now.AddDate(0, 0, config.PreviewDays)
	modelSet := make(map[string]struct{}, len(modelNames))
	for _, modelName := range modelNames {
		modelSet[strings.TrimSpace(modelName)] = struct{}{}
	}

	promotions := make([]TimePricingPromotion, 0)
	for _, rule := range config.Rules {
		rule = NormalizeTimePricingRule(rule)
		if !rule.Enabled || !rule.UserVisible {
			continue
		}
		if !timePricingRuleOverlapsPreview(rule, now, previewEnd) {
			continue
		}
		if !timePricingRuleVisibleForUser(rule, group, modelSet) {
			continue
		}
		promotions = append(promotions, TimePricingPromotion{
			Id:              rule.Id,
			Name:            rule.Name,
			UserTitle:       rule.UserTitle,
			UserDescription: rule.UserDescription,
			StartDate:       rule.StartDate,
			EndDate:         rule.EndDate,
			DailyStartTime:  rule.DailyStartTime,
			DailyEndTime:    rule.DailyEndTime,
			DaysOfWeek:      append([]int(nil), rule.DaysOfWeek...),
			ScopeType:       rule.ScopeType,
			Groups:          append([]string(nil), rule.Groups...),
			Models:          append([]string(nil), rule.Models...),
			Multiplier:      rule.Multiplier,
			Priority:        rule.Priority,
			Status:          TimePricingRuleStatus(rule, now),
		})
	}
	sort.SliceStable(promotions, func(i, j int) bool {
		if promotions[i].Status != promotions[j].Status {
			return promotions[i].Status == "active"
		}
		if promotions[i].StartDate != promotions[j].StartDate {
			return promotions[i].StartDate < promotions[j].StartDate
		}
		if promotions[i].Priority != promotions[j].Priority {
			return promotions[i].Priority > promotions[j].Priority
		}
		return promotions[i].Id < promotions[j].Id
	})
	return promotions
}

func timePricingRuleOverlapsPreview(rule TimePricingRule, now time.Time, previewEnd time.Time) bool {
	loc, err := time.LoadLocation(rule.Timezone)
	if err != nil {
		return false
	}
	startDate, err := parseTimePricingDate(rule.StartDate)
	if err != nil {
		return false
	}
	endDate, err := parseTimePricingDate(rule.EndDate)
	if err != nil {
		return false
	}
	startLocal := dateInLocation(startDate, loc)
	endLocal := dateInLocation(endDate, loc).Add(24*time.Hour - time.Nanosecond)
	return !endLocal.Before(now.In(loc)) && !startLocal.After(previewEnd.In(loc))
}

func timePricingRuleVisibleForUser(rule TimePricingRule, group string, modelSet map[string]struct{}) bool {
	switch rule.ScopeType {
	case TimePricingScopeAll:
		return true
	case TimePricingScopeGroup:
		return containsExact(rule.Groups, group)
	case TimePricingScopeModel:
		return anyItemInSet(rule.Models, modelSet)
	case TimePricingScopeGroupModel:
		return containsExact(rule.Groups, group) && anyItemInSet(rule.Models, modelSet)
	default:
		return false
	}
}

func anyItemInSet(items []string, set map[string]struct{}) bool {
	for _, item := range items {
		if _, ok := set[item]; ok {
			return true
		}
	}
	return false
}

func timePricingRuleMatches(rule TimePricingRule, group string, modelName string, at time.Time) bool {
	rule = NormalizeTimePricingRule(rule)
	if err := ValidateTimePricingRule(rule); err != nil {
		return false
	}
	if !timePricingScopeMatches(rule, group, modelName) {
		return false
	}
	return timePricingDateTimeMatches(rule, at)
}

func timePricingDateTimeMatches(rule TimePricingRule, at time.Time) bool {
	rule = NormalizeTimePricingRule(rule)
	loc, err := time.LoadLocation(rule.Timezone)
	if err != nil {
		return false
	}
	localTime := at.In(loc)
	activeDate := localTime
	crossDay := ruleCrossesDay(rule)
	if crossDay {
		currentMinute := localTime.Hour()*60 + localTime.Minute()
		endMinute, _ := parseTimePricingClock(rule.DailyEndTime)
		if currentMinute < endMinute {
			activeDate = activeDate.AddDate(0, 0, -1)
		}
	}
	startDate, _ := parseTimePricingDate(rule.StartDate)
	endDate, _ := parseTimePricingDate(rule.EndDate)
	currentDate := dateOnlyInLocation(activeDate, loc)
	if currentDate.Before(dateInLocation(startDate, loc)) || currentDate.After(dateInLocation(endDate, loc)) {
		return false
	}
	if !weekdayAllowed(int(activeDate.Weekday()), rule.DaysOfWeek) {
		return false
	}
	if rule.DailyStartTime == "" && rule.DailyEndTime == "" {
		return true
	}
	startMinute, _ := parseTimePricingClock(rule.DailyStartTime)
	endMinute, _ := parseTimePricingClock(rule.DailyEndTime)
	currentMinute := localTime.Hour()*60 + localTime.Minute()
	if startMinute < endMinute {
		return currentMinute >= startMinute && currentMinute < endMinute
	}
	return currentMinute >= startMinute || currentMinute < endMinute
}

func timePricingScopeMatches(rule TimePricingRule, group string, modelName string) bool {
	switch rule.ScopeType {
	case TimePricingScopeAll:
		return true
	case TimePricingScopeGroup:
		return containsExact(rule.Groups, group)
	case TimePricingScopeModel:
		return containsExact(rule.Models, modelName)
	case TimePricingScopeGroupModel:
		return containsExact(rule.Groups, group) && containsExact(rule.Models, modelName)
	default:
		return false
	}
}

func timePricingRuleLess(a TimePricingRule, b TimePricingRule) bool {
	if a.Priority != b.Priority {
		return a.Priority > b.Priority
	}
	if sa, sb := timePricingScopeSpecificity(a.ScopeType), timePricingScopeSpecificity(b.ScopeType); sa != sb {
		return sa > sb
	}
	if a.Multiplier != b.Multiplier {
		return a.Multiplier < b.Multiplier
	}
	if a.CreatedAt != b.CreatedAt {
		return a.CreatedAt < b.CreatedAt
	}
	return a.Id < b.Id
}

func timePricingScopeSpecificity(scope string) int {
	switch scope {
	case TimePricingScopeGroupModel:
		return 4
	case TimePricingScopeModel:
		return 3
	case TimePricingScopeGroup:
		return 2
	case TimePricingScopeAll:
		return 1
	default:
		return 0
	}
}

func ruleCrossesDay(rule TimePricingRule) bool {
	if rule.DailyStartTime == "" || rule.DailyEndTime == "" {
		return false
	}
	startMinute, err1 := parseTimePricingClock(rule.DailyStartTime)
	endMinute, err2 := parseTimePricingClock(rule.DailyEndTime)
	return err1 == nil && err2 == nil && startMinute > endMinute
}

func parseTimePricingDate(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, errors.New("日期不能为空")
	}
	return time.Parse("2006-01-02", value)
}

func parseTimePricingClock(value string) (int, error) {
	parsed, err := time.Parse("15:04", strings.TrimSpace(value))
	if err != nil {
		return 0, err
	}
	return parsed.Hour()*60 + parsed.Minute(), nil
}

func dateInLocation(date time.Time, loc *time.Location) time.Time {
	return time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, loc)
}

func dateOnlyInLocation(t time.Time, loc *time.Location) time.Time {
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
}

func normalizeTimePricingScope(scope string) string {
	switch strings.TrimSpace(scope) {
	case TimePricingScopeGroup, TimePricingScopeModel, TimePricingScopeGroupModel:
		return strings.TrimSpace(scope)
	default:
		return TimePricingScopeAll
	}
}

func normalizeTimePricingItems(items []string, limit int) []string {
	seen := make(map[string]struct{}, len(items))
	result := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		result = append(result, item)
		if len(result) >= limit {
			break
		}
	}
	sort.Strings(result)
	return result
}

func normalizeWeekdays(days []int) []int {
	seen := make(map[int]struct{}, len(days))
	result := make([]int, 0, len(days))
	for _, day := range days {
		if day < 0 || day > 6 {
			continue
		}
		if _, ok := seen[day]; ok {
			continue
		}
		seen[day] = struct{}{}
		result = append(result, day)
	}
	sort.Ints(result)
	return result
}

func weekdayAllowed(day int, days []int) bool {
	for _, allowed := range days {
		if allowed == day {
			return true
		}
	}
	return false
}

func containsExact(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func hasMoreThanFourDecimals(value float64) bool {
	scaled := value * 10000
	return math.Abs(scaled-math.Round(scaled)) > 0.0000001
}

func limitRuneString(value string, limit int) string {
	if limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func displayTimePricingRuleName(rule TimePricingRule, index int) string {
	if rule.Name != "" {
		return rule.Name
	}
	if rule.Id != "" {
		return rule.Id
	}
	return fmt.Sprintf("#%d", index+1)
}
