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

export type PublicModelStatus =
  | 'available'
  | 'degraded'
  | 'unavailable'
  | 'insufficient'
  | string

export type PublicModelSpeedLevel = 'fast' | 'normal' | 'slow' | string

export type PublicModelSampleLevel = 'none' | 'low' | 'enough' | string

export type ModelStatusSummary = {
  window_hours?: number
  updated_at?: number
  total_models?: number
  available_models?: number
  degraded_models?: number
  unavailable_models?: number
  insufficient_models?: number
  public_enabled?: boolean
  [key: string]: unknown
}

export type ModelStatusItem = {
  public_model_id: string
  display_name: string
  status?: PublicModelStatus
  latency_level?: PublicModelSpeedLevel
  ttft_level?: PublicModelSpeedLevel
  sample_level?: PublicModelSampleLevel
  availability_level?: string
  window_hours?: number
  updated_at?: number
  [key: string]: unknown
}

export type ModelStatusModelsData = {
  public_enabled?: boolean
  window_hours?: number
  updated_at?: number
  items?: ModelStatusItem[]
  total?: number
}

export type ModelStatusQuery = {
  hours?: number
}
