package types

type TimePricingSnapshot struct {
	Matched       bool    `json:"matched"`
	RuleId        string  `json:"rule_id,omitempty"`
	RuleName      string  `json:"rule_name,omitempty"`
	UserTitle     string  `json:"user_title,omitempty"`
	ScopeType     string  `json:"scope_type,omitempty"`
	Multiplier    float64 `json:"multiplier,omitempty"`
	Timezone      string  `json:"timezone,omitempty"`
	ConfigVersion int64   `json:"config_version,omitempty"`
	RequestTime   int64   `json:"request_time,omitempty"`
	OriginalQuota int     `json:"original_quota,omitempty"`
	FinalQuota    int     `json:"final_quota,omitempty"`
}
