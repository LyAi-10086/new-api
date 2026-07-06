package service

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupSensitiveViolationServiceTest(t *testing.T) {
	t.Helper()
	require.NoError(t, model.DB.AutoMigrate(&model.SensitiveViolation{}, &model.User{}, &model.Token{}))
	require.NoError(t, model.DB.Exec("DELETE FROM sensitive_violations").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM tokens").Error)
	require.NoError(t, model.DB.Exec("DELETE FROM users").Error)
	t.Cleanup(func() {
		require.NoError(t, model.DB.Exec("DELETE FROM sensitive_violations").Error)
		require.NoError(t, model.DB.Exec("DELETE FROM tokens").Error)
		require.NoError(t, model.DB.Exec("DELETE FROM users").Error)
	})
}

func withSensitiveViolationPolicy(t *testing.T, policy setting.SensitiveViolationPolicyConfig) {
	t.Helper()
	oldPolicy := setting.SensitiveViolationPolicy
	setting.SensitiveViolationPolicy = policy
	t.Cleanup(func() {
		setting.SensitiveViolationPolicy = oldPolicy
	})
}

func newSensitiveViolationTestContext() *gin.Context {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	ctx.Set(common.RequestIdKey, "req-from-context")
	return ctx
}

func seedSensitiveViolationToken(t *testing.T, id int, userId int, key string) {
	t.Helper()
	token := &model.Token{
		Id:                 id,
		UserId:             userId,
		Key:                key,
		Name:               "sensitive-token",
		Status:             common.TokenStatusEnabled,
		CreatedTime:        1,
		AccessedTime:       1,
		ExpiredTime:        -1,
		RemainQuota:        100,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: false,
		ModelLimits:        "",
		AllowIps:           common.GetPointer(""),
		Group:              "default",
	}
	require.NoError(t, model.DB.Create(token).Error)
}

func TestRecordSensitiveViolationStoresEvidenceWithoutDisposition(t *testing.T) {
	setupSensitiveViolationServiceTest(t)
	withSensitiveViolationPolicy(t, setting.DefaultSensitiveViolationPolicy())

	content := strings.Repeat("敏感内容 ", 120)
	relayInfo := &relaycommon.RelayInfo{
		UserId:          1,
		TokenId:         2,
		OriginModelName: "gpt-4o-mini",
		UsingGroup:      "codex-pro",
		TokenGroup:      "auto",
		UserGroup:       "codex",
		RequestURLPath:  "/v1/responses",
		RequestId:       "req-from-relay",
	}

	violation, err := RecordSensitiveViolationAndApplyPolicy(
		newSensitiveViolationTestContext(),
		relayInfo,
		[]string{"test_sensitive"},
		content,
	)

	require.NoError(t, err)
	require.NotNil(t, violation)
	assert.Equal(t, "recorded", violation.ActionResult)
	assert.Equal(t, "req-from-relay", violation.RequestId)
	assert.Equal(t, "/v1/responses", violation.RequestPath)
	assert.Equal(t, "gpt-4o-mini", violation.ModelName)
	assert.Equal(t, "codex-pro", violation.GroupName)
	assert.Equal(t, content, violation.Content)
	assert.LessOrEqual(t, len([]rune(violation.ContentPreview)), sensitiveViolationPreviewRuneLimit+3)

	detail, err := model.GetSensitiveViolationById(violation.Id)
	require.NoError(t, err)
	assert.Equal(t, content, detail.Content)
	assert.JSONEq(t, `["test_sensitive"]`, detail.MatchedWords)
}

func TestRecordSensitiveViolationAutoDisablesUserAtThreshold(t *testing.T) {
	setupSensitiveViolationServiceTest(t)
	withSensitiveViolationPolicy(t, setting.SensitiveViolationPolicyConfig{
		UserEnabled:   true,
		UserThreshold: 2,
	})

	seedUser(t, 101, 1000)
	require.NoError(t, model.CreateSensitiveViolation(&model.SensitiveViolation{
		UserId:         101,
		ContentPreview: "历史违规",
		ActionResult:   "recorded",
	}))

	violation, err := RecordSensitiveViolationAndApplyPolicy(
		newSensitiveViolationTestContext(),
		&relaycommon.RelayInfo{UserId: 101, OriginModelName: "gpt-4o-mini"},
		[]string{"test_sensitive"},
		"第二次违规",
	)

	require.NoError(t, err)
	require.NotNil(t, violation)
	assert.Contains(t, violation.ActionResult, "user_disabled")

	user, err := model.GetUserById(101, true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusDisabled, user.Status)
}

func TestRecordSensitiveViolationAutoDisablesTokenAtThreshold(t *testing.T) {
	setupSensitiveViolationServiceTest(t)
	withSensitiveViolationPolicy(t, setting.SensitiveViolationPolicyConfig{
		TokenEnabled:   true,
		TokenThreshold: 2,
	})

	seedUser(t, 201, 1000)
	seedSensitiveViolationToken(t, 301, 201, "sk-sensitive-token")
	require.NoError(t, model.CreateSensitiveViolation(&model.SensitiveViolation{
		UserId:         201,
		TokenId:        301,
		ContentPreview: "历史违规",
		ActionResult:   "recorded",
	}))

	violation, err := RecordSensitiveViolationAndApplyPolicy(
		newSensitiveViolationTestContext(),
		&relaycommon.RelayInfo{UserId: 201, TokenId: 301, OriginModelName: "gpt-4o-mini"},
		[]string{"test_sensitive"},
		"第二次违规",
	)

	require.NoError(t, err)
	require.NotNil(t, violation)
	assert.Contains(t, violation.ActionResult, "token_disabled")

	token, err := model.GetTokenById(301)
	require.NoError(t, err)
	assert.Equal(t, common.TokenStatusDisabled, token.Status)
}

func TestRecordSensitiveViolationPolicyDisabledOnlyRecords(t *testing.T) {
	setupSensitiveViolationServiceTest(t)
	withSensitiveViolationPolicy(t, setting.SensitiveViolationPolicyConfig{
		UserEnabled:    false,
		UserThreshold:  1,
		TokenEnabled:   false,
		TokenThreshold: 1,
	})

	seedUser(t, 401, 1000)
	seedSensitiveViolationToken(t, 501, 401, "sk-sensitive-record-only")

	violation, err := RecordSensitiveViolationAndApplyPolicy(
		newSensitiveViolationTestContext(),
		&relaycommon.RelayInfo{UserId: 401, TokenId: 501, OriginModelName: "gpt-4o-mini"},
		[]string{"test_sensitive"},
		"仅记录不禁用",
	)

	require.NoError(t, err)
	require.NotNil(t, violation)
	assert.Equal(t, "recorded", violation.ActionResult)

	user, err := model.GetUserById(401, true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusEnabled, user.Status)

	token, err := model.GetTokenById(501)
	require.NoError(t, err)
	assert.Equal(t, common.TokenStatusEnabled, token.Status)
}
