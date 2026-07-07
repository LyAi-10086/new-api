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
import type {
  ChannelAlertEvent,
  ChannelAlertEventsResponse,
  ChannelAlertState,
  ChannelAlertStatesResponse,
} from '@/features/system-settings/types'

export type {
  ChannelAlertEvent,
  ChannelAlertEventsResponse,
  ChannelAlertState,
  ChannelAlertStatesResponse,
}

export type ChannelAlertSourceFilter =
  | 'all'
  | 'relay'
  | 'scheduled_test'
  | 'manual_test'
  | 'manual_clear'
  | 'test'

export type ChannelAlertSentFilter = 'all' | 'sent' | 'not_sent'

export type ChannelAlertFilterDraft = {
  channel_id: string
  source: ChannelAlertSourceFilter
  rule_key: string
  alert_sent: ChannelAlertSentFilter
  start_time: string
  end_time: string
}

export type ChannelAlertEventQuery = {
  channel_id?: string
  source?: string
  rule_key?: string
  alert_sent?: boolean
  start_time?: number
  end_time?: number
  p?: number
  page_size?: number
}

export type ChannelAlertStateQuery = {
  channel_id?: string
  active?: boolean
  p?: number
  page_size?: number
}

export type ChannelAlertClearResponse = {
  success: boolean
  message: string
  data?: {
    state?: ChannelAlertState
    event?: ChannelAlertEvent
  }
}
