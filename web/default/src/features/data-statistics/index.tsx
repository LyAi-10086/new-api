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
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  RefreshCcw,
  Search,
  Users,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatQuota } from '@/lib/format'

import {
  getDataStatisticsFilters,
  getDataStatisticsRankings,
  getDataStatisticsSummary,
  getDataStatisticsTrends,
} from './api'
import type {
  DataStatisticsQuery,
  DataStatisticsRankItem,
  DataStatisticsTrendPoint,
} from './types'

type FilterDraft = {
  start_time: string
  end_time: string
  granularity: 'day' | 'hour'
  model_name: string
  group: string
  user_id: string
  channel_id: string
  payment_provider: string
}

function initialFilterDraft(): FilterDraft {
  return {
    start_time: dayjs().subtract(7, 'day').format('YYYY-MM-DDTHH:mm'),
    end_time: dayjs().format('YYYY-MM-DDTHH:mm'),
    granularity: 'day',
    model_name: '',
    group: '',
    user_id: '',
    channel_id: '',
    payment_provider: '',
  }
}

function toUnixSeconds(value: string) {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return Math.floor(date.getTime() / 1000)
}

function buildQuery(draft: FilterDraft): DataStatisticsQuery {
  return {
    start_timestamp: toUnixSeconds(draft.start_time),
    end_timestamp: toUnixSeconds(draft.end_time),
    granularity: draft.granularity,
    model_name: draft.model_name || undefined,
    group: draft.group || undefined,
    user_id: draft.user_id || undefined,
    channel_id: draft.channel_id || undefined,
    payment_provider: draft.payment_provider || undefined,
  }
}

function formatMoney(value?: number) {
  return formatNumber(value ?? 0)
}

function formatBucket(bucket: number, granularity: 'day' | 'hour') {
  return dayjs.unix(bucket).format(
    granularity === 'hour' ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'
  )
}

function StatCard({
  title,
  value,
  description,
  icon,
}: {
  title: string
  value: ReactNode
  description: string
  icon: ReactNode
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-start justify-between gap-3 space-y-0'>
        <div className='min-w-0 space-y-1'>
          <CardDescription>{title}</CardDescription>
          <CardTitle className='truncate text-xl'>{value}</CardTitle>
        </div>
        <div className='text-muted-foreground shrink-0'>{icon}</div>
      </CardHeader>
      <CardContent>
        <p className='text-muted-foreground truncate text-xs'>{description}</p>
      </CardContent>
    </Card>
  )
}

