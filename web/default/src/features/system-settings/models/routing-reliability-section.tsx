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
import { useMutation, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { parseHttpStatusCodeRules } from '@/lib/http-status-code-rules'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'
import {
  getChannelAlertEvents,
  getChannelAlertStates,
  sendChannelAlertTest,
} from '../api'
import type { ChannelAlertEvent, ChannelAlertState } from '../types'

const numericString = z.string().refine((value) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  return !Number.isNaN(Number(trimmed)) && Number(trimmed) >= 0
}, 'Enter a non-negative number or leave empty')

const channelTestModes = ['scheduled_all', 'passive_recovery'] as const
type ChannelTestMode = (typeof channelTestModes)[number]
type TranslationFunction = (key: string) => string

const buildRoutingReliabilitySchema = (
  t: TranslationFunction = (key) => key
) =>
  z
    .object({
      RetryTimes: z.coerce.number().min(0).max(10),
      ChannelDisableThreshold: numericString,
      AutomaticDisableChannelEnabled: z.boolean(),
      AutomaticEnableChannelEnabled: z.boolean(),
      AutomaticDisableKeywords: z.string(),
      AutomaticDisableStatusCodes: z.string(),
      AutomaticRetryStatusCodes: z.string(),
      monitor_setting: z.object({
        auto_test_channel_enabled: z.boolean(),
        auto_test_channel_minutes: z.coerce
          .number()
          .int()
          .min(1, 'Interval must be at least 1 minute'),
        channel_test_mode: z.enum(channelTestModes),
      }),
      channel_alert_setting: z.object({
        enabled: z.boolean(),
        recipients: z.string(),
        window_seconds: z.coerce.number().int().min(1).max(86400),
        failure_threshold: z.coerce.number().int().min(1).max(10000),
        cooldown_seconds: z.coerce.number().int().min(0).max(604800),
        recovery_enabled: z.boolean(),
        recovery_cooldown_seconds: z.coerce.number().int().min(0).max(604800),
        status_codes: z.string(),
        keywords: z.string(),
        include_relay_errors: z.boolean(),
        include_scheduled_tests: z.boolean(),
        include_manual_tests: z.boolean(),
      }),
    })
    .superRefine((values, ctx) => {
    const disableParsed = parseHttpStatusCodeRules(
      values.AutomaticDisableStatusCodes
    )
    if (!disableParsed.ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['AutomaticDisableStatusCodes'],
        message: `Invalid status code rules: ${disableParsed.invalidTokens.join(
          ', '
        )}`,
      })
    }

    const retryParsed = parseHttpStatusCodeRules(
      values.AutomaticRetryStatusCodes
    )
    if (!retryParsed.ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['AutomaticRetryStatusCodes'],
        message: `Invalid status code rules: ${retryParsed.invalidTokens.join(
          ', '
        )}`,
      })
    }

    const alertParsed = parseHttpStatusCodeRules(
      values.channel_alert_setting.status_codes
    )
    if (!alertParsed.ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['channel_alert_setting', 'status_codes'],
        message: `Invalid status code rules: ${alertParsed.invalidTokens.join(
          ', '
        )}`,
      })
    }
    if (
      values.channel_alert_setting.enabled &&
      values.channel_alert_setting.recipients.trim() === ''
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['channel_alert_setting', 'recipients'],
        message: t(
          'Alert recipients are required when channel alerts are enabled'
        ),
      })
    }
  })

const routingReliabilitySchema = buildRoutingReliabilitySchema()

type RoutingReliabilityFormValues = z.output<typeof routingReliabilitySchema>
type RoutingReliabilityFormInput = z.input<typeof routingReliabilitySchema>

type RoutingReliabilitySectionProps = {
  defaultValues: {
    RetryTimes: number
    ChannelDisableThreshold: string
    AutomaticDisableChannelEnabled: boolean
    AutomaticEnableChannelEnabled: boolean
    AutomaticDisableKeywords: string
    AutomaticDisableStatusCodes: string
    AutomaticRetryStatusCodes: string
    'monitor_setting.auto_test_channel_enabled': boolean
    'monitor_setting.auto_test_channel_minutes': number
    'monitor_setting.channel_test_mode': ChannelTestMode
    'channel_alert_setting.enabled': boolean
    'channel_alert_setting.recipients': string
    'channel_alert_setting.window_seconds': number
    'channel_alert_setting.failure_threshold': number
    'channel_alert_setting.cooldown_seconds': number
    'channel_alert_setting.recovery_enabled': boolean
    'channel_alert_setting.recovery_cooldown_seconds': number
    'channel_alert_setting.status_codes': string
    'channel_alert_setting.keywords': string
    'channel_alert_setting.include_relay_errors': boolean
    'channel_alert_setting.include_scheduled_tests': boolean
    'channel_alert_setting.include_manual_tests': boolean
  }
}

