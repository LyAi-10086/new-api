package setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func withSensitiveSettingState(t *testing.T) {
	t.Helper()
	oldCheckSensitiveEnabled := CheckSensitiveEnabled
	oldCheckSensitiveOnPromptEnabled := CheckSensitiveOnPromptEnabled
	oldScope := SensitiveCheckModelScope
	oldPolicy := SensitiveViolationPolicy
	t.Cleanup(func() {
		CheckSensitiveEnabled = oldCheckSensitiveEnabled
		CheckSensitiveOnPromptEnabled = oldCheckSensitiveOnPromptEnabled
		SensitiveCheckModelScope = oldScope
		SensitiveViolationPolicy = oldPolicy
	})
}

func TestShouldCheckPromptSensitiveForModelDefaultAllKeepsExistingBehavior(t *testing.T) {
	withSensitiveSettingState(t)

	CheckSensitiveEnabled = true
	CheckSensitiveOnPromptEnabled = true
	SensitiveCheckModelScope = DefaultSensitiveCheckModelScope()

	assert.True(t, ShouldCheckPromptSensitiveForModel("gpt-4o-mini"))
	assert.True(t, ShouldCheckPromptSensitiveForModel("claude-3-5-sonnet"))
}

func TestShouldCheckPromptSensitiveForModelIncludeScope(t *testing.T) {
	withSensitiveSettingState(t)

	CheckSensitiveEnabled = true
	CheckSensitiveOnPromptEnabled = true
	SensitiveCheckModelScope = SensitiveCheckModelScopeConfig{
		Mode:   SensitiveCheckModelScopeInclude,
		Models: []string{"gpt-4o-mini", "claude-3-5-sonnet"},
	}

	assert.True(t, ShouldCheckPromptSensitiveForModel("gpt-4o-mini"))
	assert.False(t, ShouldCheckPromptSensitiveForModel("gpt-4o-mini-upstream"))
	assert.False(t, ShouldCheckPromptSensitiveForModel("deepseek-chat"))
}

func TestShouldCheckPromptSensitiveForScopeRequiresModelAndGroup(t *testing.T) {
	withSensitiveSettingState(t)

	CheckSensitiveEnabled = true
	CheckSensitiveOnPromptEnabled = true
	SensitiveCheckModelScope = SensitiveCheckModelScopeConfig{
		Mode:      SensitiveCheckModelScopeInclude,
		Models:    []string{"gpt-4o-mini"},
		GroupMode: SensitiveCheckModelScopeInclude,
		Groups:    []string{"codex-pro"},
	}

	assert.True(t, ShouldCheckPromptSensitiveForScope("gpt-4o-mini", "codex-pro"))
	assert.False(t, ShouldCheckPromptSensitiveForScope("gpt-4o-mini", "codex"))
	assert.False(t, ShouldCheckPromptSensitiveForScope("deepseek-chat", "codex-pro"))
}

func TestShouldCheckPromptSensitiveForScopeExcludeGroup(t *testing.T) {
	withSensitiveSettingState(t)

	CheckSensitiveEnabled = true
	CheckSensitiveOnPromptEnabled = true
	SensitiveCheckModelScope = SensitiveCheckModelScopeConfig{
		Mode:      SensitiveCheckModelScopeAll,
		GroupMode: SensitiveCheckModelScopeExclude,
		Groups:    []string{"codex"},
	}

	assert.False(t, ShouldCheckPromptSensitiveForScope("gpt-4o-mini", "codex"))
	assert.True(t, ShouldCheckPromptSensitiveForScope("gpt-4o-mini", "codex-pro"))
}

func TestShouldCheckPromptSensitiveForModelExcludeScope(t *testing.T) {
	withSensitiveSettingState(t)

	CheckSensitiveEnabled = true
	CheckSensitiveOnPromptEnabled = true
	SensitiveCheckModelScope = SensitiveCheckModelScopeConfig{
		Mode:   SensitiveCheckModelScopeExclude,
		Models: []string{"gpt-4o-mini"},
	}

	assert.False(t, ShouldCheckPromptSensitiveForModel("gpt-4o-mini"))
	assert.True(t, ShouldCheckPromptSensitiveForModel("deepseek-chat"))
}

func TestShouldCheckPromptSensitiveForModelRespectsGlobalSwitches(t *testing.T) {
	withSensitiveSettingState(t)

	SensitiveCheckModelScope = DefaultSensitiveCheckModelScope()

	CheckSensitiveEnabled = false
	CheckSensitiveOnPromptEnabled = true
	assert.False(t, ShouldCheckPromptSensitiveForModel("gpt-4o-mini"))

	CheckSensitiveEnabled = true
	CheckSensitiveOnPromptEnabled = false
	assert.False(t, ShouldCheckPromptSensitiveForModel("gpt-4o-mini"))
}

func TestSensitiveScopeAndPolicyNormalizeFromJSON(t *testing.T) {
	withSensitiveSettingState(t)

	require.NoError(t, UpdateSensitiveCheckModelScopeByJSONString(`{"mode":"unknown","models":[" gpt-4o-mini ","","gpt-4o-mini","deepseek-chat"]}`))
	assert.Equal(t, SensitiveCheckModelScopeAll, SensitiveCheckModelScope.Mode)
	assert.Equal(t, []string{"gpt-4o-mini", "deepseek-chat"}, SensitiveCheckModelScope.Models)
	assert.Equal(t, SensitiveCheckModelScopeAll, SensitiveCheckModelScope.GroupMode)
	assert.Empty(t, SensitiveCheckModelScope.Groups)

	require.NoError(t, UpdateSensitiveCheckModelScopeByJSONString(`{"mode":"include","models":["gpt-4o-mini"],"group_mode":"exclude","groups":[" codex ","codex","codex-pro"]}`))
	assert.Equal(t, SensitiveCheckModelScopeInclude, SensitiveCheckModelScope.Mode)
	assert.Equal(t, []string{"gpt-4o-mini"}, SensitiveCheckModelScope.Models)
	assert.Equal(t, SensitiveCheckModelScopeExclude, SensitiveCheckModelScope.GroupMode)
	assert.Equal(t, []string{"codex", "codex-pro"}, SensitiveCheckModelScope.Groups)

	require.NoError(t, UpdateSensitiveViolationPolicyByJSONString(`{"user_enabled":true,"user_threshold":0,"token_enabled":true,"token_threshold":3}`))
	assert.False(t, SensitiveViolationPolicy.UserEnabled)
	assert.Equal(t, 0, SensitiveViolationPolicy.UserThreshold)
	assert.True(t, SensitiveViolationPolicy.TokenEnabled)
	assert.Equal(t, 3, SensitiveViolationPolicy.TokenThreshold)
}
