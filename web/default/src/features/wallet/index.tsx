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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getSelf } from '@/lib/api'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import {
  getSelfAffiliateCommissions,
  getSelfAffiliateReferrals,
} from './api'
import { AffiliateRewardsCard } from './components/affiliate-rewards-card'
import { BillingHistoryDialog } from './components/dialogs/billing-history-dialog'
import { CreemConfirmDialog } from './components/dialogs/creem-confirm-dialog'
import { PaymentConfirmDialog } from './components/dialogs/payment-confirm-dialog'
import { TransferDialog } from './components/dialogs/transfer-dialog'
import { RechargeFormCard } from './components/recharge-form-card'
import { SubscriptionPlansCard } from './components/subscription-plans-card'
import { WalletStatsCard } from './components/wallet-stats-card'
import { DEFAULT_DISCOUNT_RATE } from './constants'
import {
  useTopupInfo,
  usePayment,
  useAffiliate,
  useRedemption,
  useCreemPayment,
  useWaffoPayment,
  useWaffoPancakePayment,
} from './hooks'
import {
  getDefaultPaymentType,
  getMinTopupAmount,
  isWaffoPancakePayment,
} from './lib'
import type {
  UserWalletData,
  PaymentMethod,
  PresetAmount,
  CreemProduct,
  AffiliateCommissionRecord,
  AffiliateReferral,
} from './types'

interface WalletProps {
  initialShowHistory?: boolean
}