function normalizeLineEndings(value: string) {
  return value.replaceAll('\r\n', '\n')
}

function parseListSetting(value?: string) {
  const raw = String(value ?? '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
  } catch {
    // fall through to delimiter parsing
  }
  return raw
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function listSettingToTextarea(value?: string) {
  return parseListSetting(value).join('\n')
}

function textareaToListSetting(value: string) {
  const unique = Array.from(
    new Set(
      normalizeLineEndings(value)
        .split(/[\n,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
  return JSON.stringify(unique)
}

function formatAlertTime(timestamp: number) {
  return timestamp > 0 ? dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm') : '-'
}

function sourceLabel(source: string) {
  switch (source) {
    case 'relay':
      return 'Real requests'
    case 'scheduled_test':
      return 'Scheduled tests'
    case 'manual_test':
      return 'Manual tests'
    default:
      return source || '-'
  }
}

function channelLabel(channelId: number, channelName?: string) {
  if (channelName) return `${channelName} (#${channelId})`
  return channelId > 0 ? `#${channelId}` : '-'
}

type NormalizedRoutingReliabilityValues = {
  RetryTimes: number
  ChannelDisableThreshold: string
  AutomaticDisableChannelEnabled: boolean
  AutomaticEnableChannelEnabled: boolean
  AutomaticDisableKeywords: string
  AutomaticDisableStatusCodes: string
  AutomaticRetryStatusCodes: string
  'monitor_setting.auto_test_channel_enabled': boolean
  'monitor_setting.auto_test_channel_minutes': number
  'monitor_setting.channel_test_mode': ChannelTestMode
  'channel_alert_setting.enabled': boolean
  'channel_alert_setting.recipients': string
  'channel_alert_setting.window_seconds': number
  'channel_alert_setting.failure_threshold': number
  'channel_alert_setting.cooldown_seconds': number
  'channel_alert_setting.recovery_enabled': boolean
  'channel_alert_setting.recovery_cooldown_seconds': number
  'channel_alert_setting.status_codes': string
  'channel_alert_setting.keywords': string
  'channel_alert_setting.include_relay_errors': boolean
  'channel_alert_setting.include_scheduled_tests': boolean
  'channel_alert_setting.include_manual_tests': boolean
}

function normalizeChannelTestMode(value?: string): ChannelTestMode {
  return value === 'passive_recovery' ? 'passive_recovery' : 'scheduled_all'
}

const buildFormDefaults = (
  defaults: RoutingReliabilitySectionProps['defaultValues']
): RoutingReliabilityFormInput => ({
  RetryTimes: defaults.RetryTimes ?? 0,
  ChannelDisableThreshold: defaults.ChannelDisableThreshold ?? '',
  AutomaticDisableChannelEnabled: defaults.AutomaticDisableChannelEnabled,
  AutomaticEnableChannelEnabled: defaults.AutomaticEnableChannelEnabled,
  AutomaticDisableKeywords: normalizeLineEndings(
    defaults.AutomaticDisableKeywords ?? ''
  ),
  AutomaticDisableStatusCodes: defaults.AutomaticDisableStatusCodes ?? '',
  AutomaticRetryStatusCodes: defaults.AutomaticRetryStatusCodes ?? '',
  monitor_setting: {
    auto_test_channel_enabled:
      defaults['monitor_setting.auto_test_channel_enabled'],
    auto_test_channel_minutes:
      defaults['monitor_setting.auto_test_channel_minutes'],
    channel_test_mode: normalizeChannelTestMode(
      defaults['monitor_setting.channel_test_mode']
    ),
  },
  channel_alert_setting: {
    enabled: defaults['channel_alert_setting.enabled'],
    recipients: listSettingToTextarea(
      defaults['channel_alert_setting.recipients']
    ),
    window_seconds: defaults['channel_alert_setting.window_seconds'],
    failure_threshold: defaults['channel_alert_setting.failure_threshold'],
    cooldown_seconds: defaults['channel_alert_setting.cooldown_seconds'],
    recovery_enabled: defaults['channel_alert_setting.recovery_enabled'],
    recovery_cooldown_seconds:
      defaults['channel_alert_setting.recovery_cooldown_seconds'],
    status_codes: defaults['channel_alert_setting.status_codes'] ?? '',
    keywords: listSettingToTextarea(defaults['channel_alert_setting.keywords']),
    include_relay_errors:
      defaults['channel_alert_setting.include_relay_errors'],
    include_scheduled_tests:
      defaults['channel_alert_setting.include_scheduled_tests'],
    include_manual_tests:
      defaults['channel_alert_setting.include_manual_tests'],
  },
})

const normalizeDefaults = (
  defaults: RoutingReliabilitySectionProps['defaultValues']
): NormalizedRoutingReliabilityValues => ({
  RetryTimes: defaults.RetryTimes ?? 0,
  ChannelDisableThreshold: (defaults.ChannelDisableThreshold ?? '').trim(),
  AutomaticDisableChannelEnabled: defaults.AutomaticDisableChannelEnabled,
  AutomaticEnableChannelEnabled: defaults.AutomaticEnableChannelEnabled,
  AutomaticDisableKeywords: normalizeLineEndings(
    defaults.AutomaticDisableKeywords ?? ''
  ),
  AutomaticDisableStatusCodes: parseHttpStatusCodeRules(
    defaults.AutomaticDisableStatusCodes ?? ''
  ).normalized,
  AutomaticRetryStatusCodes: parseHttpStatusCodeRules(
    defaults.AutomaticRetryStatusCodes ?? ''
  ).normalized,
  'monitor_setting.auto_test_channel_enabled':
    defaults['monitor_setting.auto_test_channel_enabled'],
  'monitor_setting.auto_test_channel_minutes':
    defaults['monitor_setting.auto_test_channel_minutes'],
  'monitor_setting.channel_test_mode': normalizeChannelTestMode(
    defaults['monitor_setting.channel_test_mode']
  ),
  'channel_alert_setting.enabled': defaults['channel_alert_setting.enabled'],
  'channel_alert_setting.recipients': textareaToListSetting(
    listSettingToTextarea(defaults['channel_alert_setting.recipients'])
  ),
  'channel_alert_setting.window_seconds':
    defaults['channel_alert_setting.window_seconds'],
  'channel_alert_setting.failure_threshold':
    defaults['channel_alert_setting.failure_threshold'],
  'channel_alert_setting.cooldown_seconds':
    defaults['channel_alert_setting.cooldown_seconds'],
  'channel_alert_setting.recovery_enabled':
    defaults['channel_alert_setting.recovery_enabled'],
  'channel_alert_setting.recovery_cooldown_seconds':
    defaults['channel_alert_setting.recovery_cooldown_seconds'],
  'channel_alert_setting.status_codes': parseHttpStatusCodeRules(
    defaults['channel_alert_setting.status_codes'] ?? ''
  ).normalized,
  'channel_alert_setting.keywords': textareaToListSetting(
    listSettingToTextarea(defaults['channel_alert_setting.keywords'])
  ),
  'channel_alert_setting.include_relay_errors':
    defaults['channel_alert_setting.include_relay_errors'],
  'channel_alert_setting.include_scheduled_tests':
    defaults['channel_alert_setting.include_scheduled_tests'],
  'channel_alert_setting.include_manual_tests':
    defaults['channel_alert_setting.include_manual_tests'],
})

const normalizeFormValues = (
  values: RoutingReliabilityFormValues
): NormalizedRoutingReliabilityValues => ({
  RetryTimes: values.RetryTimes,
  ChannelDisableThreshold: values.ChannelDisableThreshold.trim(),
  AutomaticDisableChannelEnabled: values.AutomaticDisableChannelEnabled,
  AutomaticEnableChannelEnabled: values.AutomaticEnableChannelEnabled,
  AutomaticDisableKeywords: normalizeLineEndings(
    values.AutomaticDisableKeywords
  ),
  AutomaticDisableStatusCodes: parseHttpStatusCodeRules(
    values.AutomaticDisableStatusCodes
  ).normalized,
  AutomaticRetryStatusCodes: parseHttpStatusCodeRules(
    values.AutomaticRetryStatusCodes
  ).normalized,
  'monitor_setting.auto_test_channel_enabled':
    values.monitor_setting.auto_test_channel_enabled,
  'monitor_setting.auto_test_channel_minutes':
    values.monitor_setting.auto_test_channel_minutes,
  'monitor_setting.channel_test_mode': values.monitor_setting.channel_test_mode,
  'channel_alert_setting.enabled': values.channel_alert_setting.enabled,
  'channel_alert_setting.recipients': textareaToListSetting(
    values.channel_alert_setting.recipients
  ),
  'channel_alert_setting.window_seconds':
    values.channel_alert_setting.window_seconds,
  'channel_alert_setting.failure_threshold':
    values.channel_alert_setting.failure_threshold,
  'channel_alert_setting.cooldown_seconds':
    values.channel_alert_setting.cooldown_seconds,
  'channel_alert_setting.recovery_enabled':
    values.channel_alert_setting.recovery_enabled,
  'channel_alert_setting.recovery_cooldown_seconds':
    values.channel_alert_setting.recovery_cooldown_seconds,
  'channel_alert_setting.status_codes': parseHttpStatusCodeRules(
    values.channel_alert_setting.status_codes
  ).normalized,
  'channel_alert_setting.keywords': textareaToListSetting(
    values.channel_alert_setting.keywords
  ),
  'channel_alert_setting.include_relay_errors':
    values.channel_alert_setting.include_relay_errors,
  'channel_alert_setting.include_scheduled_tests':
    values.channel_alert_setting.include_scheduled_tests,
  'channel_alert_setting.include_manual_tests':
    values.channel_alert_setting.include_manual_tests,
})

function ChannelAlertStatesTable({
  states,
  isLoading,
}: {
  states: ChannelAlertState[]
  isLoading: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='border-b px-3 py-2 text-sm font-medium'>
        {t('Active alert states')}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Channel ID')}</TableHead>
            <TableHead>{t('Rule')}</TableHead>
            <TableHead>{t('Window Count')}</TableHead>
            <TableHead>{t('Last Alert')}</TableHead>
            <TableHead>{t('Last Event')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className='h-20 text-center'>
                {t('Loading')}
              </TableCell>
            </TableRow>
          ) : states.length ? (
            states.map((state) => (
              <TableRow key={state.id}>
                <TableCell>{state.channel_id}</TableCell>
                <TableCell className='max-w-44 truncate font-mono text-xs'>
                  {state.rule_key}
                </TableCell>
                <TableCell>{state.window_count}</TableCell>
                <TableCell>{formatAlertTime(state.last_alert_at)}</TableCell>
                <TableCell>{state.last_event_id || '-'}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className='h-20 text-center'>
                {t('No active channel alerts')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function ChannelAlertEventsTable({
  events,
  isLoading,
}: {
  events: ChannelAlertEvent[]
  isLoading: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='border-b px-3 py-2 text-sm font-medium'>
        {t('Recent alert events')}
      </div>
      <Table className='min-w-[920px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Record ID')}</TableHead>
            <TableHead>{t('Channel')}</TableHead>
            <TableHead>{t('Source')}</TableHead>
            <TableHead>{t('Rule')}</TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead>{t('Alert Sent')}</TableHead>
            <TableHead>{t('Failure Preview')}</TableHead>
            <TableHead>{t('Created At')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className='h-20 text-center'>
                {t('Loading')}
              </TableCell>
            </TableRow>
          ) : events.length ? (
            events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{event.id}</TableCell>
                <TableCell className='max-w-44 truncate'>
                  {channelLabel(event.channel_id, event.channel_name)}
                </TableCell>
                <TableCell>{t(sourceLabel(event.source))}</TableCell>
                <TableCell className='max-w-44 truncate font-mono text-xs'>
                  {event.rule_key}
                </TableCell>
                <TableCell>{event.status_code || '-'}</TableCell>
                <TableCell>{event.alert_sent ? t('Yes') : t('No')}</TableCell>
                <TableCell className='max-w-72 truncate'>
                  {event.error_preview || '-'}
                </TableCell>
                <TableCell>{formatAlertTime(event.created_at)}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className='h-20 text-center'>
                {t('No alert events found')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function RoutingReliabilitySection({
  defaultValues,
}: RoutingReliabilitySectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const baselineRef = useRef<NormalizedRoutingReliabilityValues>(
    normalizeDefaults(defaultValues)
  )

  const formDefaults = useMemo(
    () => buildFormDefaults(defaultValues),
    [defaultValues]
  )
  const localizedRoutingReliabilitySchema = useMemo(
    () => buildRoutingReliabilitySchema(t),
    [t]
  )

  const form = useForm<
    RoutingReliabilityFormInput,
    unknown,
    RoutingReliabilityFormValues
  >({
    resolver: zodResolver(localizedRoutingReliabilitySchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  const autoDisableStatusCodes = form.watch('AutomaticDisableStatusCodes')
  const autoRetryStatusCodes = form.watch('AutomaticRetryStatusCodes')
  const channelAlertStatusCodes = form.watch(
    'channel_alert_setting.status_codes'
  )
  const channelTestMode = form.watch('monitor_setting.channel_test_mode')
  const autoDisableParsed = useMemo(
    () => parseHttpStatusCodeRules(autoDisableStatusCodes),
    [autoDisableStatusCodes]
  )
  const autoRetryParsed = useMemo(
    () => parseHttpStatusCodeRules(autoRetryStatusCodes),
    [autoRetryStatusCodes]
  )
  const channelAlertParsed = useMemo(
    () => parseHttpStatusCodeRules(channelAlertStatusCodes),
    [channelAlertStatusCodes]
  )
  const testAlertMutation = useMutation({
    mutationFn: sendChannelAlertTest,
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Test alert sent'))
      } else {
        toast.error(res.message || t('Failed to send test alert'))
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('Failed to send test alert'))
    },
  })
  const alertEventsQuery = useQuery({
    queryKey: ['channel-alert-events', 'routing-reliability'],
    queryFn: () => getChannelAlertEvents({ p: 1, page_size: 10 }),
  })
  const alertStatesQuery = useQuery({
    queryKey: ['channel-alert-states', 'routing-reliability'],
    queryFn: () => getChannelAlertStates({ active: true, p: 1, page_size: 10 }),
  })

  const onSubmit = async (values: RoutingReliabilityFormValues) => {
    const normalized = normalizeFormValues(values)
    const updates = (
      Object.keys(normalized) as Array<keyof NormalizedRoutingReliabilityValues>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of updates) {
      const value = normalized[key]
      await updateOption.mutateAsync({
        key,
        value,
      })
    }

    baselineRef.current = normalized
  }

  return (
    <SettingsSection title={t('Routing Reliability')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />

          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h4 className='text-sm font-medium'>{t('Request retry')}</h4>
            </div>
            <div className='grid min-w-0 gap-6 xl:grid-cols-[minmax(12rem,24rem)_minmax(0,1fr)]'>
              <FormField
                control={form.control}
                name='RetryTimes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Retry Times')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min='0'
                        max='10'
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Number of times to retry failed requests (0-10)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='AutomaticRetryStatusCodes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Auto-retry status codes')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('e.g. 401, 403, 429, 500-599')}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Accepts comma-separated status codes and inclusive ranges.'
                      )}{' '}
                      {autoRetryParsed.ok &&
                        autoRetryParsed.normalized &&
                        autoRetryParsed.normalized !== field.value.trim() && (
                          <span className='text-muted-foreground'>
                            {t('Normalized:')} {autoRetryParsed.normalized}
                          </span>
                        )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h4 className='text-sm font-medium'>
                {t('Channel health checks')}
              </h4>
            </div>
            <div className='grid min-w-0 gap-6 lg:grid-cols-3'>
              <FormField
                control={form.control}
                name='monitor_setting.auto_test_channel_enabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Scheduled channel tests')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Automatically probe all channels in the background'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />

              <FormField
                control={form.control}
                name='monitor_setting.channel_test_mode'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Channel test mode')}</FormLabel>
                    <Select
                      items={[
                        {
                          value: 'scheduled_all',
                          label: t('Scheduled full test'),
                        },
                        {
                          value: 'passive_recovery',
                          label: t('Passive recovery only'),
                        },
                      ]}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value='scheduled_all'>
                            {t('Scheduled full test')}
                          </SelectItem>
                          <SelectItem value='passive_recovery'>
                            {t('Passive recovery only')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t(
                        'Scheduled full test probes non-manually-disabled channels; passive recovery only checks auto-disabled channels after real request failures.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='monitor_setting.auto_test_channel_minutes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Test interval (minutes)')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        step={1}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {channelTestMode === 'passive_recovery'
                        ? t(
                            'How frequently the system checks auto-disabled channels for recovery'
                          )
                        : t('How frequently the system tests all channels')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='AutomaticEnableChannelEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Re-enable on success')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Bring channels back online after successful checks'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />
            </div>
          </div>

          <Separator />

          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h4 className='text-sm font-medium'>{t('Channel alerts')}</h4>
            </div>
            <div className='grid min-w-0 gap-6 lg:grid-cols-2'>
              <FormField
                control={form.control}
                name='channel_alert_setting.enabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Enable channel alerts')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Send email alerts when enabled channels keep failing'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />

              <FormField
                control={form.control}
                name='channel_alert_setting.recovery_enabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Recovery alerts')}</FormLabel>
                      <FormDescription>
                        {t('Notify when an alerted channel is enabled again')}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />

              <FormField
                control={form.control}
                name='channel_alert_setting.recipients'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Alert recipients')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder={t('one email per line')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Email addresses that receive channel alerts')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                <FormField
                  control={form.control}
                  name='channel_alert_setting.window_seconds'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Alert window (seconds)')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          step={1}
                          {...safeNumberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='channel_alert_setting.failure_threshold'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Failure threshold')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          step={1}
                          {...safeNumberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='channel_alert_setting.cooldown_seconds'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Alert cooldown (seconds)')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          step={1}
                          {...safeNumberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='channel_alert_setting.recovery_cooldown_seconds'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Recovery cooldown (seconds)')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={0}
                          step={1}
                          {...safeNumberFieldProps(field)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='channel_alert_setting.status_codes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Alert status codes')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('e.g. 401, 403, 429, 500-599')}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Accepts comma-separated status codes and inclusive ranges.'
                      )}{' '}
                      {channelAlertParsed.ok &&
                        channelAlertParsed.normalized &&
                        channelAlertParsed.normalized !==
                          field.value.trim() && (
                          <span className='text-muted-foreground'>
                            {t('Normalized:')} {channelAlertParsed.normalized}
                          </span>
                        )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='channel_alert_setting.keywords'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Alert keywords')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder={t('one keyword per line')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Trigger alerts when the sanitized upstream error preview contains these keywords'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid min-w-0 gap-4 sm:grid-cols-3'>
                <FormField
                  control={form.control}
                  name='channel_alert_setting.include_relay_errors'
                  render={({ field }) => (
                    <SettingsSwitchItem>
                      <SettingsSwitchContent>
                        <FormLabel>{t('Real requests')}</FormLabel>
                      </SettingsSwitchContent>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </SettingsSwitchItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='channel_alert_setting.include_scheduled_tests'
                  render={({ field }) => (
                    <SettingsSwitchItem>
                      <SettingsSwitchContent>
                        <FormLabel>{t('Scheduled tests')}</FormLabel>
                      </SettingsSwitchContent>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </SettingsSwitchItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='channel_alert_setting.include_manual_tests'
                  render={({ field }) => (
                    <SettingsSwitchItem>
                      <SettingsSwitchContent>
                        <FormLabel>{t('Manual tests')}</FormLabel>
                      </SettingsSwitchContent>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </SettingsSwitchItem>
                  )}
                />
              </div>

              <div className='flex justify-end'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={testAlertMutation.isPending}
                  onClick={() => testAlertMutation.mutate()}
                >
                  {testAlertMutation.isPending
                    ? t('Sending...')
                    : t('Send test alert')}
                </Button>
              </div>

              <div className='grid min-w-0 gap-4 xl:grid-cols-2'>
                <ChannelAlertStatesTable
                  states={alertStatesQuery.data?.data?.items ?? []}
                  isLoading={alertStatesQuery.isLoading}
                />
                <ChannelAlertEventsTable
                  events={alertEventsQuery.data?.data?.items ?? []}
                  isLoading={alertEventsQuery.isLoading}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h4 className='text-sm font-medium'>{t('Auto-disable rules')}</h4>
            </div>
            <div className='grid min-w-0 gap-6 lg:grid-cols-2'>
              <FormField
                control={form.control}
                name='AutomaticDisableChannelEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Disable on failure')}</FormLabel>
                      <FormDescription>
                        {t('Automatically disable channels when tests fail')}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />

              <FormField
                control={form.control}
                name='ChannelDisableThreshold'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Disable threshold (seconds)')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step={1}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Automatically disable channels exceeding this response time'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='AutomaticDisableStatusCodes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Auto-disable status codes')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('e.g. 401, 403, 429, 500-599')}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Accepts comma-separated status codes and inclusive ranges.'
                      )}{' '}
                      {autoDisableParsed.ok &&
                        autoDisableParsed.normalized &&
                        autoDisableParsed.normalized !== field.value.trim() && (
                          <span className='text-muted-foreground'>
                            {t('Normalized:')} {autoDisableParsed.normalized}
                          </span>
                        )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='AutomaticDisableKeywords'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Failure keywords')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        placeholder={t('one keyword per line')}
                        {...field}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'If an upstream error contains any of these keywords (case insensitive), the channel will be disabled automatically.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
