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
  ModelStatusModelsData,
  ModelStatusQuery,
  ModelStatusSummary,
} from './types'

const BASE_URL = '/api/model-status'

export async function getModelStatusSummary(
  params: ModelStatusQuery = {}
): Promise<ApiResponse<ModelStatusSummary>> {
  const res = await api.get<ApiResponse<ModelStatusSummary>>(
    `${BASE_URL}/summary`,
    { params }
  )
  return res.data
}

export async function getModelStatusModels(
  params: ModelStatusQuery = {}
): Promise<ApiResponse<ModelStatusModelsData>> {
  const res = await api.get<ApiResponse<ModelStatusModelsData>>(
    `${BASE_URL}/models`,
    { params }
  )
  return res.data
}
