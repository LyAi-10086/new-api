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
import { Activity, Clock, Gauge, RefreshCw, ShieldCheck } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatNumber,
  formatTimestampToDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'

import { getModelStatusModels, getModelStatusSummary } from './api'
import type {
  ApiResponse,
  ModelStatusItem,
  ModelStatusModelsData,
  ModelStatusSummary,
} from './types'

const WINDOW_OPTIONS = [
  { value: '1', labelKey: 'Last 1 hour' },
  { value: '6', labelKey: 'Last 6 hours' },
  { value: '24', labelKey: 'Last 24 hours' },
  { value: '168', labelKey: 'Last 7 days' },
]

function requireData<T>(response: ApiResponse<T>, fallbackMessage: string): T {
  if (!response.success || response.data == null) {
    throw new Error(response.message || fallbackMessage)
  }
  return response.data
}

function statusLabelKey(status?: string): string {
  if (status === 'available') return 'Available'
  if (status === 'degraded') return 'Degraded'
  if (status === 'unavailable') return 'Unavailable'
  if (status === 'insufficient') return 'Insufficient sample'
  return 'Unknown'
}

function levelLabelKey(level?: string): string {
  if (level === 'fast') return 'Fast'
  if (level === 'normal') return 'Normal'
  if (level === 'slow') return 'Slow'
  if (level === 'high') return 'High'
  if (level === 'medium') return 'Medium'
  if (level === 'low') return 'Low'
  if (level === 'enough') return 'Enough samples'
  if (level === 'none') return 'No samples'
  return 'Unknown'
}

function statusBadgeClassName(status?: string): string {
  if (status === 'available') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  }
  if (status === 'degraded') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  }
  if (status === 'unavailable') {
    return 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
  }
  return 'bg-muted text-muted-foreground'
}

function statDescriptionForWindow(windowHours?: number): string {
  if (windowHours === 1) return 'Last 1 hour'
  if (windowHours === 6) return 'Last 6 hours'
  if (windowHours === 168) return 'Last 7 days'
  return 'Last 24 hours'
}

function StatCard(props: {
  title: string
  value: ReactNode
  description: string
  icon: ReactNode
  loading?: boolean
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-start justify-between gap-3 space-y-0'>
        <div className='min-w-0 space-y-1'>
          <CardDescription>{props.title}</CardDescription>
          <CardTitle className='truncate text-xl'>
            {props.loading ? <Skeleton className='h-6 w-20' /> : props.value}
          </CardTitle>
        </div>
        <div className='text-muted-foreground shrink-0'>{props.icon}</div>
      </CardHeader>
      <CardContent>
        <p className='text-muted-foreground truncate text-xs'>
          {props.loading ? <Skeleton className='h-4 w-32' /> : props.description}
        </p>
      </CardContent>
    </Card>
  )
}

function SummaryCards(props: { summary?: ModelStatusSummary; loading: boolean }) {
  const { t } = useTranslation()
  const windowText = t(statDescriptionForWindow(props.summary?.window_hours))

  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
      <StatCard
        title={t('Available Models')}
        value={formatNumber(props.summary?.available_models ?? 0)}
        description={t('{{count}} total models', {
          count: formatNumber(props.summary?.total_models ?? 0),
        })}
        icon={<ShieldCheck className='size-5' aria-hidden='true' />}
        loading={props.loading}
      />
      <StatCard
        title={t('Degraded Models')}
        value={formatNumber(props.summary?.degraded_models ?? 0)}
        description={windowText}
        icon={<Gauge className='size-5' aria-hidden='true' />}
        loading={props.loading}
      />
      <StatCard
        title={t('Unavailable Models')}
        value={formatNumber(props.summary?.unavailable_models ?? 0)}
        description={windowText}
        icon={<Activity className='size-5' aria-hidden='true' />}
        loading={props.loading}
      />
      <StatCard
        title={t('Insufficient Sample')}
        value={formatNumber(props.summary?.insufficient_models ?? 0)}
        description={windowText}
        icon={<Clock className='size-5' aria-hidden='true' />}
        loading={props.loading}
      />
    </div>
  )
}

