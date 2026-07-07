package model

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	NameRuleExact = iota
	NameRulePrefix
	NameRuleContains
	NameRuleSuffix
)

type BoundChannel struct {
	Name string `json:"name"`
	Type int    `json:"type"`
}

type Model struct {
	Id                  int            `json:"id"`
	ModelName           string         `json:"model_name" gorm:"size:128;not null;uniqueIndex:uk_model_name_delete_at,priority:1"`
	Description         string         `json:"description,omitempty" gorm:"type:text"`
	Icon                string         `json:"icon,omitempty" gorm:"type:varchar(128)"`
	Tags                string         `json:"tags,omitempty" gorm:"type:varchar(255)"`
	VendorID            int            `json:"vendor_id,omitempty" gorm:"index"`
	Endpoints           string         `json:"endpoints,omitempty" gorm:"type:text"`
	DisplayName         string         `json:"display_name,omitempty" gorm:"size:128"`
	DisplayOrder        int            `json:"display_order" gorm:"default:0;index"`
	AvailabilityEnabled int            `json:"availability_enabled" gorm:"default:1;index"`
	Status              int            `json:"status" gorm:"default:1"`
	SyncOfficial        int            `json:"sync_official" gorm:"default:1"`
	CreatedTime         int64          `json:"created_time" gorm:"bigint"`
	UpdatedTime         int64          `json:"updated_time" gorm:"bigint"`
	DeletedAt           gorm.DeletedAt `json:"-" gorm:"index;uniqueIndex:uk_model_name_delete_at,priority:2"`

	BoundChannels []BoundChannel `json:"bound_channels,omitempty" gorm:"-"`
	EnableGroups  []string       `json:"enable_groups,omitempty" gorm:"-"`
	QuotaTypes    []int          `json:"quota_types,omitempty" gorm:"-"`
	NameRule      int            `json:"name_rule" gorm:"default:0"`

	MatchedModels []string `json:"matched_models,omitempty" gorm:"-"`
	MatchedCount  int      `json:"matched_count,omitempty" gorm:"-"`
}

func (mi *Model) Insert() error {
	now := common.GetTimestamp()
	mi.CreatedTime = now
	mi.UpdatedTime = now

	// 保存原始值（因为 Create 后可能被 GORM 的 default 标签覆盖为 1）
	originalStatus := mi.Status
	originalSyncOfficial := mi.SyncOfficial
	originalAvailabilityEnabled := mi.AvailabilityEnabled

	// 先创建记录（GORM 会对零值字段应用默认值）
	if err := DB.Create(mi).Error; err != nil {
		return err
	}

	// 使用保存的原始值进行更新，确保零值能正确保存
	return DB.Model(&Model{}).Where("id = ?", mi.Id).Updates(map[string]interface{}{
		"status":               originalStatus,
		"sync_official":        originalSyncOfficial,
		"availability_enabled": originalAvailabilityEnabled,
	}).Error
}

func IsModelNameDuplicated(id int, name string) (bool, error) {
	if name == "" {
		return false, nil
	}
	var cnt int64
	err := DB.Model(&Model{}).Where("model_name = ? AND id <> ?", name, id).Count(&cnt).Error
	return cnt > 0, err
}

func (mi *Model) Update() error {
	mi.UpdatedTime = common.GetTimestamp()
	// 使用 Select 强制更新所有字段，包括零值
	return DB.Model(&Model{}).Where("id = ?", mi.Id).
		Select("model_name", "description", "icon", "tags", "vendor_id", "endpoints", "display_name", "display_order", "availability_enabled", "status", "sync_official", "name_rule", "updated_time").
		Updates(mi).Error
}

func (mi *Model) Delete() error {
	return DB.Delete(mi).Error
}

func GetVendorModelCounts() (map[int64]int64, error) {
	var stats []struct {
		VendorID int64
		Count    int64
	}
	if err := DB.Model(&Model{}).
		Select("vendor_id as vendor_id, count(*) as count").
		Group("vendor_id").
		Scan(&stats).Error; err != nil {
		return nil, err
	}
	m := make(map[int64]int64, len(stats))
	for _, s := range stats {
		m[s.VendorID] = s.Count
	}
	return m, nil
}

func GetAllModels(offset int, limit int) ([]*Model, error) {
	var models []*Model
	err := DB.Order("id DESC").Offset(offset).Limit(limit).Find(&models).Error
	return models, err
}