export function Wallet(props: WalletProps) {
  const { t } = useTranslation()
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>()
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [billingDialogOpen, setBillingDialogOpen] = useState(false)
  const [redemptionCode, setRedemptionCode] = useState('')
  const [creemDialogOpen, setCreemDialogOpen] = useState(false)
  const [selectedCreemProduct, setSelectedCreemProduct] =
    useState<CreemProduct | null>(null)
  const [showSubscriptionPanel, setShowSubscriptionPanel] = useState(true)

  const { status } = useStatus()
  const { currency } = useSystemConfig()
  const { topupInfo, presetAmounts, loading: topupLoading } = useTopupInfo()

  const rechargePriceRatio = useMemo(() => {
    return topupInfo?.price ?? ((status?.price as number) || 1)
  }, [status?.price, topupInfo?.price])
  const paymentCurrencySymbol = useMemo(() => {
    switch (currency?.quotaDisplayType) {
      case 'CNY':
        return '¥'
      case 'USD':
        return '$'
      case 'CUSTOM':
        return currency.customCurrencySymbol || ''
      default:
        return ''
    }
  }, [currency?.customCurrencySymbol, currency?.quotaDisplayType])
  const {
    amount: paymentAmount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
  } = usePayment()
  const { redeeming, redeemCode } = useRedemption()
  const { processing: creemProcessing, processCreemPayment } = useCreemPayment()
  const { processWaffoPayment } = useWaffoPayment()
  const { processing: pancakeProcessing, processWaffoPancakePayment } =
    useWaffoPancakePayment()

  // Fetch and refresh user data
  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const response = await getSelf()
      if (response.success && response.data) {
        setUser(response.data as UserWalletData)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch user data:', error)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (props.initialShowHistory) {
      setBillingDialogOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [props.initialShowHistory])

  // Initialize topup amount when topup info is loaded
  useEffect(() => {
    if (topupInfo && topupAmount === 0) {
      const minTopup = getMinTopupAmount(topupInfo)
      setTopupAmount(minTopup)

      // Calculate initial payment amount with default payment type
      const defaultPaymentType = getDefaultPaymentType(topupInfo)
      calculatePaymentAmount(minTopup, defaultPaymentType)
    }
  }, [topupInfo, topupAmount, calculatePaymentAmount])

  // Get current payment type (selected or default)
  const getCurrentPaymentType = useCallback(() => {
    return selectedPaymentMethod?.type || getDefaultPaymentType(topupInfo)
  }, [selectedPaymentMethod, topupInfo])

  // Handle preset selection
  const handleSelectPreset = (preset: PresetAmount) => {
    setTopupAmount(preset.value)
    setSelectedPreset(preset.value)
    calculatePaymentAmount(preset.value, getCurrentPaymentType())
  }

  // Handle topup amount change
  const handleTopupAmountChange = (amount: number) => {
    setTopupAmount(amount)
    setSelectedPreset(null)
    calculatePaymentAmount(amount, getCurrentPaymentType())
  }

  // Handle payment method selection
  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    setSelectedPaymentMethod(method)
    setPaymentLoading(method.type)

    try {
      // Validate minimum topup
      const minTopup = getMinTopupAmount(topupInfo)
      if (topupAmount < minTopup) {
        return
      }

      // Calculate payment amount and show confirmation dialog
      await calculatePaymentAmount(topupAmount, method.type)
      setConfirmDialogOpen(true)
    } finally {
      setPaymentLoading(null)
    }
  }

  // Handle payment confirmation
  const handlePaymentConfirm = async () => {
    if (!selectedPaymentMethod) return

    const isPancake = isWaffoPancakePayment(selectedPaymentMethod.type)
    const success = isPancake
      ? await processWaffoPancakePayment(topupAmount)
      : await processPayment(topupAmount, selectedPaymentMethod.type)

    if (success) {
      setConfirmDialogOpen(false)
      await fetchUser()
    }
  }

  // Handle redemption
  const handleRedeem = async () => {
    if (!redemptionCode) return

    const success = await redeemCode(redemptionCode)
    if (success) {
      setRedemptionCode('')
      await fetchUser()
    }
  }

  // Handle Creem product selection
  const handleCreemProductSelect = (product: CreemProduct) => {
    setSelectedCreemProduct(product)
    setCreemDialogOpen(true)
  }

  // Handle Creem payment confirmation
  const handleCreemConfirm = async () => {
    if (!selectedCreemProduct) return

    const success = await processCreemPayment(selectedCreemProduct.productId)
    if (success) {
      setCreemDialogOpen(false)
      setSelectedCreemProduct(null)
      await fetchUser()
    }
  }

  const handleWaffoMethodSelect = async (_method: unknown, index: number) => {
    const loadingKey = `waffo-${index}`
    setPaymentLoading(loadingKey)

    try {
      await processWaffoPayment(topupAmount, index)
    } finally {
      setPaymentLoading(null)
    }
  }

  // Get discount rate for current topup amount
  const getDiscountRate = useCallback(() => {
    return topupInfo?.discount?.[topupAmount] || DEFAULT_DISCOUNT_RATE
  }, [topupInfo, topupAmount])

  const handleSubscriptionAvailabilityChange = useCallback(
    (available: boolean) => {
      setShowSubscriptionPanel(available)
    },
    []
  )

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Wallet')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
            <WalletStatsCard user={user} loading={userLoading} />

            <div
              className={
                showSubscriptionPanel
                  ? 'grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:items-start'
                  : 'grid gap-4'
              }
            >
              <div id='wallet-add-funds' className='scroll-mt-4'>
                <RechargeFormCard
                  topupInfo={topupInfo}
                  presetAmounts={presetAmounts}
                  selectedPreset={selectedPreset}
                  onSelectPreset={handleSelectPreset}
                  topupAmount={topupAmount}
                  onTopupAmountChange={handleTopupAmountChange}
                  paymentAmount={paymentAmount}
                  calculating={calculating}
                  onPaymentMethodSelect={handlePaymentMethodSelect}
                  paymentLoading={paymentLoading}
                  redemptionCode={redemptionCode}
                  onRedemptionCodeChange={setRedemptionCode}
                  onRedeem={handleRedeem}
                  redeeming={redeeming}
                  topupLink={topupInfo?.topup_link}
                  loading={topupLoading}
                  priceRatio={rechargePriceRatio}
                  currencySymbol={paymentCurrencySymbol}
                  onOpenBilling={() => setBillingDialogOpen(true)}
                  creemProducts={topupInfo?.creem_products}
                  enableCreemTopup={topupInfo?.enable_creem_topup}
                  onCreemProductSelect={handleCreemProductSelect}
                  enableWaffoTopup={topupInfo?.enable_waffo_topup}
                  waffoPayMethods={topupInfo?.waffo_pay_methods}
                  waffoMinTopup={topupInfo?.waffo_min_topup}
                  onWaffoMethodSelect={handleWaffoMethodSelect}
                  enableWaffoPancakeTopup={
                    topupInfo?.enable_waffo_pancake_topup
                  }
                />
              </div>

              <SubscriptionPlansCard
                topupInfo={topupInfo}
                onAvailabilityChange={handleSubscriptionAvailabilityChange}
                userQuota={user?.quota}
                onPurchaseSuccess={fetchUser}
              />
            </div>

          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <PaymentConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handlePaymentConfirm}
        topupAmount={topupAmount}
        paymentAmount={paymentAmount}
        paymentMethod={selectedPaymentMethod}
        calculating={calculating}
        processing={processing || pancakeProcessing}
        discountRate={getDiscountRate()}
        currencySymbol={paymentCurrencySymbol}
      />

      <BillingHistoryDialog
        open={billingDialogOpen}
        onOpenChange={setBillingDialogOpen}
      />

      <CreemConfirmDialog
        open={creemDialogOpen}
        onOpenChange={setCreemDialogOpen}
        onConfirm={handleCreemConfirm}
        product={selectedCreemProduct}
        processing={creemProcessing}
      />
    </>
  )
}

