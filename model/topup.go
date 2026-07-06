package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type TopUp struct {
	Id              int     `json:"id"`
	UserId          int     `json:"user_id" gorm:"index"`
	Amount          int64   `json:"amount"`
	Money           float64 `json:"money"`
	TradeNo         string  `json:"trade_no" gorm:"unique;type:varchar(255);index"`
	PaymentMethod   string  `json:"payment_method" gorm:"type:varchar(50)"`
	PaymentProvider string  `json:"payment_provider" gorm:"type:varchar(50);default:''"`
	CreateTime      int64   `json:"create_time"`
	CompleteTime    int64   `json:"complete_time"`
	Status          string  `json:"status"`
}

const (
	PaymentMethodStripe       = "stripe"
	PaymentMethodCreem        = "creem"
	PaymentMethodWaffo        = "waffo"
	PaymentMethodWaffoPancake = "waffo_pancake"
	PaymentMethodBalance      = "balance"
)

const (
	PaymentProviderEpay         = "epay"
	PaymentProviderStripe       = "stripe"
	PaymentProviderCreem        = "creem"
	PaymentProviderWaffo        = "waffo"
	PaymentProviderWaffoPancake = "waffo_pancake"
	PaymentProviderBalance      = "balance"
)

var (
	ErrPaymentMethodMismatch = errors.New("payment method mismatch")
	ErrTopUpNotFound         = errors.New("topup not found")
	ErrTopUpStatusInvalid    = errors.New("topup status invalid")
)

func (topUp *TopUp) Insert() error {
	var err error
	err = DB.Create(topUp).Error
	return err
}

func (topUp *TopUp) Update() error {
	var err error
	err = DB.Save(topUp).Error
	return err
}

func GetTopUpById(id int) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("id = ?", id).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func GetTopUpByTradeNo(tradeNo string) *TopUp {
	var topUp *TopUp
	var err error
	err = DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if err != nil {
		return nil
	}
	return topUp
}

func UpdatePendingTopUpStatus(tradeNo string, expectedPaymentProvider string, targetStatus string) error {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if expectedPaymentProvider != "" && topUp.PaymentProvider != expectedPaymentProvider {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}

		topUp.Status = targetStatus
		return tx.Save(topUp).Error
	})
}

func CompleteEpayTopUp(tradeNo string, actualPaymentMethod string) (*TopUp, int, error) {
	if tradeNo == "" {
		return nil, 0, errors.New("未提供支付单号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	topUp := &TopUp{}
	quotaToAdd := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return ErrTopUpNotFound
		}
		if topUp.PaymentProvider != PaymentProviderEpay {
			return ErrPaymentMethodMismatch
		}
		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}
		if topUp.Status != common.TopUpStatusPending {
			return ErrTopUpStatusInvalid
		}

		if actualPaymentMethod != "" {
			topUp.PaymentMethod = actualPaymentMethod
		}
		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		dAmount := decimal.NewFromInt(topUp.Amount)
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		quotaToAdd = int(dAmount.Mul(dQuotaPerUnit).IntPart())
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}
		return CreateAffiliateCommissionForTopUpTx(tx, topUp, quotaToAdd, topUp.PaymentProvider)
	})
	if err == nil && quotaToAdd > 0 {
		userId := topUp.UserId
		gopool.Go(func() {
			if cacheErr := cacheIncrUserQuota(userId, int64(quotaToAdd)); cacheErr != nil {
				common.SysLog("failed to increase user quota cache after epay topup: " + cacheErr.Error())
			}
		})
	}
	return topUp, quotaToAdd, err
}

