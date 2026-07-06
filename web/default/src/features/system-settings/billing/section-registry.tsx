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
import { RefreshCcw, RotateCcw, Save, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { formatQuota } from '@/lib/format'
import { parseCurrencyDisplayType } from '@/lib/currency'

import { CheckinSettingsSection } from '../general/checkin-settings-section'
import { PricingSection } from '../general/pricing-section'
import { QuotaSettingsSection } from '../general/quota-settings-section'
import { PaymentSettingsSection } from '../integrations/payment-settings-section'
import { RatioSettingsCard } from '../models/ratio-settings-card'
import type {
  AffiliateCommission,
  AffiliateCommissionFilters,
  AffiliateRechargePolicy,
  BillingSettings,
} from '../types'
import { createSectionRegistry } from '../utils/section-registry'
import {
  getAffiliateCommissions,
  getAffiliateSettings,
  settleAffiliateCommissions,
  updateAffiliateSettings,
} from '../api'

const getModelDefaults = (settings: BillingSettings) => ({
  ModelPrice: settings.ModelPrice,
  ModelRatio: settings.ModelRatio,
  CacheRatio: settings.CacheRatio,
  CreateCacheRatio: settings.CreateCacheRatio,
  CompletionRatio: settings.CompletionRatio,
  ImageRatio: settings.ImageRatio,
  AudioRatio: settings.AudioRatio,
  AudioCompletionRatio: settings.AudioCompletionRatio,
  ExposeRatioEnabled: settings.ExposeRatioEnabled,
  BillingMode: settings['billing_setting.billing_mode'],
  BillingExpr: settings['billing_setting.billing_expr'],
})

const getGroupDefaults = (settings: BillingSettings) => ({
  TopupGroupRatio: settings.TopupGroupRatio,
  GroupRatio: settings.GroupRatio,
  UserUsableGroups: settings.UserUsableGroups,
  GroupGroupRatio: settings.GroupGroupRatio,
  AutoGroups: settings.AutoGroups,
  DefaultUseAutoGroup: settings.DefaultUseAutoGroup,
  GroupSpecialUsableGroup:
    settings['group_ratio_setting.group_special_usable_group'],
})

const BILLING_SECTIONS = [
  {
    id: 'quota',
    titleKey: 'Quota Settings',
    build: (settings: BillingSettings) => (
      <QuotaSettingsSection
        defaultValues={{
          QuotaForNewUser: settings.QuotaForNewUser,
          PreConsumedQuota: settings.PreConsumedQuota,
          QuotaForInviter: settings.QuotaForInviter,
          QuotaForInvitee: settings.QuotaForInvitee,
          TopUpLink: settings.TopUpLink,
          general_setting: {
            docs_link: settings['general_setting.docs_link'],
          },
          quota_setting: {
            enable_free_model_pre_consume:
              settings['quota_setting.enable_free_model_pre_consume'],
          },
        }}
        complianceConfirmed={
          (settings['payment_setting.compliance_confirmed'] ?? false) &&
          settings['payment_setting.compliance_terms_version'] === 'v1'
        }
      />
    ),
  },
  {
    id: 'currency',
    titleKey: 'Currency & Display',
    build: (settings: BillingSettings) => (
      <PricingSection
        defaultValues={{
          QuotaPerUnit: settings.QuotaPerUnit,
          USDExchangeRate: settings.USDExchangeRate,
          DisplayInCurrencyEnabled: settings.DisplayInCurrencyEnabled,
          DisplayTokenStatEnabled: settings.DisplayTokenStatEnabled,
          general_setting: {
            quota_display_type: parseCurrencyDisplayType(
              settings['general_setting.quota_display_type']
            ),
            custom_currency_symbol:
              settings['general_setting.custom_currency_symbol'] ?? '¤',
            custom_currency_exchange_rate:
              settings['general_setting.custom_currency_exchange_rate'] ?? 1,
          },
        }}
      />
    ),
  },
  {
    id: 'model-pricing',
    titleKey: 'Model Pricing',
    build: (settings: BillingSettings) => (
      <RatioSettingsCard
        titleKey='Model Pricing'
        modelDefaults={getModelDefaults(settings)}
        groupDefaults={getGroupDefaults(settings)}
        toolPricesDefault={settings['tool_price_setting.prices']}
        visibleTabs={['models', 'tool-prices', 'upstream-sync']}
      />
    ),
  },
  {
    id: 'group-pricing',
    titleKey: 'Group Pricing',
    build: (settings: BillingSettings) => (
      <RatioSettingsCard
        titleKey='Group Pricing'
        modelDefaults={getModelDefaults(settings)}
        groupDefaults={getGroupDefaults(settings)}
        toolPricesDefault={settings['tool_price_setting.prices']}
        visibleTabs={['groups']}
      />
    ),
  },
  {
    id: 'payment',
    titleKey: 'Payment Gateway',
    build: (settings: BillingSettings) => (
      <PaymentSettingsSection
        defaultValues={{
          PayAddress: settings.PayAddress,
          EpayId: settings.EpayId,
          EpayKey: settings.EpayKey,
          Price: settings.Price,
          MinTopUp: settings.MinTopUp,
          CustomCallbackAddress: settings.CustomCallbackAddress,
          PayMethods: settings.PayMethods,
          AmountOptions: settings['payment_setting.amount_options'],
          AmountDiscount: settings['payment_setting.amount_discount'],
          StripeApiSecret: settings.StripeApiSecret,
          StripeWebhookSecret: settings.StripeWebhookSecret,
          StripePriceId: settings.StripePriceId,
          StripeUnitPrice: settings.StripeUnitPrice,
          StripeMinTopUp: settings.StripeMinTopUp,
          StripePromotionCodesEnabled: settings.StripePromotionCodesEnabled,
          CreemApiKey: settings.CreemApiKey,
          CreemWebhookSecret: settings.CreemWebhookSecret,
          CreemTestMode: settings.CreemTestMode,
          CreemProducts: settings.CreemProducts,
        }}
        waffoDefaultValues={{
          WaffoEnabled: settings.WaffoEnabled ?? false,
          WaffoApiKey: settings.WaffoApiKey ?? '',
          WaffoPrivateKey: settings.WaffoPrivateKey ?? '',
          WaffoPublicCert: settings.WaffoPublicCert ?? '',
          WaffoSandboxPublicCert: settings.WaffoSandboxPublicCert ?? '',
          WaffoSandboxApiKey: settings.WaffoSandboxApiKey ?? '',
          WaffoSandboxPrivateKey: settings.WaffoSandboxPrivateKey ?? '',
          WaffoSandbox: settings.WaffoSandbox ?? false,
          WaffoMerchantId: settings.WaffoMerchantId ?? '',
          WaffoCurrency: settings.WaffoCurrency ?? 'USD',
          WaffoUnitPrice: settings.WaffoUnitPrice ?? 1,
          WaffoMinTopUp: settings.WaffoMinTopUp ?? 1,
          WaffoNotifyUrl: settings.WaffoNotifyUrl ?? '',
          WaffoReturnUrl: settings.WaffoReturnUrl ?? '',
          WaffoPayMethods: settings.WaffoPayMethods ?? '[]',
        }}
        waffoPancakeDefaultValues={{
          WaffoPancakeMerchantID: settings.WaffoPancakeMerchantID ?? '',
          WaffoPancakePrivateKey: settings.WaffoPancakePrivateKey ?? '',
          WaffoPancakeReturnURL: settings.WaffoPancakeReturnURL ?? '',
        }}
        waffoPancakeProvisionedStoreID={settings.WaffoPancakeStoreID ?? ''}
        waffoPancakeProvisionedProductID={settings.WaffoPancakeProductID ?? ''}
        complianceDefaults={{
          confirmed: settings['payment_setting.compliance_confirmed'] ?? false,
          termsVersion:
            settings['payment_setting.compliance_terms_version'] ?? '',
          confirmedAt: settings['payment_setting.compliance_confirmed_at'] ?? 0,
          confirmedBy: settings['payment_setting.compliance_confirmed_by'] ?? 0,
        }}
      />
    ),
  },
  {
    id: 'affiliate-commission',
    titleKey: 'Referral Commission',
    build: () => <AffiliateCommissionSection />,
  },
  {
    id: 'checkin',
    titleKey: 'Check-in Rewards',
    build: (settings: BillingSettings) => (
      <CheckinSettingsSection
        defaultValues={{
          enabled: settings['checkin_setting.enabled'],
          minQuota: settings['checkin_setting.min_quota'],
          maxQuota: settings['checkin_setting.max_quota'],
        }}
      />
    ),
  },
] as const

export type BillingSectionId = (typeof BILLING_SECTIONS)[number]['id']

const billingRegistry = createSectionRegistry<
  BillingSectionId,
  BillingSettings
>({
  sections: BILLING_SECTIONS,
  defaultSection: 'quota',
  basePath: '/system-settings/billing',
  urlStyle: 'path',
})

export const BILLING_SECTION_IDS = billingRegistry.sectionIds
export const BILLING_DEFAULT_SECTION = billingRegistry.defaultSection
export const getBillingSectionNavItems = billingRegistry.getSectionNavItems
export const getBillingSectionContent = billingRegistry.getSectionContent
export const getBillingSectionMeta = billingRegistry.getSectionMeta

const defaultPolicy: AffiliateRechargePolicy = {
  enabled: false,
  attribution_days: 30,
  settlement_days: 7,
  include_manual_topup: true,
  min_topup_money: 0,
  first_topup_rate_within_7_days: 0.1,
  repeat_topup_rate_within_7_days: 0.05,
  first_topup_rate_within_30_days: 0.06,
  repeat_topup_rate_within_30_days: 0.03,
  first_topup_rate_after_30_days: 0,
  repeat_topup_rate_after_30_days: 0,
}

type CommissionFilterDraft = {
  inviter_id: string
  invitee_id: string
  topup_id: string
  trade_no: string
  status: string
}

const emptyFilterDraft: CommissionFilterDraft = {
  inviter_id: '',
  invitee_id: '',
  topup_id: '',
  trade_no: '',
  status: 'all',
}

function numberValue(value: string, fallback: number) {
  if (value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatDate(timestamp: number) {
  return timestamp > 0 ? dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm') : '-'
}

function formatRate(rate: number) {
  return `${(rate * 100).toFixed(2)}%`
}

function commissionStatusLabel(status: AffiliateCommission['status']) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'available':
      return 'Available'
    case 'transferred':
      return 'Transferred'
    case 'voided':
      return 'Voided'
    default:
      return status
  }
}

export function AffiliateCommissionSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [policy, setPolicy] = useState<AffiliateRechargePolicy>(defaultPolicy)
  const [filters, setFilters] = useState<CommissionFilterDraft>(emptyFilterDraft)
  const [appliedFilters, setAppliedFilters] =
    useState<CommissionFilterDraft>(emptyFilterDraft)
  const [page, setPage] = useState(1)

  const settingsQuery = useQuery({
    queryKey: ['affiliate-settings'],
    queryFn: getAffiliateSettings,
  })

  useEffect(() => {
    const nextPolicy = settingsQuery.data?.data?.recharge_policy
    if (nextPolicy) {
      setPolicy({
        ...defaultPolicy,
        ...nextPolicy,
      })
    }
  }, [settingsQuery.data])

  const queryFilters = useMemo<AffiliateCommissionFilters>(
    () => ({
      inviter_id: appliedFilters.inviter_id || undefined,
      invitee_id: appliedFilters.invitee_id || undefined,
      topup_id: appliedFilters.topup_id || undefined,
      trade_no: appliedFilters.trade_no || undefined,
      status:
        appliedFilters.status && appliedFilters.status !== 'all'
          ? appliedFilters.status
          : undefined,
      p: page,
      page_size: 20,
    }),
    [appliedFilters, page]
  )

  const commissionsQuery = useQuery({
    queryKey: ['affiliate-commissions', queryFilters],
    queryFn: () => getAffiliateCommissions(queryFilters),
  })

  const saveMutation = useMutation({
    mutationFn: () => updateAffiliateSettings({ recharge_policy: policy }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(t('Referral commission policy saved'))
        queryClient.invalidateQueries({ queryKey: ['affiliate-settings'] })
      } else {
        toast.error(res.message || t('Save failed'))
      }
    },
    onError: () => toast.error(t('Save failed')),
  })

  const settleMutation = useMutation({
    mutationFn: () =>
      settleAffiliateCommissions(appliedFilters.inviter_id || undefined),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(
          t('Settled {{count}} commissions, quota {{quota}}', {
            count: res.data?.settled_count ?? 0,
            quota: formatQuota(res.data?.settled_quota ?? 0),
          })
        )
        queryClient.invalidateQueries({ queryKey: ['affiliate-commissions'] })
      } else {
        toast.error(res.message || t('Settlement failed'))
      }
    },
    onError: () => toast.error(t('Settlement failed')),
  })

  const updatePolicy = <K extends keyof AffiliateRechargePolicy>(
    key: K,
    value: AffiliateRechargePolicy[K]
  ) => {
    setPolicy((current) => ({ ...current, [key]: value }))
  }

  const pageData = commissionsQuery.data?.data
  const totalPages = Math.max(1, Math.ceil((pageData?.total ?? 0) / 20))

  return (
    <div className='flex flex-col gap-4'>
      <Card data-card-hover='false'>
        <CardHeader>
          <CardTitle>{t('Recharge Commission Policy')}</CardTitle>
          <CardDescription>
            {t(
              'Reward inviters after invited users complete successful top-ups.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
            <div>
              <Label>{t('Enable recharge commission')}</Label>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Disabled by default. Existing registration rewards remain unchanged.')}
              </p>
            </div>
            <Switch
              checked={policy.enabled}
              onCheckedChange={(checked) => updatePolicy('enabled', checked)}
            />
          </div>

          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <PolicyNumberInput
              label={t('Attribution days')}
              value={policy.attribution_days}
              min={1}
              step={1}
              onChange={(value) =>
                updatePolicy('attribution_days', Math.max(1, Math.floor(value)))
              }
            />
            <PolicyNumberInput
              label={t('Settlement days')}
              value={policy.settlement_days}
              min={0}
              step={1}
              onChange={(value) =>
                updatePolicy('settlement_days', Math.max(0, Math.floor(value)))
              }
            />
            <PolicyNumberInput
              label={t('Minimum top-up amount')}
              value={policy.min_topup_money}
              min={0}
              step={0.01}
              onChange={(value) =>
                updatePolicy('min_topup_money', Math.max(0, value))
              }
            />
            <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
              <div>
                <Label>{t('Include manual top-ups')}</Label>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t('Manual admin top-ups can generate commissions.')}
                </p>
              </div>
              <Switch
                checked={policy.include_manual_topup}
                onCheckedChange={(checked) =>
                  updatePolicy('include_manual_topup', checked)
                }
              />
            </div>
          </div>

          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            <PolicyNumberInput
              label={t('First top-up rate within 7 days')}
              value={policy.first_topup_rate_within_7_days}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePolicy('first_topup_rate_within_7_days', value)
              }
            />
            <PolicyNumberInput
              label={t('Repeat top-up rate within 7 days')}
              value={policy.repeat_topup_rate_within_7_days}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePolicy('repeat_topup_rate_within_7_days', value)
              }
            />
            <PolicyNumberInput
              label={t('First top-up rate from day 8 to 30')}
              value={policy.first_topup_rate_within_30_days}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePolicy('first_topup_rate_within_30_days', value)
              }
            />
            <PolicyNumberInput
              label={t('Repeat top-up rate from day 8 to 30')}
              value={policy.repeat_topup_rate_within_30_days}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePolicy('repeat_topup_rate_within_30_days', value)
              }
            />
            <PolicyNumberInput
              label={t('First top-up rate after 30 days')}
              value={policy.first_topup_rate_after_30_days}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePolicy('first_topup_rate_after_30_days', value)
              }
            />
            <PolicyNumberInput
              label={t('Repeat top-up rate after 30 days')}
              value={policy.repeat_topup_rate_after_30_days}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePolicy('repeat_topup_rate_after_30_days', value)
              }
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Rates after 30 days apply from day 31 until the attribution window. Set 0 to disable long-tail commission.'
            )}
          </p>

          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              variant='outline'
              onClick={() => settingsQuery.refetch()}
              disabled={settingsQuery.isFetching}
            >
              <RefreshCcw className='size-4' />
              {t('Refresh')}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className='size-4' />
              {t('Save Policy')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-card-hover='false'>
        <CardHeader>
          <CardTitle>{t('Commission Records')}</CardTitle>
          <CardDescription>
            {t('Review commission attribution, settlement and transfer status.')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-2 md:grid-cols-5'>
            <Input
              placeholder={t('Inviter ID')}
              value={filters.inviter_id}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  inviter_id: event.target.value,
                }))
              }
            />
            <Input
              placeholder={t('Invitee ID')}
              value={filters.invitee_id}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  invitee_id: event.target.value,
                }))
              }
            />
            <Input
              placeholder={t('Top-up ID')}
              value={filters.topup_id}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  topup_id: event.target.value,
                }))
              }
            />
            <Input
              placeholder={t('Trade No')}
              value={filters.trade_no}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  trade_no: event.target.value,
                }))
              }
            />
            <Select
              value={filters.status}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, status: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All Statuses')}</SelectItem>
                <SelectItem value='pending'>{t('Pending')}</SelectItem>
                <SelectItem value='available'>{t('Available')}</SelectItem>
                <SelectItem value='transferred'>{t('Transferred')}</SelectItem>
                <SelectItem value='voided'>{t('Voided')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='flex flex-wrap justify-between gap-2'>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  setAppliedFilters(filters)
                  setPage(1)
                }}
              >
                <Search className='size-4' />
                {t('Filter')}
              </Button>
              <Button
                variant='ghost'
                onClick={() => {
                  setFilters(emptyFilterDraft)
                  setAppliedFilters(emptyFilterDraft)
                  setPage(1)
                }}
              >
                <RotateCcw className='size-4' />
                {t('Reset')}
              </Button>
            </div>
            <Button
              variant='secondary'
              onClick={() => settleMutation.mutate()}
              disabled={settleMutation.isPending}
            >
              <RefreshCcw className='size-4' />
              {t('Settle Due Commissions')}
            </Button>
          </div>

          <div className='overflow-hidden rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Record ID')}</TableHead>
                  <TableHead>{t('Inviter ID')}</TableHead>
                  <TableHead>{t('Invitee ID')}</TableHead>
                  <TableHead>{t('Trade No')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Reward Amount')}</TableHead>
                  <TableHead>{t('Rate')}</TableHead>
                  <TableHead>{t('Top-up Money')}</TableHead>
                  <TableHead>{t('Created At')}</TableHead>
                  <TableHead>{t('Eligible At')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissionsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className='h-24 text-center'>
                      {t('Loading commission records...')}
                    </TableCell>
                  </TableRow>
                ) : pageData?.items?.length ? (
                  pageData.items.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell>{commission.id}</TableCell>
                      <TableCell>{commission.inviter_id || '-'}</TableCell>
                      <TableCell>{commission.invitee_id || '-'}</TableCell>
                      <TableCell className='max-w-40 truncate font-mono text-xs'>
                        {commission.trade_no || '-'}
                      </TableCell>
                      <TableCell>
                        {t(commissionStatusLabel(commission.status))}
                      </TableCell>
                      <TableCell>{formatQuota(commission.reward_quota)}</TableCell>
                      <TableCell>{formatRate(commission.final_rate)}</TableCell>
                      <TableCell>{commission.topup_money.toFixed(2)}</TableCell>
                      <TableCell>{formatDate(commission.created_at)}</TableCell>
                      <TableCell>{formatDate(commission.eligible_at)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className='h-24 text-center'>
                      {t('No commission records found')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className='flex items-center justify-between text-sm'>
            <span className='text-muted-foreground'>
              {t('Total records: {{total}}', { total: pageData?.total ?? 0 })}
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {t('Previous')}
              </Button>
              <span className='text-muted-foreground text-xs'>
                {page} / {totalPages}
              </span>
              <Button
                variant='outline'
                size='sm'
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
  )
}

function PolicyNumberInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max?: number
  step: number
  onChange: (value: number) => void
}) {
  const [draftValue, setDraftValue] = useState(String(value))

  useEffect(() => {
    setDraftValue(String(value))
  }, [value])

  const normalizeValue = () => {
    const next = numberValue(draftValue, value)
    const clamped =
      max === undefined ? Math.max(min, next) : Math.min(max, Math.max(min, next))
    setDraftValue(String(clamped))
    onChange(clamped)
  }

  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <Input
        type='text'
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        value={draftValue}
        onChange={(event) => {
          const next = event.target.value.trim()
          if (/^\d*(?:\.\d*)?$/.test(next)) {
            setDraftValue(next)
          }
        }}
        onBlur={normalizeValue}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            normalizeValue()
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