const AFFILIATE_COMMISSION_PAGE_SIZE = 10
const AFFILIATE_REFERRAL_PAGE_SIZE = 10

export function WalletReferrals() {
  const { t } = useTranslation()
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [records, setRecords] = useState<AffiliateCommissionRecord[]>([])
  const [recordTotal, setRecordTotal] = useState(0)
  const [recordPage, setRecordPage] = useState(1)
  const [recordLoading, setRecordLoading] = useState(false)
  const [referrals, setReferrals] = useState<AffiliateReferral[]>([])
  const [referralTotal, setReferralTotal] = useState(0)
  const [referralPage, setReferralPage] = useState(1)
  const [referralLoading, setReferralLoading] = useState(false)

  const { topupInfo } = useTopupInfo()
  const {
    affiliateLink,
    summary: affiliateSummary,
    policy: affiliatePolicy,
    loading: affiliateLoading,
    transferQuota,
    transferring,
  } = useAffiliate()

  const availableAffiliateQuota = useMemo(() => {
    return Math.max(
      user?.aff_quota ?? 0,
      affiliateSummary?.available_quota ?? 0
    )
  }, [affiliateSummary?.available_quota, user?.aff_quota])

  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const response = await getSelf()
      if (response.success && response.data) {
        setUser(response.data as UserWalletData)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch user data:', error)
    } finally {
      setUserLoading(false)
    }
  }, [])

  const fetchRecords = useCallback(async () => {
    setRecordLoading(true)
    try {
      const response = await getSelfAffiliateCommissions(
        recordPage,
        AFFILIATE_COMMISSION_PAGE_SIZE
      )
      if (response.success && response.data) {
        setRecords(response.data.items ?? [])
        setRecordTotal(response.data.total ?? 0)
      } else {
        setRecords([])
        setRecordTotal(0)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch affiliate commission records:', error)
      setRecords([])
      setRecordTotal(0)
    } finally {
      setRecordLoading(false)
    }
  }, [recordPage])

  const fetchReferrals = useCallback(async () => {
    setReferralLoading(true)
    try {
      const response = await getSelfAffiliateReferrals(
        referralPage,
        AFFILIATE_REFERRAL_PAGE_SIZE
      )
      if (response.success && response.data) {
        setReferrals(response.data.items ?? [])
        setReferralTotal(response.data.total ?? 0)
      } else {
        setReferrals([])
        setReferralTotal(0)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch affiliate referrals:', error)
      setReferrals([])
      setReferralTotal(0)
    } finally {
      setReferralLoading(false)
    }
  }, [referralPage])

  useEffect(() => {
    void fetchUser()
  }, [fetchUser])

  useEffect(() => {
    void fetchRecords()
  }, [fetchRecords])

  useEffect(() => {
    void fetchReferrals()
  }, [fetchReferrals])

  const handleTransfer = async (amount: number) => {
    const success = await transferQuota(amount)
    if (success) {
      await Promise.all([fetchUser(), fetchRecords(), fetchReferrals()])
    }
    return success
  }

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Invite Friends')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
            <AffiliateRewardsCard
              user={user}
              summary={affiliateSummary}
              policy={affiliatePolicy}
              affiliateLink={affiliateLink}
              onTransfer={() => setTransferDialogOpen(true)}
              complianceConfirmed={
                topupInfo?.payment_compliance_confirmed !== false
              }
              loading={affiliateLoading || userLoading}
            />

            <div
              id='affiliate-records'
              className='scroll-mt-4 grid gap-4 xl:grid-cols-2'
            >
              <CommissionRecordsCard
                records={records}
                total={recordTotal}
                page={recordPage}
                pageSize={AFFILIATE_COMMISSION_PAGE_SIZE}
                loading={recordLoading}
                onPageChange={setRecordPage}
              />
              <InvitedUsersCard
                referrals={referrals}
                total={referralTotal}
                page={referralPage}
                pageSize={AFFILIATE_REFERRAL_PAGE_SIZE}
                loading={referralLoading}
                onPageChange={setReferralPage}
              />
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onConfirm={handleTransfer}
        availableQuota={availableAffiliateQuota}
        transferring={transferring}
      />
    </>
  )
}

