package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ChannelAlertEvent struct {
	Id              int    `json:"id"`
	ChannelId       int    `json:"channel_id" gorm:"index;index:idx_channel_alert_lookup,priority:1"`
	ChannelName     string `json:"channel_name" gorm:"type:varchar(191)"`
	ChannelType     int    `json:"channel_type" gorm:"index"`
	Source          string `json:"source" gorm:"type:varchar(32);index"`
	RuleKey         string `json:"rule_key" gorm:"type:varchar(191);index;index:idx_channel_alert_lookup,priority:2"`
	StatusCode      int    `json:"status_code" gorm:"index"`
	ErrorCode       string `json:"error_code" gorm:"type:varchar(191);index"`
	ErrorType       string `json:"error_type" gorm:"type:varchar(64)"`
	ModelName       string `json:"model_name" gorm:"type:varchar(191);index"`
	GroupName       string `json:"group_name" gorm:"type:varchar(191);index"`
	RequestPath     string `json:"request_path" gorm:"type:varchar(255);index"`
	RequestId       string `json:"request_id" gorm:"type:varchar(64);index"`
	ErrorPreview    string `json:"error_preview" gorm:"type:text"`
	AlertSent       bool   `json:"alert_sent" gorm:"index"`
	EmailRecipients string `json:"email_recipients" gorm:"type:text"`
	CreatedAt       int64  `json:"created_at" gorm:"bigint;index;index:idx_channel_alert_lookup,priority:3"`
}

type ChannelAlertState struct {
	Id             int    `json:"id"`
	ChannelId      int    `json:"channel_id" gorm:"uniqueIndex:idx_channel_alert_state_rule,priority:1;index"`
	RuleKey        string `json:"rule_key" gorm:"type:varchar(191);uniqueIndex:idx_channel_alert_state_rule,priority:2;index"`
	Active         bool   `json:"active" gorm:"index"`
	LastAlertAt    int64  `json:"last_alert_at" gorm:"bigint;index"`
	LastRecoveryAt int64  `json:"last_recovery_at" gorm:"bigint;index"`
	LastEventId    int    `json:"last_event_id"`
	WindowCount    int    `json:"window_count"`
	UpdatedAt      int64  `json:"updated_at" gorm:"bigint;index"`
}

type ChannelAlertEventFilter struct {
	ChannelId int
	Source    string
	RuleKey   string
	StartTime int64
	EndTime   int64
}

func CreateChannelAlertEvent(event *ChannelAlertEvent) error {
	if event.CreatedAt == 0 {
		event.CreatedAt = common.GetTimestamp()
	}
	return DB.Create(event).Error
}

func CountRecentChannelAlertEvents(channelId int, ruleKey string, since int64) (int64, error) {
	var total int64
	err := DB.Model(&ChannelAlertEvent{}).
		Where("channel_id = ? AND rule_key = ? AND created_at >= ?", channelId, ruleKey, since).
		Count(&total).Error
	return total, err
}

func MarkChannelAlertEventSent(id int, recipients string) error {
	return DB.Model(&ChannelAlertEvent{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"alert_sent":       true,
			"email_recipients": recipients,
		}).Error
}

func DeleteExpiredChannelAlertEvents(cutoff int64) error {
	return DB.Where("created_at < ?", cutoff).Delete(&ChannelAlertEvent{}).Error
}

func GetChannelAlertState(channelId int, ruleKey string) (*ChannelAlertState, error) {
	state := &ChannelAlertState{}
	err := DB.Where("channel_id = ? AND rule_key = ?", channelId, ruleKey).
		First(state).Error
	return state, err
}

func FirstOrCreateChannelAlertState(tx *gorm.DB, channelId int, ruleKey string) (*ChannelAlertState, error) {
	state := &ChannelAlertState{}
	err := tx.Where("channel_id = ? AND rule_key = ?", channelId, ruleKey).
		First(state).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		state.ChannelId = channelId
		state.RuleKey = ruleKey
		state.UpdatedAt = common.GetTimestamp()
		if createErr := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(state).Error; createErr != nil {
			return state, createErr
		}
		err = tx.Where("channel_id = ? AND rule_key = ?", channelId, ruleKey).
			First(state).Error
		return state, err
	}
	return state, err
}

func UpdateChannelAlertState(tx *gorm.DB, state *ChannelAlertState) error {
	state.UpdatedAt = common.GetTimestamp()
	return tx.Save(state).Error
}

func ListActiveChannelAlertStates(channelId int) ([]ChannelAlertState, error) {
	var states []ChannelAlertState
	err := DB.Where("channel_id = ? AND active = ?", channelId, true).
		Order("id desc").
		Find(&states).Error
	return states, err
}

func buildChannelAlertEventQuery(filter ChannelAlertEventFilter) *gorm.DB {
	query := DB.Model(&ChannelAlertEvent{})
	if filter.ChannelId > 0 {
		query = query.Where("channel_id = ?", filter.ChannelId)
	}
	if filter.Source != "" {
		query = query.Where("source = ?", filter.Source)
	}
	if filter.RuleKey != "" {
		query = query.Where("rule_key = ?", filter.RuleKey)
	}
	if filter.StartTime > 0 {
		query = query.Where("created_at >= ?", filter.StartTime)
	}
	if filter.EndTime > 0 {
		query = query.Where("created_at <= ?", filter.EndTime)
	}
	return query
}

func ListChannelAlertEvents(filter ChannelAlertEventFilter, startIdx int, num int) ([]ChannelAlertEvent, int64, error) {
	var total int64
	if err := buildChannelAlertEventQuery(filter).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var events []ChannelAlertEvent
	err := buildChannelAlertEventQuery(filter).
		Order("id desc").
		Limit(num).
		Offset(startIdx).
		Find(&events).Error
	return events, total, err
}

func ListChannelAlertStates(channelId int, onlyActive bool, startIdx int, num int) ([]ChannelAlertState, int64, error) {
	query := DB.Model(&ChannelAlertState{})
	if channelId > 0 {
		query = query.Where("channel_id = ?", channelId)
	}
	if onlyActive {
		query = query.Where("active = ?", true)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var states []ChannelAlertState
	err := query.Order("updated_at desc, id desc").
		Limit(num).
		Offset(startIdx).
		Find(&states).Error
	return states, total, err
}
