package service

import (
	"fmt"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/types"
)

func ApplyTimePricingToQuota(relayInfo *relaycommon.RelayInfo, quota int) int {
	if relayInfo == nil || quota <= 0 {
		return quota
	}
	if relayInfo.TimePricingSnapshot != nil {
		snapshot, finalQuota := ApplyTimePricingSnapshotToQuota(relayInfo.TimePricingSnapshot, quota)
		relayInfo.TimePricingSnapshot = snapshot
		return finalQuota
	}

	// 分时段计费必须按用户请求的 OriginModelName 判断，而不是映射后的上游模型。
	// 管理员配置的是对下游可见的模型和分组促销范围，映射后的模型只属于渠道侧实现细节。
	snapshot := setting.BuildTimePricingSnapshot(relayInfo.UsingGroup, relayInfo.OriginModelName, relayInfo.StartTime, quota)
	if snapshot == nil {
		return quota
	}
	relayInfo.TimePricingSnapshot = snapshot
	return snapshot.FinalQuota
}

func ApplyTimePricingSnapshotToQuota(snapshot *types.TimePricingSnapshot, quota int) (*types.TimePricingSnapshot, int) {
	if snapshot == nil || quota <= 0 || snapshot.Multiplier <= 0 || snapshot.Multiplier == 1 {
		return snapshot, quota
	}
	next := *snapshot
	next.OriginalQuota = quota
	next.FinalQuota = setting.ApplyTimePricingMultiplier(quota, snapshot.Multiplier)
	return &next, next.FinalQuota
}

func InjectTimePricingLogInfo(other map[string]interface{}, relayInfo *relaycommon.RelayInfo) {
	if other == nil || relayInfo == nil || relayInfo.TimePricingSnapshot == nil {
		return
	}
	// 完整命中快照只写入消费日志的 other 字段，不写服务日志，避免服务日志暴露用户请求内容或运营促销细节。
	other["time_pricing"] = relayInfo.TimePricingSnapshot
}

func InjectTaskTimePricingLogInfo(other map[string]interface{}, snapshot *types.TimePricingSnapshot) {
	if other == nil || snapshot == nil {
		return
	}
	other["time_pricing"] = snapshot
}

func TimePricingLogText(relayInfo *relaycommon.RelayInfo) string {
	if relayInfo == nil {
		return ""
	}
	return TimePricingLogTextFromSnapshot(relayInfo.TimePricingSnapshot)
}

func TimePricingLogTextFromSnapshot(snapshot *types.TimePricingSnapshot) string {
	if snapshot == nil || snapshot.FinalQuota <= 0 || snapshot.OriginalQuota <= 0 {
		return ""
	}
	return fmt.Sprintf("分时段计费：%s，倍率 %.4f，原额度 %d，折后额度 %d",
		snapshot.RuleName, snapshot.Multiplier, snapshot.OriginalQuota, snapshot.FinalQuota)
}