function CommissionRecordsCard({
  records,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
}: {
  records: AffiliateCommissionRecord[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <Card data-card-hover='false' className='min-w-0'>
      <CardHeader className='border-b'>
        <CardTitle>{t('Commission Records')}</CardTitle>
        <CardDescription>
          {t('View your recharge commission records and settlement progress.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='overflow-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Record ID')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Reward Amount')}</TableHead>
                <TableHead>{t('Top-up Credit')}</TableHead>
                <TableHead>{t('Rate')}</TableHead>
                <TableHead>{t('Type')}</TableHead>
                <TableHead>{t('Created At')}</TableHead>
                <TableHead>{t('Eligible At')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={8}>
                      <Skeleton className='h-5 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              ) : records.length ? (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.id}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getCommissionStatusClass(
                          record.status
                        )}`}
                      >
                        {t(getCommissionStatusLabel(record.status))}
                      </span>
                    </TableCell>
                    <TableCell>{formatQuota(record.reward_quota)}</TableCell>
                    <TableCell>{formatQuota(record.topup_quota)}</TableCell>
                    <TableCell>
                      {formatCommissionRate(record.final_rate)}
                    </TableCell>
                    <TableCell>
                      {record.is_first_topup
                        ? t('First top-up')
                        : t('Repeat top-up')}
                    </TableCell>
                    <TableCell>
                      {formatTimestampToDate(record.created_at)}
                    </TableCell>
                    <TableCell>
                      {record.status === 'pending'
                        ? formatTimestampToDate(record.eligible_at)
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className='h-28 text-center'>
                    <div className='text-muted-foreground text-sm'>
                      {t('No referral reward records yet')}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <AffiliatePager
          total={total}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPageChange={onPageChange}
        />
      </CardContent>
    </Card>
  )
}

function InvitedUsersCard({
  referrals,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
}: {
  referrals: AffiliateReferral[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <Card data-card-hover='false' className='min-w-0'>
      <CardHeader className='border-b'>
        <CardTitle>{t('Invited Users')}</CardTitle>
        <CardDescription>
          {t('People who registered through your referral link.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='overflow-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('User ID')}</TableHead>
                <TableHead>{t('User')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Registered At')}</TableHead>
                <TableHead>{t('Commission Count')}</TableHead>
                <TableHead>{t('Pending Settlement')}</TableHead>
                <TableHead>{t('Available')}</TableHead>
                <TableHead>{t('Generated Rewards')}</TableHead>
                <TableHead>{t('Last Reward At')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={9}>
                      <Skeleton className='h-5 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              ) : referrals.length ? (
                referrals.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell className='whitespace-nowrap'>
                      {referral.id}
                    </TableCell>
                    <TableCell className='max-w-48 truncate'>
                      {getReferralDisplayName(referral)}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {t(getReferralStatusLabel(referral.status))}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {formatOptionalTimestamp(referral.created_at)}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {referral.commission_count}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {formatQuota(referral.pending_quota)}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {formatQuota(referral.available_quota)}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {formatQuota(referral.total_reward_quota)}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {formatOptionalTimestamp(referral.last_commission_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className='h-28 text-center'>
                    <div className='text-muted-foreground text-sm'>
                      {t('No invited users yet')}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <AffiliatePager
          total={total}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPageChange={onPageChange}
        />
      </CardContent>
    </Card>
  )
}

function AffiliatePager({
  total,
  page,
  totalPages,
  loading,
  onPageChange,
}: {
  total: number
  page: number
  totalPages: number
  loading: boolean
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col items-center gap-3 border-t pt-3 sm:flex-row sm:justify-between'>
      <div className='text-muted-foreground text-xs sm:text-sm'>
        {t('Total records: {{total}}', { total })}
      </div>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className='h-8 w-8 p-0'
        >
          <ChevronLeft className='h-4 w-4' />
        </Button>
        <div className='text-muted-foreground flex items-center gap-1 text-sm'>
          <span className='font-medium'>{page}</span>
          <span>/</span>
          <span>{totalPages}</span>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages || loading}
          className='h-8 w-8 p-0'
        >
          <ChevronRight className='h-4 w-4' />
        </Button>
      </div>
    </div>
  )
}

function formatCommissionRate(rate: number) {
  return `${(rate * 100).toFixed(2)}%`
}

function getCommissionStatusLabel(status: AffiliateCommissionRecord['status']) {
  switch (status) {
    case 'pending':
      return 'Pending Settlement'
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

function getCommissionStatusClass(status: AffiliateCommissionRecord['status']) {
  switch (status) {
    case 'pending':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300'
    case 'available':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300'
    case 'transferred':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300'
    case 'voided':
      return 'border-muted bg-muted text-muted-foreground'
    default:
      return 'border-muted bg-muted text-muted-foreground'
  }
}

function getReferralStatusLabel(status: number) {
  return status === 1 ? 'Enabled' : 'Disabled'
}

function getReferralDisplayName(referral: AffiliateReferral) {
  return (
    referral.display_name?.trim() ||
    referral.username?.trim() ||
    `#${referral.id}`
  )
}

function formatOptionalTimestamp(timestamp: number) {
  return timestamp > 0 ? formatTimestampToDate(timestamp) : '-'
}
