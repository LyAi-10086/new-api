package service

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

const sensitiveViolationPreviewRuneLimit = 500

func buildSensitiveViolationPreview(content string) string {
	preview := strings.Join(strings.Fields(content), " ")
	if preview == "" {
		preview = content
	}
	runes := []rune(preview)
	if len(runes) <= sensitiveViolationPreviewRuneLimit {
		return preview
	}
	return string(runes[:sensitiveViolationPreviewRuneLimit]) + "..."
}

func sensitiveWordsToJSONString(words []string) string {
	bytes, err := common.Marshal(words)
	if err != nil {
		return "[]"
	}
	return string(bytes)
}

func disableSensitiveViolationUser(userId int) (string, error) {
	if userId <= 0 {
		return "", nil
	}
	user, err := model.GetUserById(userId, true)
	if err != nil {
		return "user_disable_failed", err
	}
	if user.Role == common.RoleRootUser {
		return "root_user_skipped", nil
	}
	if user.Status == common.UserStatusDisabled {
		return "user_already_disabled", nil
	}
	user.Status = common.UserStatusDisabled
	if err := user.Update(false); err != nil {
		return "user_disable_failed", err
	}
	if err := model.InvalidateUserTokensCache(userId); err != nil {
		return "user_token_cache_invalidate_failed", err
	}
	return "user_disabled", nil
}

func disableSensitiveViolationToken(tokenId int) (string, error) {
	if tokenId <= 0 {
		return "", nil
	}
	token, err := model.GetTokenById(tokenId)
	if err != nil {
		return "token_disable_failed", err
	}
	if token.Status == common.TokenStatusDisabled {
		return "token_already_disabled", nil
	}
	token.Status = common.TokenStatusDisabled
	token.AccessedTime = common.GetTimestamp()
	if err := token.SelectUpdate(); err != nil {
		return "token_disable_failed", err
	}
	return "token_disabled", nil
}

func applySensitiveViolationPolicy(violation *model.SensitiveViolation, policy setting.SensitiveViolationPolicyConfig) (string, error) {
	policy = setting.NormalizeSensitiveViolationPolicy(policy)
	actions := []string{"recorded"}
	var errs []string

	if policy.UserEnabled && policy.UserThreshold > 0 && violation.UserId > 0 {
		count, err := model.CountSensitiveViolationsByUserId(violation.UserId)
		if err != nil {
			actions = append(actions, "user_count_failed")
			errs = append(errs, err.Error())
		} else if count >= int64(policy.UserThreshold) {
			action, err := disableSensitiveViolationUser(violation.UserId)
			if action != "" {
				actions = append(actions, action)
			}
			if err != nil {
				errs = append(errs, err.Error())
			}
		}
	}

	if policy.TokenEnabled && policy.TokenThreshold > 0 && violation.TokenId > 0 {
		count, err := model.CountSensitiveViolationsByTokenId(violation.TokenId)
		if err != nil {
			actions = append(actions, "token_count_failed")
			errs = append(errs, err.Error())
		} else if count >= int64(policy.TokenThreshold) {
			action, err := disableSensitiveViolationToken(violation.TokenId)
			if action != "" {
				actions = append(actions, action)
			}
			if err != nil {
				errs = append(errs, err.Error())
			}
		}
	}

	result := strings.Join(actions, ",")
	if len(errs) > 0 {
		return result, errors.New(strings.Join(errs, "; "))
	}
	return result, nil
}

func RecordSensitiveViolationAndApplyPolicy(c *gin.Context, relayInfo *relaycommon.RelayInfo, words []string, content string) (*model.SensitiveViolation, error) {
	requestPath := ""
	requestId := ""
	ip := ""
	userId := 0
	tokenId := 0
	modelName := ""
	groupName := ""
	if relayInfo != nil {
		userId = relayInfo.UserId
		tokenId = relayInfo.TokenId
		modelName = relayInfo.OriginModelName
		groupName = relayInfo.UsingGroup
		if groupName == "" {
			groupName = relayInfo.TokenGroup
		}
		if groupName == "" {
			groupName = relayInfo.UserGroup
		}
		requestPath = relayInfo.RequestURLPath
		requestId = relayInfo.RequestId
	}
	if c != nil {
		ip = c.ClientIP()
		if requestPath == "" && c.Request != nil && c.Request.URL != nil {
			requestPath = c.Request.URL.Path
		}
		if requestId == "" {
			requestId = c.GetString(common.RequestIdKey)
		}
	}

	violation := &model.SensitiveViolation{
		UserId:         userId,
		TokenId:        tokenId,
		ModelName:      modelName,
		GroupName:      groupName,
		MatchedWords:   sensitiveWordsToJSONString(words),
		Content:        content,
		ContentPreview: buildSensitiveViolationPreview(content),
		RequestPath:    requestPath,
		RequestId:      requestId,
		Ip:             ip,
		ActionResult:   "recorded",
		CreatedAt:      common.GetTimestamp(),
	}

	// 完整违规内容只写入专表，服务日志只记录记录 ID 等摘要，避免日志系统扩散敏感内容。
	if err := model.CreateSensitiveViolation(violation); err != nil {
		return nil, err
	}

	// 先保存违规记录，再执行自动禁用；即使处置失败，也能保留触发证据和审计链路。
	actionResult, err := applySensitiveViolationPolicy(violation, setting.SensitiveViolationPolicy)
	violation.ActionResult = actionResult
	if updateErr := model.UpdateSensitiveViolationActionResult(violation.Id, actionResult); updateErr != nil && err == nil {
		err = updateErr
	}
	return violation, err
}