func GetBoundChannelsByModelsMap(modelNames []string) (map[string][]BoundChannel, error) {
	result := make(map[string][]BoundChannel)
	if len(modelNames) == 0 {
		return result, nil
	}
	type row struct {
		Model string
		Name  string
		Type  int
	}
	var rows []row
	err := DB.Table("channels").
		Select("abilities.model as model, channels.name as name, channels.type as type").
		Joins("JOIN abilities ON abilities.channel_id = channels.id").
		Where("abilities.model IN ? AND abilities.enabled = ?", modelNames, true).
		Distinct().
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		result[r.Model] = append(result[r.Model], BoundChannel{Name: r.Name, Type: r.Type})
	}
	return result, nil
}

func normalizeLookupValues(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}
	return normalized
}

func GetPreferredModelOwnerChannelTypes(modelNames []string, groups []string) (map[string]int, error) {
	result := make(map[string]int)
	modelNames = normalizeLookupValues(modelNames)
	if len(modelNames) == 0 {
		return result, nil
	}

	type row struct {
		Model       string
		ChannelType int
	}
	var rows []row

	query := DB.Table("abilities").
		Select("abilities.model as model, channels.type as channel_type").
		Joins("JOIN channels ON abilities.channel_id = channels.id").
		Where("abilities.model IN ? AND abilities.enabled = ? AND channels.status = ?", modelNames, true, common.ChannelStatusEnabled).
		Order("COALESCE(abilities.priority, 0) DESC").
		Order("abilities.weight DESC").
		Order("abilities.channel_id ASC")

	groups = normalizeLookupValues(groups)
	if len(groups) > 0 {
		query = query.Where("abilities."+commonGroupCol+" IN ?", groups)
	}

	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}

	for _, r := range rows {
		if _, ok := result[r.Model]; ok {
			continue
		}
		result[r.Model] = r.ChannelType
	}
	return result, nil
}

type ModelAvailabilityMeta struct {
	ModelName    string
	DisplayName  string
	DisplayOrder int
}

func GetModelAvailabilityMetaMap(modelNames []string) (map[string]ModelAvailabilityMeta, error) {
	result := make(map[string]ModelAvailabilityMeta)
	modelNames = normalizeLookupValues(modelNames)
	if len(modelNames) == 0 {
		return result, nil
	}

	var metas []Model
	if err := DB.Order("display_order ASC").Order("id ASC").Find(&metas).Error; err != nil {
		return nil, err
	}

	exactMetas := make(map[string]*Model)
	ruleMetas := make([]*Model, 0)
	for i := range metas {
		meta := &metas[i]
		if strings.TrimSpace(meta.ModelName) == "" {
			continue
		}
		if meta.NameRule == NameRuleExact {
			exactMetas[meta.ModelName] = meta
			continue
		}
		ruleMetas = append(ruleMetas, meta)
	}

	for _, modelName := range modelNames {
		var selected *Model
		if meta, ok := exactMetas[modelName]; ok {
			selected = meta
		} else {
			for _, meta := range ruleMetas {
				matched := false
				switch meta.NameRule {
				case NameRulePrefix:
					matched = strings.HasPrefix(modelName, meta.ModelName)
				case NameRuleSuffix:
					matched = strings.HasSuffix(modelName, meta.ModelName)
				case NameRuleContains:
					matched = strings.Contains(modelName, meta.ModelName)
				}
				if matched {
					selected = meta
					break
				}
			}
		}
		if selected == nil {
			// 未维护模型元数据时保持旧行为：继续展示原模型名。
			// 只有管理员明确配置并关闭可用性展示时，才从用户侧性能/状态视图隐藏。
			result[modelName] = ModelAvailabilityMeta{
				ModelName:    modelName,
				DisplayName:  modelName,
				DisplayOrder: 0,
			}
			continue
		}
		if selected.Status != 1 || selected.AvailabilityEnabled != 1 {
			continue
		}
		displayName := strings.TrimSpace(selected.DisplayName)
		if displayName == "" {
			displayName = modelName
		}
		result[modelName] = ModelAvailabilityMeta{
			ModelName:    modelName,
			DisplayName:  displayName,
			DisplayOrder: selected.DisplayOrder,
		}
	}
	return result, nil
}

func SearchModels(keyword string, vendor string, offset int, limit int) ([]*Model, int64, error) {
	var models []*Model
	db := DB.Model(&Model{})
	if keyword != "" {
		like := "%" + keyword + "%"
		db = db.Where("model_name LIKE ? OR display_name LIKE ? OR description LIKE ? OR tags LIKE ?", like, like, like, like)
	}
	if vendor != "" {
		if vid, err := strconv.Atoi(vendor); err == nil {
			db = db.Where("models.vendor_id = ?", vid)
		} else {
			db = db.Joins("JOIN vendors ON vendors.id = models.vendor_id").Where("vendors.name LIKE ?", "%"+vendor+"%")
		}
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := db.Order("models.id DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, 0, err
	}
	return models, total, nil
}
