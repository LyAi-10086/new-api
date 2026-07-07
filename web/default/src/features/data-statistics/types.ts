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
export type DataStatisticsQuery = {
  start_timestamp?: number
  end_timestamp?: number
  granularity?: 'day' | 'hour'
  model_name?: string
  group?: string
  user_id?: string
  channel_id?: string
  payment_provider?: string
}

export type DataStatisticsFilter = {
  start_timestamp: number
  end_timestamp: number
  granularity: 'day' | 'hour'
  model_name: string
  group: string
  user_id: number
  channel_id: number
  payment_provider: string
}

export type DataStatisticsSummary = {
  consume_quota: number
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  active_users: number
  error_count: number
  error_rate: number
  login_count: number
  login_users: number
  avg_use_time: number
  stream_count: number
  stream_ratio: number
  registered_users: number
  topup_money: number
  topup_amount: number
  current_balance: number
  total_used_quota: number
  total_request_count: number
}

export type DataStatisticsTrendPoint = {
  bucket: number
  consume_quota: number
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  active_users: number
  error_count: number
  error_rate: number
  login_count: number
  login_users: number
  avg_use_time: number
  stream_count: number
  stream_ratio: number
  topup_money: number
  topup_amount: number
  registered_users: number
}

export type DataStatisticsRankItem = {
  id?: number
  name: string
  username?: string
  consume_quota?: number
  request_count?: number
  prompt_tokens?: number
  completion_tokens?: number
  topup_money?: number
  topup_amount?: number
  current_balance?: number
  used_quota?: number
}

export type DataStatisticsRankings = {
  models: DataStatisticsRankItem[]
  groups: DataStatisticsRankItem[]
  users: DataStatisticsRankItem[]
  channels: DataStatisticsRankItem[]
  topup_users: DataStatisticsRankItem[]
  balance_users: DataStatisticsRankItem[]
}

export type DataStatisticsFilterOption = {
  id: number
  name: string
}

export type DataStatisticsFilters = {
  models: string[]
  groups: string[]
  payment_providers: string[]
  channels: DataStatisticsFilterOption[]
}

export type DataStatisticsSummaryResponse = {
  success: boolean
  message: string
  data: {
    filter: DataStatisticsFilter
    summary: DataStatisticsSummary
  }
}

export type DataStatisticsTrendsResponse = {
  success: boolean
  message: string
  data: {
    filter: DataStatisticsFilter
    items: DataStatisticsTrendPoint[]
  }
}

export type DataStatisticsRankingsResponse = {
  success: boolean
  message: string
  data: {
    filter: DataStatisticsFilter
    rankings: DataStatisticsRankings
  }
}

export type DataStatisticsFiltersResponse = {
  success: boolean
  message: string
  data: DataStatisticsFilters
}
