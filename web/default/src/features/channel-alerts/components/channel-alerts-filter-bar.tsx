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
import { RotateCcw, Search } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type {
  ChannelAlertFilterDraft,
  ChannelAlertSentFilter,
  ChannelAlertSourceFilter,
} from '../types'
import {
  CHANNEL_ALERT_SENT_FILTERS,
  CHANNEL_ALERT_SOURCES,
  channelAlertSentLabelKey,
  channelAlertSourceLabelKey,
} from '../utils'

type ChannelAlertsFilterBarProps = {
  draft: ChannelAlertFilterDraft
  isLoading: boolean
  onChange: (draft: ChannelAlertFilterDraft) => void
  onApply: () => void
  onReset: () => void
}

export function ChannelAlertsFilterBar(props: ChannelAlertsFilterBarProps) {
  const { t } = useTranslation()
  const sourceItems = useMemo(
    () =>
      CHANNEL_ALERT_SOURCES.map((item) => ({
        value: item.value,
        label: t(item.labelKey),
      })),
    [t]
  )
  const sentItems = useMemo(
    () =>
      CHANNEL_ALERT_SENT_FILTERS.map((item) => ({
        value: item.value,
        label: t(item.labelKey),
      })),
    [t]
  )

  const updateDraft = (
    field: keyof ChannelAlertFilterDraft,
    value: ChannelAlertFilterDraft[keyof ChannelAlertFilterDraft]
  ) => {
    props.onChange({ ...props.draft, [field]: value })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') props.onApply()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Channel alert filters')}</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-6'>
        <div className='space-y-1.5'>
          <Label htmlFor='channel-alert-channel-id'>{t('Channel ID')}</Label>
          <Input
            id='channel-alert-channel-id'
            inputMode='numeric'
            value={props.draft.channel_id}
            onChange={(event) => updateDraft('channel_id', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className='space-y-1.5'>
          <Label>{t('Source')}</Label>
          <Select
            items={sourceItems}
            value={props.draft.source}
            onValueChange={(value) =>
              updateDraft(
                'source',
                getSourceFilterValue(value) as ChannelAlertSourceFilter
              )
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue>
                {t(channelAlertSourceLabelKey(props.draft.source))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {CHANNEL_ALERT_SOURCES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='channel-alert-rule-key'>{t('Rule')}</Label>
          <Input
            id='channel-alert-rule-key'
            value={props.draft.rule_key}
            onChange={(event) => updateDraft('rule_key', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className='space-y-1.5'>
          <Label>{t('Alert Sent')}</Label>
          <Select
            items={sentItems}
            value={props.draft.alert_sent}
            onValueChange={(value) =>
              updateDraft(
                'alert_sent',
                getSentFilterValue(value) as ChannelAlertSentFilter
              )
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue>
                {t(channelAlertSentLabelKey(props.draft.alert_sent))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {CHANNEL_ALERT_SENT_FILTERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='channel-alert-start-time'>{t('Start Time')}</Label>
          <Input
            id='channel-alert-start-time'
            placeholder={t('timestamp or date')}
            value={props.draft.start_time}
            onChange={(event) => updateDraft('start_time', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='channel-alert-end-time'>{t('End Time')}</Label>
          <Input
            id='channel-alert-end-time'
            placeholder={t('timestamp or date')}
            value={props.draft.end_time}
            onChange={(event) => updateDraft('end_time', event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className='flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-6'>
          <Button
            type='button'
            onClick={props.onApply}
            disabled={props.isLoading}
          >
            <Search />
            {t('Apply Filters')}
          </Button>
          <Button type='button' variant='outline' onClick={props.onReset}>
            <RotateCcw />
            {t('Reset')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function getSourceFilterValue(value: unknown): ChannelAlertSourceFilter {
  return CHANNEL_ALERT_SOURCES.some((item) => item.value === value)
    ? (value as ChannelAlertSourceFilter)
    : 'all'
}

function getSentFilterValue(value: unknown): ChannelAlertSentFilter {
  return CHANNEL_ALERT_SENT_FILTERS.some((item) => item.value === value)
    ? (value as ChannelAlertSentFilter)
    : 'all'
}
