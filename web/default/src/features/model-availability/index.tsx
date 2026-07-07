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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Clock,
  Gauge,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  formatNumber,
  formatPercent,
  formatTimestampToDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  getModelAvailabilityDisplaySettings,
  getModelAvailabilityErrors,
  getModelAvailabilityModels,
  getModelAvailabilitySummary,
  updateModelAvailabilityDisplaySettings,
} from './api'
import type {
  ApiResponse,
  ModelAvailabilityError,
  ModelAvailabilityModel,
  ModelAvailabilityModelsData,
  ModelAvailabilityQuery,
  ModelAvailabilitySummary,
  PublicDisplaySettings,
  PublicDisplaySettingsItem,
} from './types'

type WindowOption = {
  value: string
  labelKey: string
}

type HealthOption = {
  value: string
  labelKey: string
}

type DisplaySettingsDraft = {
  publicEnabled: boolean
}

const WINDOW_OPTIONS: WindowOption[] = [
  { value: '1', labelKey: 'Last 1 hour' },
  { value: '6', labelKey: 'Last 6 hours' },
  { value: '24', labelKey: 'Last 24 hours' },
  { value: '168', labelKey: 'Last 7 days' },
]

const HEALTH_OPTIONS: HealthOption[] = [
  { value: '__all__', labelKey: 'All availability statuses' },
  { value: 'available', labelKey: 'Available' },
  { value: 'degraded', labelKey: 'Degraded' },
  { value: 'unavailable', labelKey: 'Unavailable' },
  { value: 'insufficient', labelKey: 'Insufficient sample' },
]

function requireData<T>(response: ApiResponse<T>, fallbackMessage: string): T {
  if (!response.success || response.data == null) {
    throw new Error(response.message || fallbackMessage)
  }
  return response.data
}

function formatRate(value?: number): string {
  if (value == null || Number.isNaN(value)) return '-'
  const normalized = value <= 1 ? value * 100 : value
  return formatPercent(normalized)
}

function formatDurationMs(value?: number): string {
  if (value == null || Number.isNaN(value)) return '-'
  if (value >= 1000) {
    return `${formatNumber(value / 1000)}s`
  }
  return `${formatNumber(value)}ms`
}

function healthLabelKey(status?: string): string {
  if (status === 'available') return 'Available'
  if (status === 'degraded') return 'Degraded'
  if (status === 'unavailable') return 'Unavailable'
  if (status === 'insufficient') return 'Insufficient sample'
  return 'Unknown'
}

function sampleLabelKey(status?: string): string {
  if (status === 'enough') return 'Enough samples'
  if (status === 'low') return 'Low samples'
  if (status === 'none') return 'No samples'
  return 'Unknown'
}

