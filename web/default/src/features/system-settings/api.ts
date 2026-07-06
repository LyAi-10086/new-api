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
  ConfirmPaymentComplianceResponse,
  AffiliateCommissionFilters,
  AffiliateCommissionResponse,
  AffiliateCommissionsResponse,
  AffiliateSettleResponse,
  AffiliateSettings,
  AffiliateSettingsResponse,
  ChannelAlertEventsResponse,
  ChannelAlertFilters,
  ChannelAlertStatesResponse,
  FetchUpstreamRatiosRequest,
  LogCleanupTask,
  SensitiveEnabledGroupsResponse,
  SensitiveEnabledModelsResponse,
  SensitiveSettings,
  SensitiveSettingsResponse,
  SensitiveViolationFilters,
  SensitiveViolationResponse,
  SensitiveViolationsResponse,
  SystemOptionsResponse,
  SystemTaskListResponse,
  SystemTaskResponse,
  UpdateOptionRequest,
  UpdateOptionResponse,
  UpstreamChannelsResponse,
  UpstreamRatiosResponse,
} from './types'

export async function getSystemOptions() {
  const res = await api.get<SystemOptionsResponse>('/api/option/')
  return res.data
}

export async function updateSystemOption(request: UpdateOptionRequest) {
  const res = await api.put<UpdateOptionResponse>('/api/option/', request)
  return res.data
}

export async function sendChannelAlertTest() {
  const res = await api.post<UpdateOptionResponse>('/api/channel-alert/test')
  return res.data
}

export async function getChannelAlertEvents(filters: ChannelAlertFilters) {
  const res = await api.get<ChannelAlertEventsResponse>(
    '/api/channel-alert/events',
    {
      params: filters,
    }
  )
  return res.data
}

export async function getChannelAlertStates(filters: ChannelAlertFilters) {
  const res = await api.get<ChannelAlertStatesResponse>(
    '/api/channel-alert/states',
    {
      params: filters,
    }
  )
  return res.data
}

export async function confirmPaymentCompliance() {
  const res = await api.post<ConfirmPaymentComplianceResponse>(
    '/api/option/payment_compliance',
    { confirmed: true }
  )
  return res.data
}

export async function startLogCleanupTask(targetTimestamp: number) {
  const res = await api.post<SystemTaskResponse<LogCleanupTask>>(
    '/api/system-task/log-cleanup',
    null,
    {
      params: { target_timestamp: targetTimestamp },
    }
  )
  return res.data
}

export async function getCurrentLogCleanupTask() {
  const res = await api.get<SystemTaskResponse<LogCleanupTask | null>>(
    '/api/system-task/current',
    {
      params: { type: 'log_cleanup' },
    }
  )
  return res.data
}

export async function getSystemTask(taskId: string) {
  const res = await api.get<SystemTaskResponse<LogCleanupTask>>(
    `/api/system-task/${taskId}`
  )
  return res.data
}

export async function listSystemTasks(limit = 20) {
  const res = await api.get<SystemTaskListResponse>('/api/system-task/list', {
    params: { limit },
  })
  return res.data
}

export async function resetModelRatios() {
  const res = await api.post<UpdateOptionResponse>(
    '/api/option/rest_model_ratio'
  )
  return res.data
}

export async function getUpstreamChannels() {
  const res = await api.get<UpstreamChannelsResponse>(
    '/api/ratio_sync/channels'
  )
  return res.data
}

export async function fetchUpstreamRatios(request: FetchUpstreamRatiosRequest) {
  const res = await api.post<UpstreamRatiosResponse>(
    '/api/ratio_sync/fetch',
    request
  )
  return res.data
}

export async function getSensitiveSettings() {
  const res = await api.get<SensitiveSettingsResponse>(
    '/api/sensitive/settings'
  )
  return res.data
}

export async function updateSensitiveSettings(request: SensitiveSettings) {
  const res = await api.put<UpdateOptionResponse>(
    '/api/sensitive/settings',
    request
  )
  return res.data
}

export async function getSensitiveEnabledModels() {
  const res = await api.get<SensitiveEnabledModelsResponse>(
    '/api/sensitive/enabled_models'
  )
  return res.data
}

export async function getSensitiveEnabledGroups() {
  const res = await api.get<SensitiveEnabledGroupsResponse>(
    '/api/sensitive/enabled_groups'
  )
  return res.data
}

export async function getSensitiveViolations(
  filters: SensitiveViolationFilters
) {
  const res = await api.get<SensitiveViolationsResponse>(
    '/api/sensitive/violations',
    {
      params: filters,
    }
  )
  return res.data
}

export async function getSensitiveViolation(id: number) {
  const res = await api.get<SensitiveViolationResponse>(
    `/api/sensitive/violations/${id}`
  )
  return res.data
}

export async function getAffiliateSettings() {
  const res = await api.get<AffiliateSettingsResponse>(
    '/api/affiliate/settings'
  )
  return res.data
}

export async function updateAffiliateSettings(request: AffiliateSettings) {
  const res = await api.put<UpdateOptionResponse>(
    '/api/affiliate/settings',
    request
  )
  return res.data
}

export async function getAffiliateCommissions(
  filters: AffiliateCommissionFilters
) {
  const res = await api.get<AffiliateCommissionsResponse>(
    '/api/affiliate/commissions',
    {
      params: filters,
    }
  )
  return res.data
}

export async function getAffiliateCommission(id: number) {
  const res = await api.get<AffiliateCommissionResponse>(
    `/api/affiliate/commissions/${id}`
  )
  return res.data
}

export async function settleAffiliateCommissions(inviterId?: string) {
  const res = await api.post<AffiliateSettleResponse>(
    '/api/affiliate/settle',
    null,
    {
      params: inviterId ? { inviter_id: inviterId } : undefined,
    }
  )
  return res.data
}