func Recharge(referenceId string, customerId string, callerIp string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	var quota float64
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderStripe {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		err = tx.Save(topUp).Error
		if err != nil {
			return err
		}

		quota = topUp.Money * common.QuotaPerUnit
		err = tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(map[string]interface{}{"stripe_customer": customerId, "quota": gorm.Expr("quota + ?", quota)}).Error
		if err != nil {
			return err
		}

		if err := CreateAffiliateCommissionForTopUpTx(tx, topUp, int(quota), topUp.PaymentProvider); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	RecordTopupLog(topUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%d", logger.FormatQuota(int(quota)), topUp.Amount), callerIp, topUp.PaymentMethod, PaymentMethodStripe)

	return nil
}

// topUpQueryWindowSeconds 限制充值记录查询的时间窗口（秒）。
const topUpQueryWindowSeconds int64 = 30 * 24 * 60 * 60

// topUpQueryCutoff 返回允许查询的最早 create_time（秒级 Unix 时间戳）。
func topUpQueryCutoff() int64 {
	return common.GetTimestamp() - topUpQueryWindowSeconds
}

func GetUserTopUps(userId int, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	// Start transaction
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	cutoff := topUpQueryCutoff()

	// Get total count within transaction
	err = tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, cutoff).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Get paginated topups within same transaction
	err = tx.Where("user_id = ? AND create_time >= ?", userId, cutoff).Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// Commit transaction
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// GetAllTopUps 获取全平台的充值记录（管理员使用，不限制时间窗口）
func GetAllTopUps(pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err = tx.Model(&TopUp{}).Count(&total).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return topups, total, nil
}

// searchTopUpCountHardLimit 搜索充值记录时 COUNT 的安全上限，
// 防止对超大表执行无界 COUNT 触发 DoS。
const searchTopUpCountHardLimit = 10000

// SearchUserTopUps 按订单号搜索某用户的充值记录
func SearchUserTopUps(userId int, keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{}).Where("user_id = ? AND create_time >= ?", userId, topUpQueryCutoff())
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// SearchAllTopUps 按订单号搜索全平台充值记录（管理员使用，不限制时间窗口）
func SearchAllTopUps(keyword string, pageInfo *common.PageInfo) (topups []*TopUp, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := tx.Model(&TopUp{})
	if keyword != "" {
		pattern, perr := sanitizeLikePattern(keyword)
		if perr != nil {
			tx.Rollback()
			return nil, 0, perr
		}
		query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
	}

	if err = query.Limit(searchTopUpCountHardLimit).Count(&total).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to count search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = query.Order("id desc").Limit(pageInfo.GetPageSize()).Offset(pageInfo.GetStartIdx()).Find(&topups).Error; err != nil {
		tx.Rollback()
		common.SysError("failed to search topups: " + err.Error())
		return nil, 0, errors.New("搜索充值记录失败")
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}
	return topups, total, nil
}

// ManualCompleteTopUp 管理员手动完成订单并给用户充值
func ManualCompleteTopUp(tradeNo string, callerIp string) error {
	if tradeNo == "" {
		return errors.New("未提供订单号")
	}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	var userId int
	var quotaToAdd int
	var payMoney float64
	var paymentMethod string

	err := DB.Transaction(func(tx *gorm.DB) error {
		topUp := &TopUp{}
		// 行级锁，避免并发补单
		if err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error; err != nil {
			return errors.New("充值订单不存在")
		}

		// 幂等处理：已成功直接返回
		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("订单状态不是待支付，无法补单")
		}

		// 计算应充值额度：
		// - Stripe 订单：Money 代表经分组倍率换算后的美元数量，直接 * QuotaPerUnit
		// - 其他订单（如易支付）：Amount 为美元数量，* QuotaPerUnit
		if topUp.PaymentProvider == PaymentProviderStripe {
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			quotaToAdd = int(decimal.NewFromFloat(topUp.Money).Mul(dQuotaPerUnit).IntPart())
		} else {
			dAmount := decimal.NewFromInt(topUp.Amount)
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			quotaToAdd = int(dAmount.Mul(dQuotaPerUnit).IntPart())
		}
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		// 标记完成
		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		// 增加用户额度（立即写库，保持一致性）
		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}

		if err := CreateAffiliateCommissionForTopUpTx(tx, topUp, quotaToAdd, AffiliateCommissionSourceAdmin); err != nil {
			return err
		}

		userId = topUp.UserId
		payMoney = topUp.Money
		paymentMethod = topUp.PaymentMethod
		return nil
	})

	if err != nil {
		return err
	}

	// 事务外记录日志，避免阻塞
	RecordTopupLog(userId, fmt.Sprintf("管理员补单成功，充值金额: %v，支付金额：%f", logger.FormatQuota(quotaToAdd), payMoney), callerIp, paymentMethod, "admin")
	return nil
}
func RechargeCreem(referenceId string, customerEmail string, customerName string, callerIp string) (err error) {
	if referenceId == "" {
		return errors.New("未提供支付单号")
	}

	var quota int64
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", referenceId).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderCreem {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		err = tx.Save(topUp).Error
		if err != nil {
			return err
		}

		// Creem 直接使用 Amount 作为充值额度（整数）
		quota = topUp.Amount

		// 构建更新字段，优先使用邮箱，如果邮箱为空则使用用户名
		updateFields := map[string]interface{}{
			"quota": gorm.Expr("quota + ?", quota),
		}

		// 如果有客户邮箱，尝试更新用户邮箱（仅当用户邮箱为空时）
		if customerEmail != "" {
			// 先检查用户当前邮箱是否为空
			var user User
			err = tx.Where("id = ?", topUp.UserId).First(&user).Error
			if err != nil {
				return err
			}

			// 如果用户邮箱为空，则更新为支付时使用的邮箱
			if user.Email == "" {
				updateFields["email"] = customerEmail
			}
		}

		err = tx.Model(&User{}).Where("id = ?", topUp.UserId).Updates(updateFields).Error
		if err != nil {
			return err
		}

		if err := CreateAffiliateCommissionForTopUpTx(tx, topUp, int(quota), topUp.PaymentProvider); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("creem topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	RecordTopupLog(topUp.UserId, fmt.Sprintf("使用Creem充值成功，充值额度: %v，支付金额：%.2f", quota, topUp.Money), callerIp, topUp.PaymentMethod, PaymentMethodCreem)

	return nil
}

func RechargeWaffo(tradeNo string, callerIp string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	var quotaToAdd int
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderWaffo {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess {
			return nil // 幂等：已成功直接返回
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		dAmount := decimal.NewFromInt(topUp.Amount)
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		quotaToAdd = int(dAmount.Mul(dQuotaPerUnit).IntPart())
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}

		if err := CreateAffiliateCommissionForTopUpTx(tx, topUp, quotaToAdd, topUp.PaymentProvider); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("waffo topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	if quotaToAdd > 0 {
		RecordTopupLog(topUp.UserId, fmt.Sprintf("Waffo充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(quotaToAdd), topUp.Money), callerIp, topUp.PaymentMethod, PaymentMethodWaffo)
	}

	return nil
}

func RechargeWaffoPancake(tradeNo string) (err error) {
	if tradeNo == "" {
		return errors.New("未提供支付单号")
	}

	var quotaToAdd int
	topUp := &TopUp{}

	refCol := "`trade_no`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		refCol = `"trade_no"`
	}

	err = DB.Transaction(func(tx *gorm.DB) error {
		err := tx.Set("gorm:query_option", "FOR UPDATE").Where(refCol+" = ?", tradeNo).First(topUp).Error
		if err != nil {
			return errors.New("充值订单不存在")
		}

		if topUp.PaymentProvider != PaymentProviderWaffoPancake {
			return ErrPaymentMethodMismatch
		}

		if topUp.Status == common.TopUpStatusSuccess {
			return nil
		}

		if topUp.Status != common.TopUpStatusPending {
			return errors.New("充值订单状态错误")
		}

		quotaToAdd = int(decimal.NewFromInt(topUp.Amount).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart())
		if quotaToAdd <= 0 {
			return errors.New("无效的充值额度")
		}

		topUp.CompleteTime = common.GetTimestamp()
		topUp.Status = common.TopUpStatusSuccess
		if err := tx.Save(topUp).Error; err != nil {
			return err
		}

		if err := tx.Model(&User{}).Where("id = ?", topUp.UserId).Update("quota", gorm.Expr("quota + ?", quotaToAdd)).Error; err != nil {
			return err
		}

		if err := CreateAffiliateCommissionForTopUpTx(tx, topUp, quotaToAdd, topUp.PaymentProvider); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		common.SysError("waffo pancake topup failed: " + err.Error())
		return errors.New("充值失败，请稍后重试")
	}

	if quotaToAdd > 0 {
		RecordLog(topUp.UserId, LogTypeTopup, fmt.Sprintf("Waffo Pancake充值成功，充值额度: %v，支付金额: %.2f", logger.FormatQuota(quotaToAdd), topUp.Money))
	}

	return nil
}

const (
	AffiliateCommissionStatusPending     = "pending"
	AffiliateCommissionStatusAvailable   = "available"
	AffiliateCommissionStatusTransferred = "transferred"
	AffiliateCommissionStatusVoided      = "voided"

	AffiliateCommissionSourceAdmin = "admin"
)

type AffiliateCommission struct {
	Id               int     `json:"id"`
	RewardKey        string  `json:"reward_key" gorm:"type:varchar(128);uniqueIndex"`
	InviterId        int     `json:"inviter_id" gorm:"index"`
	InviteeId        int     `json:"invitee_id" gorm:"index"`
	TopupId          int     `json:"topup_id" gorm:"index"`
	TradeNo          string  `json:"trade_no" gorm:"type:varchar(255);index"`
	PaymentProvider  string  `json:"payment_provider" gorm:"type:varchar(50);index"`
	PaymentMethod    string  `json:"payment_method" gorm:"type:varchar(50)"`
	TopupMoney       float64 `json:"topup_money"`
	TopupQuota       int     `json:"topup_quota"`
	InviteAgeDays    int     `json:"invite_age_days"`
	IsFirstTopup     bool    `json:"is_first_topup"`
	BaseRate         float64 `json:"base_rate"`
	FinalRate        float64 `json:"final_rate"`
	RewardQuota      int     `json:"reward_quota"`
	TransferredQuota int     `json:"transferred_quota"`
	Status           string  `json:"status" gorm:"type:varchar(32);index"`
	EligibleAt       int64   `json:"eligible_at" gorm:"bigint;index"`
	SettledAt        int64   `json:"settled_at" gorm:"bigint;index"`
	TransferredAt    int64   `json:"transferred_at" gorm:"bigint;index"`
	VoidReason       string  `json:"void_reason" gorm:"type:varchar(255)"`
	CreatedAt        int64   `json:"created_at" gorm:"bigint;index"`
	UpdatedAt        int64   `json:"updated_at" gorm:"bigint;index"`
}

type AffiliateCommissionFilter struct {
	InviterId int
	InviteeId int
	TopupId   int
	TradeNo   string
	Status    string
	StartTime int64
	EndTime   int64
}

type AffiliateCommissionSummary struct {
	PendingQuota     int `json:"pending_quota"`
	AvailableQuota   int `json:"available_quota"`
	TransferredQuota int `json:"transferred_quota"`
	TotalRewardQuota int `json:"total_reward_quota"`
}

type AffiliateReferral struct {
	Id               int    `json:"id"`
	DisplayName      string `json:"display_name"`
	Username         string `json:"username"`
	Status           int    `json:"status"`
	CreatedAt        int64  `json:"created_at"`
	CommissionCount  int64  `json:"commission_count"`
	PendingQuota     int    `json:"pending_quota"`
	AvailableQuota   int    `json:"available_quota"`
	TransferredQuota int    `json:"transferred_quota"`
	TotalRewardQuota int    `json:"total_reward_quota"`
	LastCommissionAt int64  `json:"last_commission_at"`
}

type AffiliateSettleResult struct {
	SettledCount int `json:"settled_count"`
	SettledQuota int `json:"settled_quota"`
	VoidedCount  int `json:"voided_count"`
}

func affiliateCommissionRewardKey(topUp *TopUp, inviterId int) string {
	return fmt.Sprintf("topup:%d:inviter:%d", topUp.Id, inviterId)
}

func affiliateCommissionNow() int64 {
	return common.GetTimestamp()
}

func affiliateCommissionDaySeconds(days int) int64 {
	if days <= 0 {
		return 0
	}
	return int64(days) * 24 * 60 * 60
}

func affiliateCommissionRate(policy setting.AffiliateRechargePolicyConfig, ageSeconds int64, firstTopup bool) float64 {
	// 返佣按邀请注册后的时间分为三段：0-7 天、8-30 天、31 天到归因窗口。
	// 31 天后的默认比例为 0，避免把长归因期误算成 30 天内比例。
	if ageSeconds <= affiliateCommissionDaySeconds(7) {
		if firstTopup {
			return policy.FirstTopupRateWithin7Days
		}
		return policy.RepeatTopupRateWithin7Days
	}
	if ageSeconds <= affiliateCommissionDaySeconds(30) {
		if firstTopup {
			return policy.FirstTopupRateWithin30Days
		}
		return policy.RepeatTopupRateWithin30Days
	}
	if firstTopup {
		return policy.FirstTopupRateAfter30Days
	}
	return policy.RepeatTopupRateAfter30Days
}

func affiliateCommissionFirstTopupTx(tx *gorm.DB, topUp *TopUp) (bool, error) {
	var count int64
	err := tx.Model(&TopUp{}).
		Where("user_id = ? AND status = ? AND id <> ?", topUp.UserId, common.TopUpStatusSuccess, topUp.Id).
		Count(&count).Error
	return count == 0, err
}

func affiliateCommissionRewardQuota(topupQuota int, rate float64) int {
	return int(decimal.NewFromInt(int64(topupQuota)).Mul(decimal.NewFromFloat(rate)).IntPart())
}

func markAffiliateCommissionVoidedTx(tx *gorm.DB, commission *AffiliateCommission, reason string, now int64) error {
	commission.Status = AffiliateCommissionStatusVoided
	commission.VoidReason = reason
	commission.UpdatedAt = now
	return tx.Save(commission).Error
}

func addAffiliateQuotaTx(tx *gorm.DB, inviterId int, quota int) error {
	if inviterId <= 0 || quota <= 0 {
		return nil
	}
	return tx.Model(&User{}).Where("id = ?", inviterId).Updates(map[string]interface{}{
		"aff_quota":   gorm.Expr("aff_quota + ?", quota),
		"aff_history": gorm.Expr("aff_history + ?", quota),
	}).Error
}

func CreateAffiliateCommissionForTopUp(topUp *TopUp, topupQuota int, source string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		return CreateAffiliateCommissionForTopUpTx(tx, topUp, topupQuota, source)
	})
}

func CreateAffiliateCommissionForTopUpTx(tx *gorm.DB, topUp *TopUp, topupQuota int, source string) error {
	policy := setting.NormalizeAffiliateRechargePolicy(setting.AffiliateRechargePolicy)
	if !policy.Enabled || topUp == nil || topUp.UserId <= 0 || topupQuota <= 0 {
		return nil
	}
	if source == AffiliateCommissionSourceAdmin && !policy.IncludeManualTopup {
		return nil
	}
	if policy.MinTopupMoney > 0 && topUp.Money < policy.MinTopupMoney {
		return nil
	}

	var invitee User
	if err := tx.Select("id", "inviter_id", "created_at").Where("id = ?", topUp.UserId).First(&invitee).Error; err != nil {
		return err
	}
	if invitee.InviterId <= 0 || invitee.InviterId == invitee.Id {
		return nil
	}

	var inviter User
	if err := tx.Select("id", "status").Where("id = ?", invitee.InviterId).First(&inviter).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if inviter.Status != common.UserStatusEnabled {
		return nil
	}

	now := affiliateCommissionNow()
	ageSeconds := now - invitee.CreatedAt
	if ageSeconds < 0 {
		ageSeconds = 0
	}
	if ageSeconds > affiliateCommissionDaySeconds(policy.AttributionDays) {
		return nil
	}

	firstTopup, err := affiliateCommissionFirstTopupTx(tx, topUp)
	if err != nil {
		return err
	}
	rate := affiliateCommissionRate(policy, ageSeconds, firstTopup)
	rewardQuota := affiliateCommissionRewardQuota(topupQuota, rate)
	if rate <= 0 || rewardQuota <= 0 {
		return nil
	}

	rewardKey := affiliateCommissionRewardKey(topUp, inviter.Id)
	var existing AffiliateCommission
	err = tx.Select("id").Where("reward_key = ?", rewardKey).First(&existing).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	status := AffiliateCommissionStatusPending
	eligibleAt := now + affiliateCommissionDaySeconds(policy.SettlementDays)
	settledAt := int64(0)
	if policy.SettlementDays == 0 {
		status = AffiliateCommissionStatusAvailable
		eligibleAt = now
		settledAt = now
	}

	commission := &AffiliateCommission{
		RewardKey:       rewardKey,
		InviterId:       inviter.Id,
		InviteeId:       invitee.Id,
		TopupId:         topUp.Id,
		TradeNo:         topUp.TradeNo,
		PaymentProvider: topUp.PaymentProvider,
		PaymentMethod:   topUp.PaymentMethod,
		TopupMoney:      topUp.Money,
		TopupQuota:      topupQuota,
		InviteAgeDays:   int(ageSeconds / affiliateCommissionDaySeconds(1)),
		IsFirstTopup:    firstTopup,
		BaseRate:        rate,
		FinalRate:       rate,
		RewardQuota:     rewardQuota,
		Status:          status,
		EligibleAt:      eligibleAt,
		SettledAt:       settledAt,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	// 返佣记录先落专表并带唯一键，充值回调重复或补单重试时不会重复入账。
	if err := tx.Create(commission).Error; err != nil {
		return err
	}
	if status == AffiliateCommissionStatusAvailable {
		// 结算期为 0 时在同一事务内立即入账，避免记录已可用但用户邀请余额未增加。
		return addAffiliateQuotaTx(tx, inviter.Id, rewardQuota)
	}
	return nil
}

func buildAffiliateCommissionQuery(filter AffiliateCommissionFilter) *gorm.DB {
	query := DB.Model(&AffiliateCommission{})
	if filter.InviterId > 0 {
		query = query.Where("inviter_id = ?", filter.InviterId)
	}
	if filter.InviteeId > 0 {
		query = query.Where("invitee_id = ?", filter.InviteeId)
	}
	if filter.TopupId > 0 {
		query = query.Where("topup_id = ?", filter.TopupId)
	}
	if strings.TrimSpace(filter.TradeNo) != "" {
		query = query.Where("trade_no = ?", strings.TrimSpace(filter.TradeNo))
	}
	if strings.TrimSpace(filter.Status) != "" {
		query = query.Where("status = ?", strings.TrimSpace(filter.Status))
	}
	if filter.StartTime > 0 {
		query = query.Where("created_at >= ?", filter.StartTime)
	}
	if filter.EndTime > 0 {
		query = query.Where("created_at <= ?", filter.EndTime)
	}
	return query
}

func ListAffiliateCommissions(filter AffiliateCommissionFilter, startIdx int, num int) ([]AffiliateCommission, int64, error) {
	var commissions []AffiliateCommission
	var total int64
	query := buildAffiliateCommissionQuery(filter)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := buildAffiliateCommissionQuery(filter).
		Order("id desc").
		Limit(num).
		Offset(startIdx).
		Find(&commissions).Error
	return commissions, total, err
}

func GetAffiliateCommissionById(id int) (*AffiliateCommission, error) {
	var commission AffiliateCommission
	err := DB.First(&commission, "id = ?", id).Error
	return &commission, err
}

func GetAffiliateCommissionSummary(inviterId int) (AffiliateCommissionSummary, error) {
	summary := AffiliateCommissionSummary{}
	if inviterId <= 0 {
		return summary, nil
	}
	var rows []struct {
		Status           string
		RewardQuota      int
		TransferredQuota int
	}
	err := DB.Model(&AffiliateCommission{}).
		Select("status, COALESCE(SUM(reward_quota), 0) AS reward_quota, COALESCE(SUM(transferred_quota), 0) AS transferred_quota").
		Where("inviter_id = ?", inviterId).
		Group("status").
		Scan(&rows).Error
	if err != nil {
		return summary, err
	}
	for _, row := range rows {
		switch row.Status {
		case AffiliateCommissionStatusPending:
			summary.PendingQuota += row.RewardQuota
		case AffiliateCommissionStatusAvailable:
			summary.AvailableQuota += row.RewardQuota - row.TransferredQuota
		case AffiliateCommissionStatusTransferred:
			summary.TransferredQuota += row.TransferredQuota
		}
		summary.TotalRewardQuota += row.RewardQuota
	}
	return summary, nil
}

func maskAffiliateReferralUsername(username string) string {
	username = strings.TrimSpace(username)
	if username == "" {
		return ""
	}
	runes := []rune(username)
	if len(runes) <= 2 {
		return strings.Repeat("*", len(runes))
	}
	return string(runes[0]) + strings.Repeat("*", len(runes)-2) + string(runes[len(runes)-1])
}

func ListAffiliateReferrals(inviterId int, startIdx int, num int) ([]AffiliateReferral, int64, error) {
	if inviterId <= 0 {
		return []AffiliateReferral{}, 0, nil
	}
	if num <= 0 {
		num = 10
	}
	if num > 100 {
		num = 100
	}
	if startIdx < 0 {
		startIdx = 0
	}

	var total int64
	if err := DB.Model(&User{}).Where("inviter_id = ?", inviterId).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var invitees []User
	if err := DB.Model(&User{}).
		Select("id", "username", "display_name", "status", "created_at").
		Where("inviter_id = ?", inviterId).
		Order("id desc").
		Limit(num).
		Offset(startIdx).
		Find(&invitees).Error; err != nil {
		return nil, 0, err
	}
	if len(invitees) == 0 {
		return []AffiliateReferral{}, total, nil
	}

	inviteeIds := make([]int, 0, len(invitees))
	for _, invitee := range invitees {
		inviteeIds = append(inviteeIds, invitee.Id)
	}

	type referralCommissionRow struct {
		InviteeId        int
		Status           string
		CommissionCount  int64
		RewardQuota      int
		TransferredQuota int
		LastCommissionAt int64
	}
	var rows []referralCommissionRow
	if err := DB.Model(&AffiliateCommission{}).
		Select("invitee_id, status, COUNT(*) AS commission_count, COALESCE(SUM(reward_quota), 0) AS reward_quota, COALESCE(SUM(transferred_quota), 0) AS transferred_quota, COALESCE(MAX(created_at), 0) AS last_commission_at").
		Where("inviter_id = ? AND invitee_id IN ? AND status <> ?", inviterId, inviteeIds, AffiliateCommissionStatusVoided).
		Group("invitee_id, status").
		Scan(&rows).Error; err != nil {
		return nil, 0, err
	}

	stats := map[int]*AffiliateReferral{}
	for _, invitee := range invitees {
		stats[invitee.Id] = &AffiliateReferral{
			Id:          invitee.Id,
			DisplayName: invitee.DisplayName,
			// 邀请人需要能辨认邀请关系，但不应拿到被邀请人的完整登录名。
			Username:  maskAffiliateReferralUsername(invitee.Username),
			Status:    invitee.Status,
			CreatedAt: invitee.CreatedAt,
		}
	}
	for _, row := range rows {
		referral := stats[row.InviteeId]
		if referral == nil {
			continue
		}
		referral.CommissionCount += row.CommissionCount
		if row.LastCommissionAt > referral.LastCommissionAt {
			referral.LastCommissionAt = row.LastCommissionAt
		}
		switch row.Status {
		case AffiliateCommissionStatusPending:
			referral.PendingQuota += row.RewardQuota
			referral.TotalRewardQuota += row.RewardQuota
		case AffiliateCommissionStatusAvailable:
			availableQuota := row.RewardQuota - row.TransferredQuota
			if availableQuota > 0 {
				referral.AvailableQuota += availableQuota
			}
			referral.TotalRewardQuota += row.RewardQuota
		case AffiliateCommissionStatusTransferred:
			referral.TransferredQuota += row.TransferredQuota
			referral.TotalRewardQuota += row.RewardQuota
		}
	}

	referrals := make([]AffiliateReferral, 0, len(invitees))
	for _, invitee := range invitees {
		referrals = append(referrals, *stats[invitee.Id])
	}
	return referrals, total, nil
}

func SettleAffiliateCommissions(inviterId int, limit int) (AffiliateSettleResult, error) {
	result := AffiliateSettleResult{}
	if limit <= 0 || limit > 500 {
		limit = 500
	}
	now := affiliateCommissionNow()
	err := DB.Transaction(func(tx *gorm.DB) error {
		var commissions []AffiliateCommission
		query := tx.Where("status = ? AND eligible_at <= ?", AffiliateCommissionStatusPending, now)
		if inviterId > 0 {
			query = query.Where("inviter_id = ?", inviterId)
		}
		if err := query.Order("id asc").Limit(limit).Find(&commissions).Error; err != nil {
			return err
		}
		for i := range commissions {
			commission := &commissions[i]
			var inviter User
			if err := tx.Select("id", "status").Where("id = ?", commission.InviterId).First(&inviter).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					if err := markAffiliateCommissionVoidedTx(tx, commission, "inviter_not_found", now); err != nil {
						return err
					}
					result.VoidedCount++
					continue
				}
				return err
			}
			if inviter.Status != common.UserStatusEnabled {
				if err := markAffiliateCommissionVoidedTx(tx, commission, "inviter_disabled", now); err != nil {
					return err
				}
				result.VoidedCount++
				continue
			}
			updates := map[string]interface{}{
				"status":     AffiliateCommissionStatusAvailable,
				"settled_at": now,
				"updated_at": now,
			}
			updateResult := tx.Model(&AffiliateCommission{}).
				Where("id = ? AND status = ?", commission.Id, AffiliateCommissionStatusPending).
				Updates(updates)
			if updateResult.Error != nil {
				return updateResult.Error
			}
			if updateResult.RowsAffected == 0 {
				continue
			}
			if err := addAffiliateQuotaTx(tx, commission.InviterId, commission.RewardQuota); err != nil {
				return err
			}
			result.SettledCount++
			result.SettledQuota += commission.RewardQuota
		}
		return nil
	})
	return result, err
}

func ConsumeAffiliateAvailableCommissionsTx(tx *gorm.DB, inviterId int, quota int) error {
	if inviterId <= 0 || quota <= 0 {
		return nil
	}
	remaining := quota
	now := affiliateCommissionNow()
	var commissions []AffiliateCommission
	err := tx.Where("inviter_id = ? AND status = ? AND reward_quota > transferred_quota", inviterId, AffiliateCommissionStatusAvailable).
		Order("id asc").
		Find(&commissions).Error
	if err != nil {
		return err
	}
	for i := range commissions {
		if remaining <= 0 {
			break
		}
		commission := &commissions[i]
		available := commission.RewardQuota - commission.TransferredQuota
		if available <= 0 {
			continue
		}
		consume := available
		if consume > remaining {
			consume = remaining
		}
		newTransferredQuota := commission.TransferredQuota + consume
		status := AffiliateCommissionStatusAvailable
		transferredAt := commission.TransferredAt
		if newTransferredQuota >= commission.RewardQuota {
			status = AffiliateCommissionStatusTransferred
			transferredAt = now
		}
		if err := tx.Model(&AffiliateCommission{}).Where("id = ?", commission.Id).Updates(map[string]interface{}{
			"transferred_quota": newTransferredQuota,
			"status":            status,
			"transferred_at":    transferredAt,
			"updated_at":        now,
		}).Error; err != nil {
			return err
		}
		remaining -= consume
	}
	return nil
}