function healthBadgeClassName(status?: string): string {
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

function buildSettingsDraft(
  settings?: PublicDisplaySettings
): DisplaySettingsDraft {
  return {
    publicEnabled: settings?.public_enabled ?? false,
  }
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

function SummaryCards(props: {
  summary?: ModelAvailabilitySummary
  loading: boolean
}) {
  const { t } = useTranslation()
  const windowHours = props.summary?.window_hours
  const windowText = t(statDescriptionForWindow(windowHours))

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
        title={t('Availability Rate')}
        value={formatRate(props.summary?.availability_rate)}
        description={windowText}
        icon={<Activity className='size-5' aria-hidden='true' />}
        loading={props.loading}
      />
      <StatCard
        title={t('Errors')}
        value={formatNumber(props.summary?.error_count ?? 0)}
        description={t('{{count}} requests', {
          count: formatNumber(props.summary?.request_count ?? 0),
        })}
        icon={<AlertTriangle className='size-5' aria-hidden='true' />}
        loading={props.loading}
      />
      <StatCard
        title={t('Average Latency')}
        value={formatDurationMs(props.summary?.avg_latency_ms)}
        description={`${t('Average TTFT')}: ${formatDurationMs(
          props.summary?.avg_ttft_ms
        )}`}
        icon={<Gauge className='size-5' aria-hidden='true' />}
        loading={props.loading}
      />
    </div>
  )
}

function ModelHealthTable(props: {
  data?: ModelAvailabilityModelsData
  loading: boolean
  error?: Error | null
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const items = props.data?.items ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Model Health')}</CardTitle>
        <CardDescription>
          {t('Aggregated availability by model and group in the selected window.')}
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
            title={t('We could not load model availability.')}
            description={props.error.message}
            onRetry={props.onRetry}
            className='min-h-[220px]'
          />
        ) : items.length === 0 ? (
          <div className='text-muted-foreground flex min-h-32 items-center justify-center rounded-lg border text-sm'>
            {t('No model availability samples found.')}
          </div>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table className='min-w-[980px]'>
              <TableHeader>
                <TableRow className='bg-muted/40 hover:bg-muted/40'>
                  <TableHead className='px-4'>{t('Model')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Sample Status')}</TableHead>
                  <TableHead>{t('Requests')}</TableHead>
                  <TableHead>{t('Success Rate')}</TableHead>
                  <TableHead>{t('Errors')}</TableHead>
                  <TableHead>{t('Avg Latency')}</TableHead>
                  <TableHead>{t('Avg TTFT')}</TableHead>
                  <TableHead className='pr-4'>{t('Avg TPS')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.group ?? ''}:${item.model_name}`}>
                    <TableCell className='max-w-72 px-4'>
                      <div className='min-w-0'>
                        <div className='truncate font-medium'>
                          {item.model_name}
                        </div>
                        {item.group != null && (
                          <div className='text-muted-foreground truncate text-xs'>
                            {item.group}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant='secondary'
                        className={cn(
                          'gap-1.5',
                          healthBadgeClassName(item.status)
                        )}
                      >
                        {t(healthLabelKey(item.status))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {t(sampleLabelKey(item.sample_level))}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatNumber(item.request_count ?? 0)}</TableCell>
                    <TableCell>{formatRate(item.success_rate)}</TableCell>
                    <TableCell>{formatNumber(item.error_count ?? 0)}</TableCell>
                    <TableCell>{formatDurationMs(item.avg_latency_ms)}</TableCell>
                    <TableCell>{formatDurationMs(item.avg_ttft_ms)}</TableCell>
                    <TableCell className='pr-4'>
                      {formatNumber(item.avg_tps)}
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

function RecentErrorsTable(props: {
  items: ModelAvailabilityError[]
  loading: boolean
  error?: Error | null
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Recent Errors')}</CardTitle>
        <CardDescription>
          {t('Latest model-related errors for administrator troubleshooting.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <div className='space-y-2'>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className='h-10 w-full rounded-md' />
            ))}
          </div>
        ) : props.error ? (
          <ErrorState
            title={t('We could not load recent errors.')}
            description={props.error.message}
            onRetry={props.onRetry}
            className='min-h-[220px]'
          />
        ) : props.items.length === 0 ? (
          <div className='text-muted-foreground flex min-h-32 items-center justify-center rounded-lg border text-sm'>
            {t('No recent model errors found.')}
          </div>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table className='min-w-[1040px]'>
              <TableHeader>
                <TableRow className='bg-muted/40 hover:bg-muted/40'>
                  <TableHead className='px-4'>{t('Time')}</TableHead>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead>{t('Group')}</TableHead>
                  <TableHead>{t('Channel')}</TableHead>
                  <TableHead>{t('Status Code')}</TableHead>
                  <TableHead>{t('Error Code')}</TableHead>
                  <TableHead>{t('Request Path')}</TableHead>
                  <TableHead className='pr-4'>{t('Message')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.items.map((item, index) => (
                  <TableRow
                    key={`${item.request_id ?? item.created_at ?? 'error'}-${index}`}
                  >
                    <TableCell className='px-4 text-xs whitespace-nowrap'>
                      {formatTimestampToDate(item.created_at)}
                    </TableCell>
                    <TableCell className='max-w-52 truncate'>
                      {item.model_name || '-'}
                    </TableCell>
                    <TableCell>{item.group || '-'}</TableCell>
                    <TableCell className='max-w-44 truncate'>
                      {item.channel_name || item.channel_id || '-'}
                    </TableCell>
                    <TableCell>{item.status_code ?? '-'}</TableCell>
                    <TableCell className='max-w-44 truncate'>
                      {item.error_code || item.error_type || '-'}
                    </TableCell>
                    <TableCell className='max-w-52 truncate'>
                      {item.request_path || '-'}
                    </TableCell>
                    <TableCell className='max-w-80 truncate pr-4'>
                      {item.content || '-'}
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

function DisplaySettingsForm(props: {
  settings?: PublicDisplaySettings
  loading: boolean
  error?: Error | null
  saving: boolean
  onRetry: () => void
  onSave: (settings: PublicDisplaySettings) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<DisplaySettingsDraft>(() =>
    buildSettingsDraft(props.settings)
  )
  const [entriesJson, setEntriesJson] = useState('[]')
  const [parseError, setParseError] = useState('')

  useEffect(() => {
    if (props.settings == null) return
    setDraft(buildSettingsDraft(props.settings))
    setEntriesJson(JSON.stringify(props.settings.entries ?? [], null, 2))
    setParseError('')
  }, [props.settings])

  const handleSave = () => {
    let entries: PublicDisplaySettingsItem[]
    try {
      const parsed = entriesJson.trim() ? JSON.parse(entriesJson) : []
      if (!Array.isArray(parsed)) {
        throw new Error(t('Entries must be a JSON array.'))
      }
      entries = parsed as PublicDisplaySettingsItem[]
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('Display settings JSON is invalid.')
      setParseError(message)
      toast.error(message)
      return
    }

    setParseError('')
    props.onSave({
      ...(props.settings ?? {}),
      public_enabled: draft.publicEnabled,
      entries,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Public Display Settings')}</CardTitle>
        <CardDescription>
          {t('Control what model status information users can see.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <div className='space-y-3'>
            <Skeleton className='h-9 w-full rounded-md' />
            <Skeleton className='h-9 w-full rounded-md' />
            <Skeleton className='h-40 w-full rounded-md' />
          </div>
        ) : props.error ? (
          <ErrorState
            title={t('We could not load display settings.')}
            description={props.error.message}
            onRetry={props.onRetry}
            className='min-h-[220px]'
          />
        ) : (
          <div className='space-y-5'>
            <FieldGroup className='gap-4'>
              <Field orientation='horizontal'>
                <FieldContent>
                  <FieldTitle>{t('Enable public model status')}</FieldTitle>
                  <FieldDescription>
                    {t('Allow users to view the sanitized model status page.')}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  checked={draft.publicEnabled}
                  onCheckedChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      publicEnabled: value,
                    }))
                  }
                />
              </Field>
              <Field data-invalid={parseError ? true : undefined}>
                <FieldLabel htmlFor='model-availability-display-entries'>
                  {t('Display Entries JSON')}
                </FieldLabel>
                <Textarea
                  id='model-availability-display-entries'
                  value={entriesJson}
                  onChange={(event) => setEntriesJson(event.target.value)}
                  aria-invalid={parseError ? true : undefined}
                  className='min-h-56 font-mono text-xs'
                />
                <FieldDescription>
                  {t(
                    'Configure each visible group and source model with a public model ID, display name, status visibility, and sort order.'
                  )}
                </FieldDescription>
                {parseError && (
                  <Alert variant='destructive'>
                    <AlertTriangle aria-hidden='true' />
                    <AlertTitle>{t('Invalid JSON')}</AlertTitle>
                    <AlertDescription>{parseError}</AlertDescription>
                  </Alert>
                )}
              </Field>
            </FieldGroup>
            <div className='flex justify-end'>
              <Button type='button' onClick={handleSave} disabled={props.saving}>
                {props.saving ? (
                  <RefreshCw
                    data-icon='inline-start'
                    className='animate-spin'
                    aria-hidden='true'
                  />
                ) : (
                  <Save data-icon='inline-start' aria-hidden='true' />
                )}
                {props.saving ? t('Saving...') : t('Save settings')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ModelAvailability() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [windowHours, setWindowHours] = useState('24')
  const [healthStatus, setHealthStatus] = useState('__all__')

  const modelParams = useMemo<ModelAvailabilityQuery>(() => {
    return {
      hours: Number(windowHours),
      status: healthStatus === '__all__' ? undefined : healthStatus,
    }
  }, [healthStatus, windowHours])

  const summaryQuery = useQuery({
    queryKey: ['model-availability', 'summary', windowHours],
    queryFn: async () => {
      const response = await getModelAvailabilitySummary({
        hours: Number(windowHours),
      })
      return requireData(response, t('We could not load model availability.'))
    },
  })

  const modelsQuery = useQuery({
    queryKey: ['model-availability', 'models', modelParams],
    queryFn: async () => {
      const response = await getModelAvailabilityModels(modelParams)
      return requireData(response, t('We could not load model health.'))
    },
  })

  const errorsQuery = useQuery({
    queryKey: ['model-availability', 'errors', windowHours],
    queryFn: async () => {
      const response = await getModelAvailabilityErrors({
        hours: Number(windowHours),
        page_size: 20,
      })
      return requireData(response, t('We could not load recent errors.'))
    },
  })

  const displaySettingsQuery = useQuery({
    queryKey: ['model-availability', 'display-settings'],
    queryFn: async () => {
      const response = await getModelAvailabilityDisplaySettings()
      return requireData(response, t('We could not load display settings.'))
    },
  })

  const updateDisplaySettings = useMutation({
    mutationFn: updateModelAvailabilityDisplaySettings,
    onSuccess: () => {
      toast.success(t('Display settings saved.'))
      queryClient.invalidateQueries({
        queryKey: ['model-availability', 'display-settings'],
      })
    },
  })

  const refresh = () => {
    void summaryQuery.refetch()
    void modelsQuery.refetch()
    void errorsQuery.refetch()
    void displaySettingsQuery.refetch()
  }

  const summaryError =
    summaryQuery.error instanceof Error ? summaryQuery.error : null
  const modelsError = modelsQuery.error instanceof Error ? modelsQuery.error : null
  const errorsError = errorsQuery.error instanceof Error ? errorsQuery.error : null
  const displaySettingsError =
    displaySettingsQuery.error instanceof Error
      ? displaySettingsQuery.error
      : null

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Model Availability')}</span>
          <Badge variant='outline' className='shrink-0'>
            {t('Admin')}
          </Badge>
        </span>
      </SectionPageLayout.Title>
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
          <Select value={healthStatus} onValueChange={setHealthStatus}>
            <SelectTrigger className='w-[170px]' size='sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {HEALTH_OPTIONS.map((option) => (
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
            disabled={
              summaryQuery.isFetching ||
              modelsQuery.isFetching ||
              errorsQuery.isFetching ||
              displaySettingsQuery.isFetching
            }
          >
            <RefreshCw
              data-icon='inline-start'
              className={cn(
                (summaryQuery.isFetching ||
                  modelsQuery.isFetching ||
                  errorsQuery.isFetching ||
                  displaySettingsQuery.isFetching) &&
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
              title={t('We could not load model availability.')}
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

          <div className='grid gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.7fr)]'>
            <div className='flex min-w-0 flex-col gap-4'>
              <ModelHealthTable
                data={modelsQuery.data}
                loading={modelsQuery.isLoading}
                error={modelsError}
                onRetry={() => {
                  void modelsQuery.refetch()
                }}
              />
              <RecentErrorsTable
                items={errorsQuery.data?.items ?? []}
                loading={errorsQuery.isLoading}
                error={errorsError}
                onRetry={() => {
                  void errorsQuery.refetch()
                }}
              />
            </div>
            <div className='min-w-0'>
              <DisplaySettingsForm
                settings={displaySettingsQuery.data}
                loading={displaySettingsQuery.isLoading}
                error={displaySettingsError}
                saving={updateDisplaySettings.isPending}
                onRetry={() => {
                  void displaySettingsQuery.refetch()
                }}
                onSave={(settings) => updateDisplaySettings.mutate(settings)}
              />
            </div>
          </div>

          <Alert>
            <Clock aria-hidden='true' />
            <AlertTitle>{t('Passive observation')}</AlertTitle>
            <AlertDescription>
              {t(
                'Availability is calculated from real request samples and does not change routing, billing, retries, or upstream selection.'
              )}
            </AlertDescription>
          </Alert>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
