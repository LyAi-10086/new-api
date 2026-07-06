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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  Eye,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { SectionPageLayout } from '@/components/layout'
import { MultiSelect } from '@/components/multi-select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
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
  getSensitiveEnabledGroups,
  getSensitiveEnabledModels,
  getSensitiveSettings,
  getSensitiveViolation,
  getSensitiveViolations,
  updateSensitiveSettings,
} from '../api'
import type {
  SensitiveModelScopeMode,
  SensitiveSettings,
  SensitiveViolation,
  SensitiveViolationFilters,
} from '../types'

const sensitiveSettingsSchema = z.object({
  check_sensitive_enabled: z.boolean(),
  check_sensitive_on_prompt_enabled: z.boolean(),
  sensitive_words: z.string(),
  model_scope: z.object({
    mode: z.enum(['all', 'include', 'exclude']),
    models: z.array(z.string()),
    group_mode: z.enum(['all', 'include', 'exclude']),
    groups: z.array(z.string()),
  }),
  violation_policy: z.object({
    user_enabled: z.boolean(),
    user_threshold: z.number().min(0).max(100000000),
    token_enabled: z.boolean(),
    token_threshold: z.number().min(0).max(100000000),
  }),
})

const defaultSensitiveSettings: SensitiveSettings = {
  check_sensitive_enabled: true,
  check_sensitive_on_prompt_enabled: true,
  sensitive_words: '',
  model_scope: {
    mode: 'all',
    models: [],
    group_mode: 'all',
    groups: [],
  },
  violation_policy: {
    user_enabled: false,
    user_threshold: 0,
    token_enabled: false,
    token_threshold: 0,
  },
}

type SensitiveSettingsFormValues = z.infer<typeof sensitiveSettingsSchema>

type ViolationFilterDraft = {
  user_id: string
  token_id: string
  model_name: string
  group_name: string
  start_time: string
  end_time: string
}

const emptyViolationFilterDraft: ViolationFilterDraft = {
  user_id: '',
  token_id: '',
  model_name: '',
  group_name: '',
  start_time: '',
  end_time: '',
}

function toUnixSeconds(value: string) {
  if (!value) return undefined
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return undefined
  return String(Math.floor(timestamp / 1000))
}

function displayNumber(value: number) {
  return value > 0 ? String(value) : '-'
}

function formatMatchedWords(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map(String).join(', ')
    }
  } catch {
    /* keep raw value */
  }
  return raw
}

function useSensitiveViolationDetail(id: number | null) {
  return useQuery({
    queryKey: ['sensitive-violation', id],
    queryFn: () => getSensitiveViolation(id ?? 0),
    enabled: id != null,
  })
}

