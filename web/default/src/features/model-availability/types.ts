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
export type ApiResponse<T> = {
  success: boolean
  message?: string
  data?: T
}

export type ModelHealthStatus =
  | 'available'
  | 'degraded'
  | 'unavailable'
  | 'insufficient'
  | string

export type ModelSampleStatus = 'none' | 'low' | 'enough' | string

export type ModelAvailabilitySummary = {
  window_hours?: number
  updated_at?: number
  total_models?: number
  available_models?: number
  degraded_models?: number
  unavailable_models?: number
  insufficient_models?: number
  request_count?: number
  success_count?: number
  error_count?: number
  availability_rate?: number
  avg_latency_ms?: number
  avg_ttft_ms?: number
  [key: string]: unknown
}

export type ModelAvailabilityModel = {
  model_name: string
  group?: string
  display_name?: string
  request_count?: number
  success_count?: number
  error_count?: number
  success_rate?: number
  error_rate?: number
  avg_latency_ms?: number
  avg_ttft_ms?: number
  avg_tps?: number
  status?: ModelHealthStatus
  sample_level?: ModelSampleStatus
  latency_level?: string
  ttft_level?: string
  availability_level?: string
  window_hours?: number
  updated_at?: number
  [key: string]: unknown
}

export type ModelAvailabilityModelsData = {
  window_hours?: number
  updated_at?: number
  items?: ModelAvailabilityModel[]
  total?: number
}

export type ModelAvailabilityError = {
  created_at?: number
  model_name?: string
  group?: string
  channel_id?: number
  channel_name?: string
  status_code?: number
  error_code?: string
  error_type?: string
  request_id?: string
  upstream_request_id?: string
  request_path?: string
  content?: string
  [key: string]: unknown
}

export type ModelAvailabilityErrorsData = {
  window_hours?: number
  items?: ModelAvailabilityError[]
  total?: number
  page?: number
  page_size?: number
}

export type ModelAvailabilityQuery = {
  hours?: number
  status?: string
  group?: string
  model?: string
  min_sample?: number
  page_size?: number
  p?: number
}

export type PublicDisplaySettingsItem = {
  source_model_name?: string
  group?: string
  public_model_id?: string
  display_name?: string
  visible?: boolean
  status_enabled?: boolean
  sort_order?: number
  [key: string]: unknown
}

export type PublicDisplaySettings = {
  public_enabled?: boolean
  entries?: PublicDisplaySettingsItem[]
  [key: string]: unknown
}
