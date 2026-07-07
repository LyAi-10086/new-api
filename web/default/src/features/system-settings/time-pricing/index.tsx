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
import dayjs from 'dayjs'
import { Plus, RefreshCcw, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  getTimePricingEnabledGroups,
  getTimePricingEnabledModels,
  getTimePricingPromotions,
  getTimePricingSettings,
  updateTimePricingSettings,
} from '../api'
import type {
  TimePricingRule,
  TimePricingScopeType,
  TimePricingSettings,
} from '../types'

const allWeekdays = [0, 1, 2, 3, 4, 5, 6]

const defaultSettings: TimePricingSettings = {
  enabled: false,
  user_notice_enabled: false,
  preview_days: 7,
  version: 0,
  rules: [],
}

function todayDate() {
  return dayjs().format('YYYY-MM-DD')
}

function nextRule(): TimePricingRule {
  const id = `time_pricing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    name: '',
    enabled: true,
    timezone: 'Asia/Shanghai',
    start_date: todayDate(),
    end_date: todayDate(),
    daily_start_time: '',
    daily_end_time: '',
    days_of_week: [...allWeekdays],
    scope_type: 'all',
    groups: [],
    models: [],
    multiplier: 0.5,
    priority: 0,
    stacking: 'exclusive',
    user_visible: true,
    user_title: '',
    user_description: '',
    created_at: Math.floor(Date.now() / 1000),
  }
}

function formatDiscount(multiplier: number) {
  return `${(multiplier * 10).toFixed(2).replace(/\.?0+$/, '')}折`
}

function weekdayLabel(day: number) {
  switch (day) {
    case 0:
      return 'Sun'
    case 1:
      return 'Mon'
    case 2:
      return 'Tue'
    case 3:
      return 'Wed'
    case 4:
      return 'Thu'
    case 5:
      return 'Fri'
    default:
      return 'Sat'
  }
}

function normalizeRule(rule: TimePricingRule): TimePricingRule {
  return {
    ...rule,
    name: rule.name.trim(),
    timezone: rule.timezone.trim() || 'Asia/Shanghai',
    user_title: rule.user_title.trim() || rule.name.trim(),
    user_description: rule.user_description.trim(),
    groups:
      rule.scope_type === 'group' || rule.scope_type === 'group_model'
        ? rule.groups
        : [],
    models:
      rule.scope_type === 'model' || rule.scope_type === 'group_model'
        ? rule.models
        : [],
    days_of_week:
      rule.days_of_week.length === 0 ? [...allWeekdays] : rule.days_of_week,
    stacking: 'exclusive',
  }
}

function NumericDraftInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max?: number
  step: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number(draft)
    const fallback = Number.isFinite(value) ? value : min
    const next = Number.isFinite(parsed) ? parsed : fallback
    const clamped =
      max === undefined ? Math.max(min, next) : Math.min(max, Math.max(min, next))
    setDraft(String(clamped))
    onChange(clamped)
  }

  return (
    <Input
      type='text'
      inputMode={step < 1 ? 'decimal' : 'numeric'}
      value={draft}
      onChange={(event) => {
        const next = event.target.value.trim()
        if (/^\d*(?:\.\d*)?$/.test(next)) {
          setDraft(next)
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function RuleCard({
  rule,
  index,
  enabledModels,
  enabledGroups,
  onChange,
  onRemove,
}: {
  rule: TimePricingRule
  index: number
  enabledModels: string[]
  enabledGroups: string[]
  onChange: (rule: TimePricingRule) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const update = <K extends keyof TimePricingRule>(
    key: K,
    value: TimePricingRule[K]
  ) => onChange({ ...rule, [key]: value })

  const toggleWeekday = (day: number) => {
    const set = new Set(rule.days_of_week)
    if (set.has(day)) {
      set.delete(day)
    } else {
      set.add(day)
    }
    update('days_of_week', [...set].sort((a, b) => a - b))
  }

  return (
    <Card data-card-hover='false'>
      <CardHeader>
        <CardTitle className='flex min-w-0 items-center gap-2 text-base'>
          <span className='truncate'>
            {rule.name || t('Time Pricing Rule {{index}}', { index: index + 1 })}
          </span>
          <Badge variant='outline'>{formatDiscount(rule.multiplier)}</Badge>
        </CardTitle>
        <CardDescription>
          {t('Match by date, time, group and model, then apply one discount multiplier.')}
        </CardDescription>
        <CardAction>
          <div className='flex items-center gap-2'>
            <Switch
              checked={rule.enabled}
              onCheckedChange={(checked) => update('enabled', checked)}
            />
            <Button type='button' variant='ghost' size='icon-sm' onClick={onRemove}>
              <Trash2 />
              <span className='sr-only'>{t('Delete')}</span>
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className='grid gap-4 lg:grid-cols-4'>
        <div className='space-y-2 lg:col-span-2'>
          <Label>{t('Rule Name')}</Label>
          <Input
            value={rule.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder={t('Night discount')}
          />
        </div>
        <div className='space-y-2'>
          <Label>{t('Timezone')}</Label>
          <Input
            value={rule.timezone}
            onChange={(event) => update('timezone', event.target.value)}
            placeholder='Asia/Shanghai'
          />
        </div>
        <div className='space-y-2'>
          <Label>{t('Priority')}</Label>
          <NumericDraftInput
            value={rule.priority}
            min={0}
            step={1}
            onChange={(value) => update('priority', Math.floor(value))}
          />
        </div>

        <div className='space-y-2'>
          <Label>{t('Start Date')}</Label>
          <Input
            type='date'
            value={rule.start_date}
            onChange={(event) => update('start_date', event.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label>{t('End Date')}</Label>
          <Input
            type='date'
            value={rule.end_date}
            onChange={(event) => update('end_date', event.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label>{t('Daily Start')}</Label>
          <Input
            type='time'
            value={rule.daily_start_time}
            onChange={(event) => update('daily_start_time', event.target.value)}
          />
        </div>
        <div className='space-y-2'>
          <Label>{t('Daily End')}</Label>
          <Input
            type='time'
            value={rule.daily_end_time}
            onChange={(event) => update('daily_end_time', event.target.value)}
          />
        </div>

        <div className='space-y-2 lg:col-span-2'>
          <Label>{t('Weekdays')}</Label>
          <div className='flex flex-wrap gap-2'>
            {allWeekdays.map((day) => (
              <Button
                key={day}
                type='button'
                variant={rule.days_of_week.includes(day) ? 'default' : 'outline'}
                size='sm'
                onClick={() => toggleWeekday(day)}
              >
                {t(weekdayLabel(day))}
              </Button>
            ))}
          </div>
        </div>
        <div className='space-y-2'>
          <Label>{t('Discount Multiplier')}</Label>
          <NumericDraftInput
            value={rule.multiplier}
            min={0.0001}
            max={1}
            step={0.01}
            onChange={(value) => update('multiplier', Number(value.toFixed(4)))}
          />
        </div>
        <div className='space-y-2'>
          <Label>{t('Scope Type')}</Label>
          <Select
            value={rule.scope_type}
            onValueChange={(value) =>
              update('scope_type', value as TimePricingScopeType)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value='all'>{t('All groups and models')}</SelectItem>
              <SelectItem value='group'>{t('Selected groups')}</SelectItem>
              <SelectItem value='model'>{t('Selected models')}</SelectItem>
              <SelectItem value='group_model'>
                {t('Selected groups and models')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2 lg:col-span-2'>
          <Label>{t('Groups')}</Label>
          <MultiSelect
            options={enabledGroups.map((group) => ({
              label: group,
              value: group,
            }))}
            selected={rule.groups}
            onChange={(groups) => update('groups', groups)}
            placeholder={t('Select active groups...')}
            disabled={rule.scope_type !== 'group' && rule.scope_type !== 'group_model'}
            allowCreate={false}
            maxVisibleChips={6}
            copyChipOnClick
          />
        </div>
        <div className='space-y-2 lg:col-span-2'>
          <Label>{t('Models')}</Label>
          <MultiSelect
            options={enabledModels.map((model) => ({
              label: model,
              value: model,
            }))}
            selected={rule.models}
            onChange={(models) => update('models', models)}
            placeholder={t('Select enabled models...')}
            disabled={rule.scope_type !== 'model' && rule.scope_type !== 'group_model'}
            allowCreate={false}
            maxVisibleChips={6}
            copyChipOnClick
          />
        </div>

        <div className='flex items-center justify-between gap-3 rounded-lg border p-3 lg:col-span-4'>
          <div className='min-w-0'>
            <Label>{t('Show to users')}</Label>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('Visible rules can be shown as promotion notices to matching users.')}
            </p>
          </div>
          <Switch
            checked={rule.user_visible}
            onCheckedChange={(checked) => update('user_visible', checked)}
          />
        </div>
        <div className='space-y-2 lg:col-span-2'>
          <Label>{t('User Notice Title')}</Label>
          <Input
            value={rule.user_title}
            onChange={(event) => update('user_title', event.target.value)}
            placeholder={rule.name || t('Night discount')}
          />
        </div>
        <div className='space-y-2 lg:col-span-2'>
          <Label>{t('User Notice Description')}</Label>
          <Textarea
            value={rule.user_description}
            onChange={(event) => update('user_description', event.target.value)}
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function TimePricingPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<TimePricingSettings>(defaultSettings)

  const settingsQuery = useQuery({
    queryKey: ['time-pricing-settings'],
    queryFn: getTimePricingSettings,
  })
  const enabledModelsQuery = useQuery({
    queryKey: ['time-pricing-enabled-models'],
    queryFn: getTimePricingEnabledModels,
  })
  const enabledGroupsQuery = useQuery({
    queryKey: ['time-pricing-enabled-groups'],
    queryFn: getTimePricingEnabledGroups,
  })
  const promotionsQuery = useQuery({
    queryKey: ['time-pricing-promotions'],
    queryFn: getTimePricingPromotions,
  })

  const enabledModels = enabledModelsQuery.data?.data ?? []
  const enabledGroups = enabledGroupsQuery.data?.data ?? []

  useEffect(() => {
    const data = settingsQuery.data?.data
    if (!data) return
    setSettings({
      ...defaultSettings,
      ...data,
      rules: data.rules ?? [],
    })
  }, [settingsQuery.data])

  const saveMutation = useMutation({
    mutationFn: updateTimePricingSettings,
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.message || t('Save failed'))
        return
      }
      toast.success(t('Time pricing settings saved'))
      queryClient.invalidateQueries({ queryKey: ['time-pricing-settings'] })
      queryClient.invalidateQueries({ queryKey: ['time-pricing-promotions'] })
      queryClient.invalidateQueries({ queryKey: ['system-options'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Save failed'))
    },
  })

  const normalizedSettings = useMemo<TimePricingSettings>(
    () => ({
      ...settings,
      preview_days: Math.min(30, Math.max(1, Math.floor(settings.preview_days || 7))),
      rules: settings.rules.map(normalizeRule),
    }),
    [settings]
  )

  const updateRule = (index: number, rule: TimePricingRule) => {
    setSettings((current) => ({
      ...current,
      rules: current.rules.map((item, itemIndex) =>
        itemIndex === index ? rule : item
      ),
    }))
  }

  const removeRule = (index: number) => {
    setSettings((current) => ({
      ...current,
      rules: current.rules.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const isLoading =
    settingsQuery.isLoading ||
    enabledModelsQuery.isLoading ||
    enabledGroupsQuery.isLoading

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Time-based Billing')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              settingsQuery.refetch()
              enabledModelsQuery.refetch()
              enabledGroupsQuery.refetch()
              promotionsQuery.refetch()
            }}
          >
            <RefreshCcw />
            {t('Refresh')}
          </Button>
          <Button
            type='button'
            onClick={() => saveMutation.mutate(normalizedSettings)}
            disabled={isLoading || saveMutation.isPending}
          >
            <Save />
            {saveMutation.isPending ? t('Saving...') : t('Save Settings')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex w-full flex-col gap-4'>
          <Alert>
            <AlertTitle>{t('Discounts apply after normal model and group pricing.')}</AlertTitle>
            <AlertDescription>
              {t(
                'Rules are matched at request start and kept as a billing snapshot, so long requests and async tasks keep a consistent price.'
              )}
            </AlertDescription>
          </Alert>

          {isLoading ? (
            <div className='text-muted-foreground flex min-h-40 items-center justify-center text-sm'>
              {t('Loading settings...')}
            </div>
          ) : (
            <>
              <Card data-card-hover='false'>
                <CardHeader>
                  <CardTitle>{t('Basic Settings')}</CardTitle>
                  <CardDescription>
                    {t('Enable time-based billing and promotion notices.')}
                  </CardDescription>
                  <CardAction>
                    <Badge variant='outline'>
                      {t('Version {{version}}', { version: settings.version })}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className='grid gap-4 md:grid-cols-3'>
                  <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                    <div>
                      <Label>{t('Enable time-based billing')}</Label>
                      <p className='text-muted-foreground mt-1 text-xs'>
                        {t('Disabled by default. Existing pricing is unchanged.')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.enabled}
                      onCheckedChange={(checked) =>
                        setSettings((current) => ({
                          ...current,
                          enabled: checked,
                        }))
                      }
                    />
                  </div>
                  <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
                    <div>
                      <Label>{t('Show promotion notices')}</Label>
                      <p className='text-muted-foreground mt-1 text-xs'>
                        {t('Only user-visible rules are returned to users.')}
                      </p>
                    </div>
                    <Switch
                      checked={settings.user_notice_enabled}
                      onCheckedChange={(checked) =>
                        setSettings((current) => ({
                          ...current,
                          user_notice_enabled: checked,
                        }))
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>{t('Preview Days')}</Label>
                    <NumericDraftInput
                      value={settings.preview_days}
                      min={1}
                      max={30}
                      step={1}
                      onChange={(value) =>
                        setSettings((current) => ({
                          ...current,
                          preview_days: Math.floor(value),
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card data-card-hover='false'>
                <CardHeader>
                  <CardTitle>{t('Promotion Preview')}</CardTitle>
                  <CardDescription>
                    {t('Visible discounts currently returned by the user promotion endpoint.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col gap-2'>
                  {(promotionsQuery.data?.data ?? []).length === 0 ? (
                    <div className='text-muted-foreground rounded-lg border p-4 text-sm'>
                      {t('No visible promotions for the current user context.')}
                    </div>
                  ) : (
                    promotionsQuery.data?.data.map((promotion) => (
                      <div
                        key={promotion.id}
                        className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'
                      >
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='font-medium'>
                              {promotion.user_title || promotion.name}
                            </span>
                            <Badge variant='secondary'>
                              {formatDiscount(promotion.multiplier)}
                            </Badge>
                            <Badge variant='outline'>{t(promotion.status)}</Badge>
                          </div>
                          <p className='text-muted-foreground mt-1 text-xs'>
                            {promotion.start_date} - {promotion.end_date}
                            {promotion.daily_start_time &&
                              `, ${promotion.daily_start_time} - ${promotion.daily_end_time}`}
                          </p>
                        </div>
                        <div className='text-muted-foreground max-w-xl text-sm'>
                          {promotion.user_description || '-'}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className='flex items-center justify-between gap-2'>
                <div>
                  <h2 className='text-lg font-semibold'>{t('Billing Rules')}</h2>
                  <p className='text-muted-foreground text-sm'>
                    {t('{{count}} rules configured', {
                      count: settings.rules.length,
                    })}
                  </p>
                </div>
                <Button
                  type='button'
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      rules: [...current.rules, nextRule()],
                    }))
                  }
                >
                  <Plus />
                  {t('Add Rule')}
                </Button>
              </div>

              {settings.rules.length === 0 ? (
                <div className='text-muted-foreground flex min-h-32 items-center justify-center rounded-lg border text-sm'>
                  {t('No time-based billing rules yet')}
                </div>
              ) : (
                settings.rules.map((rule, index) => (
                  <RuleCard
                    key={rule.id || index}
                    rule={rule}
                    index={index}
                    enabledGroups={enabledGroups}
                    enabledModels={enabledModels}
                    onChange={(next) => updateRule(index, next)}
                    onRemove={() => removeRule(index)}
                  />
                ))
              )}
            </>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