function SensitiveViolationDetailDialog({
  violationId,
  onOpenChange,
}: {
  violationId: number | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const detailQuery = useSensitiveViolationDetail(violationId)
  const violation = detailQuery.data?.data

  return (
    <Dialog open={violationId != null} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-hidden sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Violation Details')}</DialogTitle>
          <DialogDescription>
            {t('Full prompt content is only shown in this detail view.')}
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className='text-muted-foreground flex min-h-32 items-center justify-center text-sm'>
            {t('Loading violation details...')}
          </div>
        ) : violation ? (
          <div className='flex min-h-0 flex-col gap-4 overflow-y-auto pr-1'>
            <div className='grid gap-3 text-sm sm:grid-cols-2'>
              <DetailItem label={t('Record ID')} value={violation.id} />
              <DetailItem
                label={t('Created At')}
                value={dayjs.unix(violation.created_at).format('YYYY-MM-DD HH:mm:ss')}
              />
              <DetailItem label={t('User ID')} value={displayNumber(violation.user_id)} />
              <DetailItem label={t('Token ID')} value={displayNumber(violation.token_id)} />
              <DetailItem label={t('Group')} value={violation.group_name || '-'} />
              <DetailItem label={t('Model')} value={violation.model_name || '-'} />
              <DetailItem label={t('Request Path')} value={violation.request_path || '-'} />
              <DetailItem label={t('Request ID')} value={violation.request_id || '-'} />
              <DetailItem label={t('IP Address')} value={violation.ip || '-'} />
              <DetailItem
                label={t('Matched Keywords')}
                value={formatMatchedWords(violation.matched_words) || '-'}
              />
              <DetailItem label={t('Disposition')} value={violation.action_result || '-'} />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t('Full Content')}</Label>
              <pre className='bg-muted/50 text-foreground max-h-[38vh] overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap'>
                {violation.content || ''}
              </pre>
            </div>
          </div>
        ) : (
          <div className='text-muted-foreground flex min-h-32 items-center justify-center text-sm'>
            {t('No violation details found')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='min-w-0 rounded-lg border p-2'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='truncate font-medium'>{value}</div>
    </div>
  )
}

function buildViolationQueryFilters(
  draft: ViolationFilterDraft,
  page: number,
  pageSize: number
): SensitiveViolationFilters {
  return {
    user_id: draft.user_id || undefined,
    token_id: draft.token_id || undefined,
    model_name: draft.model_name || undefined,
    group_name: draft.group_name || undefined,
    start_time: toUnixSeconds(draft.start_time),
    end_time: toUnixSeconds(draft.end_time),
    p: page,
    page_size: pageSize,
  }
}

function ViolationsTable({
  violations,
  onView,
}: {
  violations: SensitiveViolation[]
  onView: (id: number) => void
}) {
  const { t } = useTranslation()

  if (violations.length === 0) {
    return (
      <div className='text-muted-foreground flex min-h-32 items-center justify-center rounded-lg border text-sm'>
        {t('No violation records found')}
      </div>
    )
  }

  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table className='min-w-[1200px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Record ID')}</TableHead>
            <TableHead>{t('User ID')}</TableHead>
            <TableHead>{t('Token ID')}</TableHead>
            <TableHead>{t('Group')}</TableHead>
            <TableHead>{t('Model')}</TableHead>
            <TableHead>{t('Matched Keywords')}</TableHead>
            <TableHead>{t('Preview')}</TableHead>
            <TableHead>{t('Disposition')}</TableHead>
            <TableHead>{t('Created At')}</TableHead>
            <TableHead className='text-right'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {violations.map((violation) => (
            <TableRow key={violation.id}>
              <TableCell className='font-medium'>{violation.id}</TableCell>
              <TableCell>{displayNumber(violation.user_id)}</TableCell>
              <TableCell>{displayNumber(violation.token_id)}</TableCell>
              <TableCell className='max-w-32 truncate'>
                {violation.group_name || '-'}
              </TableCell>
              <TableCell className='max-w-36 truncate'>
                {violation.model_name || '-'}
              </TableCell>
              <TableCell className='max-w-40 truncate'>
                {formatMatchedWords(violation.matched_words) || '-'}
              </TableCell>
              <TableCell className='max-w-72 truncate'>
                {violation.content_preview}
              </TableCell>
              <TableCell>
                <Badge variant='outline'>{violation.action_result}</Badge>
              </TableCell>
              <TableCell className='whitespace-nowrap'>
                {dayjs.unix(violation.created_at).format('YYYY-MM-DD HH:mm')}
              </TableCell>
              <TableCell className='text-right'>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => onView(violation.id)}
                  title={t('View details')}
                >
                  <Eye />
                  <span className='sr-only'>{t('View details')}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function SensitiveRiskPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [draftFilters, setDraftFilters] = useState<ViolationFilterDraft>(
    emptyViolationFilterDraft
  )
  const [appliedFilters, setAppliedFilters] = useState<ViolationFilterDraft>(
    emptyViolationFilterDraft
  )
  const [detailViolationId, setDetailViolationId] = useState<number | null>(null)
  const pageSize = 10

  const settingsQuery = useQuery({
    queryKey: ['sensitive-settings'],
    queryFn: getSensitiveSettings,
  })
  const enabledModelsQuery = useQuery({
    queryKey: ['sensitive-enabled-models'],
    queryFn: getSensitiveEnabledModels,
  })
  const enabledGroupsQuery = useQuery({
    queryKey: ['sensitive-enabled-groups'],
    queryFn: getSensitiveEnabledGroups,
  })
  const enabledModels = enabledModelsQuery.data?.data ?? []
  const enabledGroups = enabledGroupsQuery.data?.data ?? []
  const enabledModelSet = useMemo(() => new Set(enabledModels), [enabledModels])
  const enabledGroupSet = useMemo(() => new Set(enabledGroups), [enabledGroups])

  const form = useForm<SensitiveSettingsFormValues>({
    resolver: zodResolver(sensitiveSettingsSchema),
    defaultValues: defaultSensitiveSettings,
  })

  useEffect(() => {
    const settings = settingsQuery.data?.data
    if (!settings) return
    form.reset({
      ...settings,
      model_scope: {
        ...settings.model_scope,
        models: enabledModelsQuery.isSuccess
          ? settings.model_scope.models.filter((model) =>
              enabledModelSet.has(model)
            )
          : settings.model_scope.models,
        group_mode: settings.model_scope.group_mode ?? 'all',
        groups: enabledGroupsQuery.isSuccess
          ? (settings.model_scope.groups ?? []).filter((group) =>
              enabledGroupSet.has(group)
            )
          : (settings.model_scope.groups ?? []),
      },
    })
  }, [
    enabledGroupSet,
    enabledGroupsQuery.isSuccess,
    enabledModelSet,
    enabledModelsQuery.isSuccess,
    form,
    settingsQuery.data?.data,
  ])

  const updateMutation = useMutation({
    mutationFn: updateSensitiveSettings,
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message || t('Failed to update setting'))
        return
      }
      toast.success(t('Setting updated successfully'))
      queryClient.invalidateQueries({ queryKey: ['sensitive-settings'] })
      queryClient.invalidateQueries({ queryKey: ['system-options'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to update setting'))
    },
  })

  const violationQueryFilters = useMemo(
    () => buildViolationQueryFilters(appliedFilters, page, pageSize),
    [appliedFilters, page]
  )
  const violationsQuery = useQuery({
    queryKey: ['sensitive-violations', violationQueryFilters],
    queryFn: () => getSensitiveViolations(violationQueryFilters),
  })
  const violationsPage = violationsQuery.data?.data
  const totalPages = Math.max(
    1,
    Math.ceil((violationsPage?.total ?? 0) / pageSize)
  )

  const modelScopeMode = form.watch('model_scope.mode')
  const selectedModels = form.watch('model_scope.models')
  const groupScopeMode = form.watch('model_scope.group_mode')
  const selectedGroups = form.watch('model_scope.groups')

  const onSubmit = async (values: SensitiveSettingsFormValues) => {
    const payload: SensitiveSettings = {
      ...values,
      model_scope: {
        mode: values.model_scope.mode,
        models:
          values.model_scope.mode === 'all'
            ? []
            : values.model_scope.models.filter((model) =>
                enabledModelSet.has(model)
              ),
        group_mode: values.model_scope.group_mode,
        groups:
          values.model_scope.group_mode === 'all'
            ? []
            : values.model_scope.groups.filter((group) =>
                enabledGroupSet.has(group)
              ),
      },
      violation_policy: {
        user_enabled:
          values.violation_policy.user_enabled &&
          values.violation_policy.user_threshold > 0,
        user_threshold: values.violation_policy.user_threshold,
        token_enabled:
          values.violation_policy.token_enabled &&
          values.violation_policy.token_threshold > 0,
        token_threshold: values.violation_policy.token_threshold,
      },
    }
    await updateMutation.mutateAsync(payload)
  }

  const applyFilters = () => {
    setPage(1)
    setAppliedFilters(draftFilters)
  }

  const clearFilters = () => {
    setPage(1)
    setDraftFilters(emptyViolationFilterDraft)
    setAppliedFilters(emptyViolationFilterDraft)
  }

  const isLoading =
    settingsQuery.isLoading ||
    enabledModelsQuery.isLoading ||
    enabledGroupsQuery.isLoading

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Sensitive Risk Control')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              settingsQuery.refetch()
              enabledModelsQuery.refetch()
              enabledGroupsQuery.refetch()
              violationsQuery.refetch()
            }}
          >
            <RefreshCcw />
            {t('Refresh')}
          </Button>
          <Button
            type='button'
            onClick={form.handleSubmit(onSubmit)}
            disabled={updateMutation.isPending || isLoading}
          >
            <Save />
            {updateMutation.isPending ? t('Saving...') : t('Save Settings')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex w-full flex-col gap-4'>
          <Alert>
            <ShieldAlert />
            <AlertTitle>{t('Request Preflight Risk Control')}</AlertTitle>
            <AlertDescription>
              {t(
                'Sensitive prompts are intercepted before upstream forwarding, with violation evidence and optional automatic disposition kept in this system.'
              )}
            </AlertDescription>
          </Alert>

          {isLoading ? (
            <div className='text-muted-foreground flex min-h-40 items-center justify-center text-sm'>
              {t('Loading settings...')}
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='flex flex-col gap-4'
              >
                <Card>
                  <CardHeader>
                    <CardTitle>{t('Basic Rules')}</CardTitle>
                    <CardDescription>
                      {t('Configure the global switch and keyword list.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-4'>
                    <div className='grid gap-4 md:grid-cols-2'>
                      <FormField
                        control={form.control}
                        name='check_sensitive_enabled'
                        render={({ field }) => (
                          <FormItem className='flex min-w-0 items-center justify-between gap-4 rounded-lg border p-3'>
                            <div className='min-w-0 space-y-1'>
                              <FormLabel>{t('Enable filtering')}</FormLabel>
                              <FormDescription>
                                {t(
                                  'Blocks messages when sensitive keywords are detected.'
                                )}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name='check_sensitive_on_prompt_enabled'
                        render={({ field }) => (
                          <FormItem className='flex min-w-0 items-center justify-between gap-4 rounded-lg border p-3'>
                            <div className='min-w-0 space-y-1'>
                              <FormLabel>{t('Inspect user prompts')}</FormLabel>
                              <FormDescription>
                                {t(
                                  'When enabled, prompts are scanned before reaching upstream models.'
                                )}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name='sensitive_words'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Blocked keywords')}</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={10}
                              placeholder={t('Enter one keyword per line')}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Each line represents one keyword. Leave blank to disable the list but keep the switch states.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('Group Scope')}</CardTitle>
                    <CardDescription>
                      {t('Choose which active groups should apply sensitive keyword checks.')}
                    </CardDescription>
                    <CardAction>
                      <Badge variant='outline'>
                        {t('{{count}} groups enabled', {
                          count: enabledGroups.length,
                        })}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className='grid gap-4 md:grid-cols-[240px_1fr]'>
                    <FormField
                      control={form.control}
                      name='model_scope.group_mode'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Scope Mode')}</FormLabel>
                          <Select<SensitiveModelScopeMode>
                            value={field.value}
                            onValueChange={(value) =>
                              field.onChange(value as SensitiveModelScopeMode)
                            }
                          >
                            <FormControl>
                              <SelectTrigger className='w-full'>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent alignItemWithTrigger={false}>
                              <SelectGroup>
                                <SelectItem value='all'>{t('All groups')}</SelectItem>
                                <SelectItem value='include'>
                                  {t('Only selected groups')}
                                </SelectItem>
                                <SelectItem value='exclude'>
                                  {t('Exclude selected groups')}
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {t('Default all keeps every active group under the model scope.')}
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='model_scope.groups'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Selected Groups')}</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={enabledGroups.map((group) => ({
                                label: group,
                                value: group,
                              }))}
                              selected={field.value}
                              onChange={field.onChange}
                              placeholder={t('Select active groups...')}
                              disabled={groupScopeMode === 'all'}
                              allowCreate={false}
                              maxVisibleChips={6}
                              copyChipOnClick
                            />
                          </FormControl>
                          <FormDescription>
                            {groupScopeMode === 'all'
                              ? t('All active groups are currently checked.')
                              : t('{{count}} groups selected', {
                                  count: selectedGroups.length,
                                })}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('Model Scope')}</CardTitle>
                    <CardDescription>
                      {t('Choose which enabled models should apply sensitive keyword checks.')}
                    </CardDescription>
                    <CardAction>
                      <Badge variant='outline'>
                        {t('{{count}} models enabled', {
                          count: enabledModels.length,
                        })}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className='grid gap-4 md:grid-cols-[240px_1fr]'>
                    <FormField
                      control={form.control}
                      name='model_scope.mode'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Scope Mode')}</FormLabel>
                          <Select<SensitiveModelScopeMode>
                            value={field.value}
                            onValueChange={(value) =>
                              field.onChange(value as SensitiveModelScopeMode)
                            }
                          >
                            <FormControl>
                              <SelectTrigger className='w-full'>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent alignItemWithTrigger={false}>
                              <SelectGroup>
                                <SelectItem value='all'>{t('All models')}</SelectItem>
                                <SelectItem value='include'>
                                  {t('Only selected models')}
                                </SelectItem>
                                <SelectItem value='exclude'>
                                  {t('Exclude selected models')}
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {t('Default all keeps the existing behavior after upgrade.')}
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='model_scope.models'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Selected Models')}</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={enabledModels.map((model) => ({
                                label: model,
                                value: model,
                              }))}
                              selected={field.value}
                              onChange={field.onChange}
                              placeholder={t('Select enabled models...')}
                              disabled={modelScopeMode === 'all'}
                              allowCreate={false}
                              maxVisibleChips={6}
                              copyChipOnClick
                            />
                          </FormControl>
                          <FormDescription>
                            {modelScopeMode === 'all'
                              ? t('All enabled models are currently checked.')
                              : t('{{count}} models selected', {
                                  count: selectedModels.length,
                                })}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('Violation Disposition')}</CardTitle>
                    <CardDescription>
                      {t('Automatically disable users or tokens after cumulative violations.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='grid gap-4 md:grid-cols-2'>
                    <FormField
                      control={form.control}
                      name='violation_policy.user_enabled'
                      render={({ field }) => (
                        <FormItem className='flex min-w-0 flex-col gap-3 rounded-lg border p-3'>
                          <div className='flex items-center justify-between gap-4'>
                            <div className='min-w-0 space-y-1'>
                              <FormLabel>{t('Auto-disable users')}</FormLabel>
                              <FormDescription>
                                {t('Disabled by historical cumulative violation count.')}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </div>
                          <FormField
                            control={form.control}
                            name='violation_policy.user_threshold'
                            render={({ field: thresholdField }) => (
                              <FormItem>
                                <FormLabel>{t('User threshold')}</FormLabel>
                                <FormControl>
                                  <Input
                                    type='number'
                                    min={0}
                                    step={1}
                                    {...thresholdField}
                                    onChange={(event) =>
                                      thresholdField.onChange(
                                        Number(event.target.value) || 0
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormDescription>
                                  {t('0 means disabled. Default is off.')}
                                </FormDescription>
                              </FormItem>
                            )}
                          />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='violation_policy.token_enabled'
                      render={({ field }) => (
                        <FormItem className='flex min-w-0 flex-col gap-3 rounded-lg border p-3'>
                          <div className='flex items-center justify-between gap-4'>
                            <div className='min-w-0 space-y-1'>
                              <FormLabel>{t('Auto-disable tokens')}</FormLabel>
                              <FormDescription>
                                {t('Disable only the triggering token after threshold.')}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </div>
                          <FormField
                            control={form.control}
                            name='violation_policy.token_threshold'
                            render={({ field: thresholdField }) => (
                              <FormItem>
                                <FormLabel>{t('Token threshold')}</FormLabel>
                                <FormControl>
                                  <Input
                                    type='number'
                                    min={0}
                                    step={1}
                                    {...thresholdField}
                                    onChange={(event) =>
                                      thresholdField.onChange(
                                        Number(event.target.value) || 0
                                      )
                                    }
                                  />
                                </FormControl>
                                <FormDescription>
                                  {t('0 means disabled. Default is off.')}
                                </FormDescription>
                              </FormItem>
                            )}
                          />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </form>
            </Form>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('Violation Records')}</CardTitle>
              <CardDescription>
                {t('Review intercepted requests, filters, and full details.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <div className='grid gap-3 md:grid-cols-6'>
                <div className='space-y-1.5'>
                  <Label htmlFor='sensitive-filter-user'>{t('User ID')}</Label>
                  <Input
                    id='sensitive-filter-user'
                    inputMode='numeric'
                    value={draftFilters.user_id}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        user_id: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='sensitive-filter-token'>{t('Token ID')}</Label>
                  <Input
                    id='sensitive-filter-token'
                    inputMode='numeric'
                    value={draftFilters.token_id}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        token_id: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label>{t('Group')}</Label>
                  <Select
                    value={draftFilters.group_name || '__all__'}
                    onValueChange={(value) =>
                      setDraftFilters((current) => ({
                        ...current,
                        group_name: value === '__all__' ? '' : value,
                      }))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value='__all__'>{t('All groups')}</SelectItem>
                        {enabledGroups.map((group) => (
                          <SelectItem key={group} value={group}>
                            {group}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1.5'>
                  <Label>{t('Model')}</Label>
                  <Select
                    value={draftFilters.model_name || '__all__'}
                    onValueChange={(value) =>
                      setDraftFilters((current) => ({
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
                        {enabledModels.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='sensitive-filter-start'>{t('Start Time')}</Label>
                  <Input
                    id='sensitive-filter-start'
                    type='datetime-local'
                    value={draftFilters.start_time}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        start_time: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='sensitive-filter-end'>{t('End Time')}</Label>
                  <Input
                    id='sensitive-filter-end'
                    type='datetime-local'
                    value={draftFilters.end_time}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        end_time: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='text-muted-foreground text-sm'>
                  {t('{{count}} records total', {
                    count: violationsPage?.total ?? 0,
                  })}
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Button type='button' variant='outline' onClick={clearFilters}>
                    <Trash2 />
                    {t('Clear Filters')}
                  </Button>
                  <Button type='button' onClick={applyFilters}>
                    <Search />
                    {t('Search')}
                  </Button>
                </div>
              </div>

              {violationsQuery.isLoading ? (
                <div className='text-muted-foreground flex min-h-32 items-center justify-center rounded-lg border text-sm'>
                  {t('Loading violation records...')}
                </div>
              ) : (
                <ViolationsTable
                  violations={violationsPage?.items ?? []}
                  onView={setDetailViolationId}
                />
              )}

              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='text-muted-foreground text-sm'>
                  {t('Page {{page}} of {{total}}', {
                    page,
                    total: totalPages,
                  })}
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    {t('Previous')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                  >
                    {t('Next')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
      <SensitiveViolationDetailDialog
        violationId={detailViolationId}
        onOpenChange={(open) => {
          if (!open) setDetailViolationId(null)
        }}
      />
    </SectionPageLayout>
  )
}
