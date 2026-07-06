/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { api } from '@/lib/api'

import type {
  DataStatisticsFiltersResponse,
  DataStatisticsQuery,
  DataStatisticsRankingsResponse,
  DataStatisticsSummaryResponse,
  DataStatisticsTrendsResponse,
} from './types'

export async function getDataStatisticsSummary(params: DataStatisticsQuery) {
  const res = await api.get<DataStatisticsSummaryResponse>(
    '/api/data-statistics/summary',
    {
      params,
    }
  )
  return res.data
}

export async function getDataStatisticsTrends(params: DataStatisticsQuery) {
  const res = await api.get<DataStatisticsTrendsResponse>(
    '/api/data-statistics/trends',
    {
      params,
    }
  )
  return res.data
}

export async function getDataStatisticsRankings(params: DataStatisticsQuery) {
  const res = await api.get<DataStatisticsRankingsResponse>(
    '/api/data-statistics/rankings',
    {
      params,
    }
  )
  return res.data
}

export async function getDataStatisticsFilters() {
  const res = await api.get<DataStatisticsFiltersResponse>(
    '/api/data-statistics/filters'
  )
  return res.data
}
