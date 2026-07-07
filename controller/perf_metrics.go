package controller

import (
	"net/http"
	"sort"
	"strconv"

	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

type perfModelSummaryResponse struct {
	ModelName          string    `json:"model_name"`
	DisplayName        string    `json:"display_name,omitempty"`
	DisplayOrder       int       `json:"display_order"`
	AvgLatencyMs       int64     `json:"avg_latency_ms"`
	SuccessRate        float64   `json:"success_rate"`
	AvgTps             float64   `json:"avg_tps"`
	RecentSuccessRates []float64 `json:"recent_success_rates,omitempty"`
}

type perfSummaryAllResponse struct {
	Models []perfModelSummaryResponse `json:"models"`
}

type perfMetricsResponse struct {
	ModelName    string                    `json:"model_name"`
	DisplayName  string                    `json:"display_name,omitempty"`
	SeriesSchema string                    `json:"series_schema"`
	Groups       []perfmetrics.GroupResult `json:"groups"`
}

func GetPerfMetricsSummary(c *gin.Context) {
	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil {
			hours = parsed
		}
	}

	activeGroups := append(lo.Keys(ratio_setting.GetGroupRatioCopy()), "auto")
	result, err := perfmetrics.QuerySummaryAll(hours, activeGroups)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	availabilityMeta, err := model.GetModelAvailabilityMetaMap(lo.Map(result.Models, func(item perfmetrics.ModelSummary, _ int) string {
		return item.ModelName
	}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	models := make([]perfModelSummaryResponse, 0, len(result.Models))
	for _, item := range result.Models {
		meta, ok := availabilityMeta[item.ModelName]
		if !ok {
			continue
		}
		models = append(models, perfModelSummaryResponse{
			ModelName:          item.ModelName,
			DisplayName:        meta.DisplayName,
			DisplayOrder:       meta.DisplayOrder,
			AvgLatencyMs:       item.AvgLatencyMs,
			SuccessRate:        item.SuccessRate,
			AvgTps:             item.AvgTps,
			RecentSuccessRates: item.RecentSuccessRates,
		})
	}
	sort.SliceStable(models, func(i, j int) bool {
		if models[i].DisplayOrder == models[j].DisplayOrder {
			return false
		}
		return models[i].DisplayOrder < models[j].DisplayOrder
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    perfSummaryAllResponse{Models: models},
	})
}

func GetPerfMetrics(c *gin.Context) {
	modelName := c.Query("model")
	if modelName == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "model is required",
		})
		return
	}

	hours := 24
	if rawHours := c.Query("hours"); rawHours != "" {
		if parsed, err := strconv.Atoi(rawHours); err == nil {
			hours = parsed
		}
	}

	availabilityMeta, err := model.GetModelAvailabilityMetaMap([]string{modelName})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	meta, ok := availabilityMeta[modelName]
	if !ok {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": perfMetricsResponse{
				ModelName: modelName,
				Groups:    []perfmetrics.GroupResult{},
			},
		})
		return
	}

	result, err := perfmetrics.Query(perfmetrics.QueryParams{
		Model: modelName,
		Group: c.Query("group"),
		Hours: hours,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	result.Groups = filterActiveGroups(result.Groups)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": perfMetricsResponse{
			ModelName:    result.ModelName,
			DisplayName:  meta.DisplayName,
			SeriesSchema: result.SeriesSchema,
			Groups:       result.Groups,
		},
	})
}

func filterActiveGroups(groups []perfmetrics.GroupResult) []perfmetrics.GroupResult {
	activeRatios := ratio_setting.GetGroupRatioCopy()
	return lo.Filter(groups, func(g perfmetrics.GroupResult, _ int) bool {
		_, ok := activeRatios[g.Group]
		return ok || g.Group == "auto"
	})
}
