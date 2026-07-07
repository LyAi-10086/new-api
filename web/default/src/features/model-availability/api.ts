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
  ApiResponse,
  ModelAvailabilityErrorsData,
  ModelAvailabilityModelsData,
  ModelAvailabilityQuery,
  ModelAvailabilitySummary,
  PublicDisplaySettings,
} from './types'

const BASE_URL = '/api/model-availability'

export async function getModelAvailabilitySummary(
  params: Pick<ModelAvailabilityQuery, 'hours'> = {}
): Promise<ApiResponse<ModelAvailabilitySummary>> {
  const res = await api.get<ApiResponse<ModelAvailabilitySummary>>(
    `${BASE_URL}/summary`,
    { params }
  )
  return res.data
}

export async function getModelAvailabilityModels(
  params: ModelAvailabilityQuery = {}
): Promise<ApiResponse<ModelAvailabilityModelsData>> {
  const res = await api.get<ApiResponse<ModelAvailabilityModelsData>>(
    `${BASE_URL}/models`,
    { params }
  )
  return res.data
}

export async function getModelAvailabilityErrors(
  params: ModelAvailabilityQuery = {}
): Promise<ApiResponse<ModelAvailabilityErrorsData>> {
  const res = await api.get<ApiResponse<ModelAvailabilityErrorsData>>(
    `${BASE_URL}/errors`,
    { params }
  )
  return res.data
}

export async function getModelAvailabilityDisplaySettings(): Promise<
  ApiResponse<PublicDisplaySettings>
> {
  const res = await api.get<ApiResponse<PublicDisplaySettings>>(
    `${BASE_URL}/display-settings`
  )
  return res.data
}

export async function updateModelAvailabilityDisplaySettings(
  data: PublicDisplaySettings
): Promise<ApiResponse<PublicDisplaySettings>> {
  const res = await api.put<ApiResponse<PublicDisplaySettings>>(
    `${BASE_URL}/display-settings`,
    data
  )
  return res.data
}
