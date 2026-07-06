package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupSensitiveViolationModelTest(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&SensitiveViolation{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&SensitiveViolation{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&SensitiveViolation{}).Error)
	})
}

func TestSensitiveViolationListOmitsContentAndDetailKeepsFullContent(t *testing.T) {
	setupSensitiveViolationModelTest(t)

	fullContent := "完整的违规请求内容 test_sensitive 尾部证据"
	violation := &SensitiveViolation{
		UserId:         11,
		TokenId:        22,
		ModelName:      "gpt-4o-mini",
		GroupName:      "codex-pro",
		MatchedWords:   `["test_sensitive"]`,
		Content:        fullContent,
		ContentPreview: "完整的违规请求内容 test_sensitive",
		RequestPath:    "/v1/chat/completions",
		RequestId:      "req-sensitive",
		Ip:             "127.0.0.1",
		ActionResult:   "recorded",
		CreatedAt:      common.GetTimestamp(),
	}
	require.NoError(t, CreateSensitiveViolation(violation))

	rows, total, err := ListSensitiveViolations(SensitiveViolationFilter{UserId: 11}, 0, 10)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, rows, 1)
	assert.Empty(t, rows[0].Content)
	assert.Equal(t, violation.ContentPreview, rows[0].ContentPreview)
	assert.Equal(t, "codex-pro", rows[0].GroupName)

	detail, err := GetSensitiveViolationById(violation.Id)
	require.NoError(t, err)
	assert.Equal(t, fullContent, detail.Content)
	assert.Equal(t, `["test_sensitive"]`, detail.MatchedWords)
}

func TestSensitiveViolationFiltersAndCounts(t *testing.T) {
	setupSensitiveViolationModelTest(t)

	rows := []SensitiveViolation{
		{UserId: 1, TokenId: 10, ModelName: "gpt-a", GroupName: "codex", ContentPreview: "a", CreatedAt: 100, ActionResult: "recorded"},
		{UserId: 1, TokenId: 20, ModelName: "gpt-b", GroupName: "codex-pro", ContentPreview: "b", CreatedAt: 200, ActionResult: "recorded"},
		{UserId: 2, TokenId: 20, ModelName: "gpt-a", GroupName: "codex-pro", ContentPreview: "c", CreatedAt: 300, ActionResult: "recorded"},
	}
	require.NoError(t, DB.Create(&rows).Error)

	filtered, total, err := ListSensitiveViolations(SensitiveViolationFilter{
		UserId:    1,
		ModelName: "gpt-b",
		GroupName: "codex-pro",
		StartTime: 150,
		EndTime:   250,
	}, 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, filtered, 1)
	assert.Equal(t, "gpt-b", filtered[0].ModelName)

	userCount, err := CountSensitiveViolationsByUserId(1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), userCount)

	tokenCount, err := CountSensitiveViolationsByTokenId(20)
	require.NoError(t, err)
	assert.Equal(t, int64(2), tokenCount)
}