function TrendTable({
  items,
  granularity,
}: {
  items: DataStatisticsTrendPoint[]
  granularity: 'day' | 'hour'
}) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return (
      <div className='text-muted-foreground flex min-h-32 items-center justify-center rounded-lg border text-sm'>
        {t('No statistics data found')}
      </div>
    )
  }

  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table className='min-w-[900px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Time')}</TableHead>
            <TableHead>{t('Consumption')}</TableHead>
            <TableHead>{t('Requests')}</TableHead>
            <TableHead>{t('Active Users')}</TableHead>
            <TableHead>{t('Errors')}</TableHead>
            <TableHead>{t('Top-up Money')}</TableHead>
            <TableHead>{t('Top-up Amount')}</TableHead>
            <TableHead>{t('New Users')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.bucket}>
              <TableCell className='whitespace-nowrap'>
                {formatBucket(item.bucket, granularity)}
              </TableCell>
              <TableCell>{formatQuota(item.consume_quota)}</TableCell>
              <TableCell>{formatNumber(item.request_count)}</TableCell>
              <TableCell>{formatNumber(item.active_users)}</TableCell>
              <TableCell>{formatNumber(item.error_count)}</TableCell>
              <TableCell>{formatMoney(item.topup_money)}</TableCell>
              <TableCell>{formatNumber(item.topup_amount)}</TableCell>
              <TableCell>{formatNumber(item.registered_users)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RankingTable({
  title,
  description,
  items,
  metric,
}: {
  title: string
  description: string
  items: DataStatisticsRankItem[]
  metric: 'consume' | 'topup' | 'balance'
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className='text-muted-foreground flex min-h-24 items-center justify-center rounded-lg border text-sm'>
            {t('No statistics data found')}
          </div>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Name')}</TableHead>
                  {metric === 'consume' && (
                    <>
                      <TableHead>{t('Consumption')}</TableHead>
                      <TableHead>{t('Requests')}</TableHead>
                    </>
                  )}
                  {metric === 'topup' && (
                    <>
                      <TableHead>{t('Top-up Money')}</TableHead>
                      <TableHead>{t('Top-up Amount')}</TableHead>
                    </>
                  )}
                  {metric === 'balance' && (
                    <>
                      <TableHead>{t('Balance')}</TableHead>
                      <TableHead>{t('Used')}</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={`${item.id ?? item.name}-${index}`}>
                    <TableCell className='max-w-52 truncate font-medium'>
                      {item.name || '-'}
                    </TableCell>
                    {metric === 'consume' && (
                      <>
                        <TableCell>{formatQuota(item.consume_quota ?? 0)}</TableCell>
                        <TableCell>{formatNumber(item.request_count ?? 0)}</TableCell>
                      </>
                    )}
                    {metric === 'topup' && (
                      <>
                        <TableCell>{formatMoney(item.topup_money)}</TableCell>
                        <TableCell>{formatNumber(item.topup_amount ?? 0)}</TableCell>
                      </>
                    )}
                    {metric === 'balance' && (
                      <>
                        <TableCell>{formatQuota(item.current_balance ?? 0)}</TableCell>
                        <TableCell>{formatQuota(item.used_quota ?? 0)}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DataStatistics() {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<FilterDraft>(() => initialFilterDraft())
  const [applied, setApplied] = useState<FilterDraft>(() => initialFilterDraft())

  const query = useMemo(() => buildQuery(applied), [applied])
  const filtersQuery = useQuery({
    queryKey: ['data-statistics-filters'],
    queryFn: getDataStatisticsFilters,
  })
  const summaryQuery = useQuery({
    queryKey: ['data-statistics-summary', query],
    queryFn: () => getDataStatisticsSummary(query),
  })
  const trendsQuery = useQuery({
    queryKey: ['data-statistics-trends', query],
    queryFn: () => getDataStatisticsTrends(query),
  })
  const rankingsQuery = useQuery({
    queryKey: ['data-statistics-rankings', query],
    queryFn: () => getDataStatisticsRankings(query),
  })

  const filterOptions = filtersQuery.data?.data
  const summary = summaryQuery.data?.data.summary
  const trendItems = trendsQuery.data?.data.items ?? []
  const rankings = rankingsQuery.data?.data.rankings
  const isLoading =
    summaryQuery.isLoading || trendsQuery.isLoading || rankingsQuery.isLoading

  const refresh = () => {
    filtersQuery.refetch()
    summaryQuery.refetch()
    trendsQuery.refetch()
    rankingsQuery.refetch()
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Data Statistics')}</span>
          <Badge variant='outline' className='shrink-0'>
            {t('Root')}
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button type='button' variant='outline' onClick={refresh}>
            <RefreshCcw />
            {t('Refresh')}
          </Button>
          <Button type='button' onClick={() => setApplied(draft)}>
            <Search />
            {t('Apply Filters')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex w-full flex-col gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Statistics Filters')}</CardTitle>
              <CardDescription>
                {t('Read-only operational statistics from recharge, usage, login, and user data.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 md:grid-cols-4 xl:grid-cols-8'>
              <div className='space-y-1.5 md:col-span-2'>
                <Label htmlFor='statistics-start-time'>{t('Start Time')}</Label>
                <Input
                  id='statistics-start-time'
                  type='datetime-local'
                  value={draft.start_time}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      start_time: event.target.value,
                    }))
                  }
                />
              </div>
              <div className='space-y-1.5 md:col-span-2'>
                <Label htmlFor='statistics-end-time'>{t('End Time')}</Label>
                <Input
                  id='statistics-end-time'
                  type='datetime-local'
                  value={draft.end_time}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      end_time: event.target.value,
                    }))
                  }
                />
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Granularity')}</Label>
                <Select
                  value={draft.granularity}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      granularity: value === 'hour' ? 'hour' : 'day',
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='day'>{t('Daily')}</SelectItem>
                      <SelectItem value='hour'>{t('Hourly')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Model')}</Label>
                <Select
                  value={draft.model_name || '__all__'}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      model_name: value === '__all__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='__all__'>{t('All models')}</SelectItem>
                      {(filterOptions?.models ?? []).map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Group')}</Label>
                <Select
                  value={draft.group || '__all__'}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      group: value === '__all__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='__all__'>{t('All groups')}</SelectItem>
                      {(filterOptions?.groups ?? []).map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='statistics-user-id'>{t('User ID')}</Label>
                <Input
                  id='statistics-user-id'
                  inputMode='numeric'
                  value={draft.user_id}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      user_id: event.target.value,
                    }))
                  }
                />
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Channel')}</Label>
                <Select
                  value={draft.channel_id || '__all__'}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      channel_id: value === '__all__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='__all__'>{t('All channels')}</SelectItem>
                      {(filterOptions?.channels ?? []).map((channel) => (
                        <SelectItem key={channel.id} value={String(channel.id)}>
                          {channel.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Payment Provider')}</Label>
                <Select
                  value={draft.payment_provider || '__all__'}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      payment_provider: value === '__all__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='__all__'>
                        {t('All payment providers')}
                      </SelectItem>
                      {(filterOptions?.payment_providers ?? []).map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className='text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border text-sm'>
              {t('Loading statistics...')}
            </div>
          ) : (
            <>
              <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                <StatCard
                  title={t('Consumption')}
                  value={formatQuota(summary?.consume_quota ?? 0)}
                  description={t('{{count}} requests', {
                    count: formatNumber(summary?.request_count ?? 0),
                  })}
                  icon={<CircleDollarSign className='size-5' />}
                />
                <StatCard
                  title={t('Active Users')}
                  value={formatNumber(summary?.active_users ?? 0)}
                  description={t('{{count}} login users', {
                    count: formatNumber(summary?.login_users ?? 0),
                  })}
                  icon={<Users className='size-5' />}
                />
                <StatCard
                  title={t('Top-up Money')}
                  value={formatMoney(summary?.topup_money)}
                  description={t('{{count}} top-up amount', {
                    count: formatNumber(summary?.topup_amount ?? 0),
                  })}
                  icon={<BarChart3 className='size-5' />}
                />
                <StatCard
                  title={t('Errors')}
                  value={formatNumber(summary?.error_count ?? 0)}
                  description={t('{{count}} new users', {
                    count: formatNumber(summary?.registered_users ?? 0),
                  })}
                  icon={<Activity className='size-5' />}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{t('Trend Overview')}</CardTitle>
                  <CardDescription>
                    {t('Usage, recharge, errors, and registrations in the selected range.')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TrendTable
                    items={trendItems}
                    granularity={applied.granularity}
                  />
                </CardContent>
              </Card>

              <div className='grid gap-4 xl:grid-cols-2'>
                <RankingTable
                  title={t('Model Consumption Ranking')}
                  description={t('Top models by consumed quota.')}
                  items={rankings?.models ?? []}
                  metric='consume'
                />
                <RankingTable
                  title={t('Group Consumption Ranking')}
                  description={t('Top groups by consumed quota.')}
                  items={rankings?.groups ?? []}
                  metric='consume'
                />
                <RankingTable
                  title={t('User Consumption Ranking')}
                  description={t('Top users by consumed quota.')}
                  items={rankings?.users ?? []}
                  metric='consume'
                />
                <RankingTable
                  title={t('Channel Consumption Ranking')}
                  description={t('Top channels by consumed quota.')}
                  items={rankings?.channels ?? []}
                  metric='consume'
                />
                <RankingTable
                  title={t('Top-up User Ranking')}
                  description={t('Top users by successful recharge.')}
                  items={rankings?.topup_users ?? []}
                  metric='topup'
                />
                <RankingTable
                  title={t('Balance User Ranking')}
                  description={t('Top users by current balance.')}
                  items={rankings?.balance_users ?? []}
                  metric='balance'
                />
              </div>
            </>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
