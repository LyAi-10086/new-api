package model

import (
	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type SensitiveViolation struct {
	Id             int    `json:"id"`
	UserId         int    `json:"user_id" gorm:"index"`
	TokenId        int    `json:"token_id" gorm:"index"`
	ModelName      string `json:"model_name" gorm:"type:varchar(255);index"`
	GroupName      string `json:"group_name" gorm:"type:varchar(64);index"`
	MatchedWords   string `json:"matched_words" gorm:"type:text"`
	Content        string `json:"content,omitempty" gorm:"type:text"`
	ContentPreview string `json:"content_preview" gorm:"type:text"`
	RequestPath    string `json:"request_path" gorm:"type:varchar(255);index"`
	RequestId      string `json:"request_id" gorm:"type:varchar(64);index"`
	Ip             string `json:"ip" gorm:"type:varchar(64);index"`
	ActionResult   string `json:"action_result" gorm:"type:varchar(255)"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;index"`
}

type SensitiveViolationFilter struct {
	UserId    int
	TokenId   int
	ModelName string
	GroupName string
	StartTime int64
	EndTime   int64
}

func CreateSensitiveViolation(violation *SensitiveViolation) error {
	if violation.CreatedAt == 0 {
		violation.CreatedAt = common.GetTimestamp()
	}
	return DB.Create(violation).Error
}

func UpdateSensitiveViolationActionResult(id int, actionResult string) error {
	return DB.Model(&SensitiveViolation{}).Where("id = ?", id).Update("action_result", actionResult).Error
}

func buildSensitiveViolationQuery(filter SensitiveViolationFilter) *gorm.DB {
	query := DB.Model(&SensitiveViolation{})
	if filter.UserId > 0 {
		query = query.Where("user_id = ?", filter.UserId)
	}
	if filter.TokenId > 0 {
		query = query.Where("token_id = ?", filter.TokenId)
	}
	if filter.ModelName != "" {
		query = query.Where("model_name = ?", filter.ModelName)
	}
	if filter.GroupName != "" {
		query = query.Where("group_name = ?", filter.GroupName)
	}
	if filter.StartTime > 0 {
		query = query.Where("created_at >= ?", filter.StartTime)
	}
	if filter.EndTime > 0 {
		query = query.Where("created_at <= ?", filter.EndTime)
	}
	return query
}

func CountSensitiveViolations(filter SensitiveViolationFilter) (int64, error) {
	var total int64
	err := buildSensitiveViolationQuery(filter).Count(&total).Error
	return total, err
}

func ListSensitiveViolations(filter SensitiveViolationFilter, startIdx int, num int) ([]SensitiveViolation, int64, error) {
	var violations []SensitiveViolation
	total, err := CountSensitiveViolations(filter)
	if err != nil {
		return nil, 0, err
	}
	err = buildSensitiveViolationQuery(filter).
		Omit("content").
		Order("id desc").
		Limit(num).
		Offset(startIdx).
		Find(&violations).Error
	if err != nil {
		return nil, 0, err
	}
	return violations, total, nil
}

func GetSensitiveViolationById(id int) (*SensitiveViolation, error) {
	var violation SensitiveViolation
	err := DB.First(&violation, "id = ?", id).Error
	return &violation, err
}

func CountSensitiveViolationsByUserId(userId int) (int64, error) {
	var total int64
	err := DB.Model(&SensitiveViolation{}).Where("user_id = ?", userId).Count(&total).Error
	return total, err
}

func CountSensitiveViolationsByTokenId(tokenId int) (int64, error) {
	var total int64
	err := DB.Model(&SensitiveViolation{}).Where("token_id = ?", tokenId).Count(&total).Error
	return total, err
}
