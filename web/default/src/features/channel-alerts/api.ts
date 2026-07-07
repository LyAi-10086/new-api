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
import {
  getChannelAlertEvents as getSystemChannelAlertEvents,
  getChannelAlertStates as getSystemChannelAlertStates,
} from '@/features/system-settings/api'
import { api } from '@/lib/api'

import type {
  ChannelAlertClearResponse,
  ChannelAlertEventQuery,
  ChannelAlertEventsResponse,
  ChannelAlertStateQuery,
  ChannelAlertStatesResponse,
} from './types'

export async function getChannelAlertEvents(
  params: ChannelAlertEventQuery
): Promise<ChannelAlertEventsResponse> {
  return getSystemChannelAlertEvents(params)
}

export async function getChannelAlertStates(
  params: ChannelAlertStateQuery
): Promise<ChannelAlertStatesResponse> {
  return getSystemChannelAlertStates(params)
}

export async function clearChannelAlertState(
  stateId: number
): Promise<ChannelAlertClearResponse> {
  const res = await api.post<ChannelAlertClearResponse>(
    `/api/channel-alert/states/${stateId}/clear`
  )
  return res.data
}