function ModelStatusTable(props: {
  data?: ModelStatusModelsData
  loading: boolean
  error?: Error | null
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const items = props.data?.items ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Model Status')}</CardTitle>
        <CardDescription>
          {t('Sanitized model availability based on recent real requests.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className='h-10 w-full rounded-md' />
            ))}
          </div>
        ) : props.error ? (
          <ErrorState
            title={t('We could not load model status.')}
            description={props.error.message}
            onRetry={props.onRetry}
            className='min-h-[220px]'
          />
        ) : items.length === 0 ? (
          <div className='text-muted-foreground flex min-h-32 items-center justify-center rounded-lg border text-sm'>
            {t('No public model status is available.')}
          </div>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table className='min-w-[860px]'>
              <TableHeader>
                <TableRow className='bg-muted/40 hover:bg-muted/40'>
                  <TableHead className='px-4'>{t('Model')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Availability')}</TableHead>
                  <TableHead>{t('Latency')}</TableHead>
                  <TableHead>{t('TTFT')}</TableHead>
                  <TableHead>{t('Sample Status')}</TableHead>
                  <TableHead className='pr-4'>{t('Updated At')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: ModelStatusItem) => (
                  <TableRow key={item.public_model_id}>
                    <TableCell className='max-w-80 px-4'>
                      <div className='min-w-0'>
                        <div className='truncate font-medium'>
                          {item.display_name}
                        </div>
                        <div className='text-muted-foreground truncate text-xs'>
                          {item.public_model_id}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant='secondary'
                        className={cn('gap-1.5', statusBadgeClassName(item.status))}
                      >
                        {t(statusLabelKey(item.status))}
                      </Badge>
                    </TableCell>
                    <TableCell>{t(levelLabelKey(item.availability_level))}</TableCell>
                    <TableCell>{t(levelLabelKey(item.latency_level))}</TableCell>
                    <TableCell>{t(levelLabelKey(item.ttft_level))}</TableCell>
                    <TableCell>{t(levelLabelKey(item.sample_level))}</TableCell>
                    <TableCell className='pr-4 whitespace-nowrap'>
                      {formatTimestampToDate(item.updated_at)}
                    </TableCell>
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

export function ModelStatus() {
  const { t } = useTranslation()
  const [windowHours, setWindowHours] = useState('24')
  const hours = Number(windowHours)

  const summaryQuery = useQuery({
    queryKey: ['model-status', 'summary', hours],
    queryFn: async () => {
      const response = await getModelStatusSummary({ hours })
      return requireData(response, t('We could not load model status.'))
    },
  })

  const modelsQuery = useQuery({
    queryKey: ['model-status', 'models', hours],
    queryFn: async () => {
      const response = await getModelStatusModels({ hours })
      return requireData(response, t('We could not load model status.'))
    },
  })

  const summaryError =
    summaryQuery.error instanceof Error ? summaryQuery.error : null
  const modelsError = modelsQuery.error instanceof Error ? modelsQuery.error : null

  const refresh = () => {
    void summaryQuery.refetch()
    void modelsQuery.refetch()
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Model Status')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Select value={windowHours} onValueChange={setWindowHours}>
            <SelectTrigger className='w-[150px]' size='sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {WINDOW_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={refresh}
            disabled={summaryQuery.isFetching || modelsQuery.isFetching}
          >
            <RefreshCw
              data-icon='inline-start'
              className={cn(
                (summaryQuery.isFetching || modelsQuery.isFetching) &&
                  'animate-spin'
              )}
              aria-hidden='true'
            />
            {t('Refresh')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex w-full flex-col gap-4'>
          {summaryError ? (
            <ErrorState
              title={t('We could not load model status.')}
              description={summaryError.message}
              onRetry={() => {
                void summaryQuery.refetch()
              }}
              className='min-h-[220px]'
            />
          ) : (
            <SummaryCards
              summary={summaryQuery.data}
              loading={summaryQuery.isLoading}
            />
          )}

          <ModelStatusTable
            data={modelsQuery.data}
            loading={modelsQuery.isLoading}
            error={modelsError}
            onRetry={() => {
              void modelsQuery.refetch()
            }}
          />

          <Alert>
            <ShieldCheck aria-hidden='true' />
            <AlertTitle>{t('Sanitized public view')}</AlertTitle>
            <AlertDescription>
              {t(
                'This page only shows models available to your account and does not expose channels, internal groups, request IDs, or raw errors.'
              )}
            </AlertDescription>
          </Alert>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
