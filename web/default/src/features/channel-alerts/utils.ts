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
import dayjs from 'dayjs'

import type {
  ChannelAlertEvent,
  ChannelAlertEventQuery,
  ChannelAlertFilterDraft,
  ChannelAlertSentFilter,
  ChannelAlertSourceFilter,
  ChannelAlertStateQuery,
} from './types'

export const CHANNEL_ALERT_DEFAULT_DRAFT: ChannelAlertFilterDraft = {
  channel_id: '',
  source: 'all',
  rule_key: '',
  alert_sent: 'all',
  start_time: '',
  end_time: '',
}

export const CHANNEL_ALERT_SOURCES: Array<{
  value: ChannelAlertSourceFilter
  labelKey: string
}> = [
  { value: 'all', labelKey: 'All sources' },
  { value: 'relay', labelKey: 'Real requests' },
  { value: 'scheduled_test', labelKey: 'Scheduled tests' },
  { value: 'manual_test', labelKey: 'Manual tests' },
  { value: 'manual_clear', labelKey: 'Manual clear' },
  { value: 'test', labelKey: 'Test event' },
]

export const CHANNEL_ALERT_SENT_FILTERS: Array<{
  value: ChannelAlertSentFilter
  labelKey: string
}> = [
  { value: 'all', labelKey: 'All alert results' },
  { value: 'sent', labelKey: 'Alert sent' },
  { value: 'not_sent', labelKey: 'Alert not sent' },
]

export function formatAlertTime(timestamp?: number): string {
  return timestamp && timestamp > 0
    ? dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm:ss')
    : '-'
}

export function parseAlertTimeInput(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (!Number.isSafeInteger(numeric)) return undefined
    return numeric > 9_999_999_999 ? Math.floor(numeric / 1000) : numeric
  }

  const parsed = dayjs(trimmed)
  return parsed.isValid() ? parsed.unix() : undefined
}

export function buildEventQuery(
  draft: ChannelAlertFilterDraft,
  page: number,
  pageSize: number
): ChannelAlertEventQuery {
  const query: ChannelAlertEventQuery = { p: page, page_size: pageSize }
  const channelId = draft.channel_id.trim()
  const ruleKey = draft.rule_key.trim()
  const startTime = parseAlertTimeInput(draft.start_time)
  const endTime = parseAlertTimeInput(draft.end_time)

  if (channelId) query.channel_id = channelId
  if (draft.source !== 'all') query.source = draft.source
  if (ruleKey) query.rule_key = ruleKey
  if (draft.alert_sent === 'sent') query.alert_sent = true
  if (draft.alert_sent === 'not_sent') query.alert_sent = false
  if (startTime !== undefined) query.start_time = startTime
  if (endTime !== undefined) query.end_time = endTime

  return query
}

export function buildStateQuery(
  draft: ChannelAlertFilterDraft,
  page: number,
  pageSize: number
): ChannelAlertStateQuery {
  const query: ChannelAlertStateQuery = {
    active: true,
    p: page,
    page_size: pageSize,
  }
  const channelId = draft.channel_id.trim()
  if (channelId) query.channel_id = channelId
  return query
}

export function matchesAlertSentFilter(
  event: ChannelAlertEvent,
  filter: ChannelAlertSentFilter
): boolean {
  if (filter === 'sent') return event.alert_sent
  if (filter === 'not_sent') return !event.alert_sent
  return true
}

export function channelAlertSourceLabelKey(source: string): string {
  return (
    CHANNEL_ALERT_SOURCES.find((item) => item.value === source)?.labelKey ||
    source ||
    '-'
  )
}

export function channelAlertSentLabelKey(filter: ChannelAlertSentFilter) {
  return (
    CHANNEL_ALERT_SENT_FILTERS.find((item) => item.value === filter)
      ?.labelKey || 'All alert results'
  )
}

export function channelAlertChannelLabel(
  channelId: number,
  channelName?: string
): string {
  if (channelName) return `${channelName} (#${channelId})`
  return channelId > 0 ? `#${channelId}` : '-'
}
