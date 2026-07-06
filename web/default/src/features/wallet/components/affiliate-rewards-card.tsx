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
import { BadgePercent, ListChecks, Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type {
  AffiliateCommissionSummary,
  AffiliateRechargePolicy,
  UserWalletData,
} from '../types'

interface AffiliateRewardsCardProps {
  user: UserWalletData | null
  summary?: AffiliateCommissionSummary | null
  policy?: AffiliateRechargePolicy | null
  affiliateLink: string
  onTransfer: () => void
  onOpenDetails?: () => void
  complianceConfirmed?: boolean
  loading?: boolean
}

export function AffiliateRewardsCard({
  user,
  summary,
  policy,
  affiliateLink,
  onTransfer,
  onOpenDetails,
  complianceConfirmed = true,
  loading,
}: AffiliateRewardsCardProps) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <Card data-card-hover='false' className='bg-muted/20 py-0'>
        <CardContent className='grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,0.72fr)_minmax(320px,1.15fr)] lg:items-center'>
          <div>
            <Skeleton className='h-5 w-32' />
            <Skeleton className='mt-2 h-4 w-48' />
          </div>
          <Skeleton className='h-14 rounded-lg' />
          <Skeleton className='h-10 rounded-lg' />
        </CardContent>
      </Card>
    )
  }

  const availableQuota = Math.max(
    user?.aff_quota ?? 0,
    summary?.available_quota ?? 0
  )
  const pendingQuota = summary?.pending_quota ?? 0
  const totalEarned = Math.max(
    user?.aff_history_quota ?? 0,
    summary?.total_reward_quota ?? 0
  )
  const hasRewards = availableQuota > 0
  const policyEnabled = policy?.enabled === true
  const attributionDays = Math.max(policy?.attribution_days ?? 0, 0)
  const settlementDays = Math.max(policy?.settlement_days ?? 0, 0)
  const minTopupMoney = Math.max(policy?.min_topup_money ?? 0, 0)
  const firstWindowEnd = Math.min(attributionDays, 7)
  const secondWindowEnd = Math.min(attributionDays, 30)
  const hasFirstWindow = firstWindowEnd > 0
  const hasSecondWindow = attributionDays > 7
  const after30FirstRate = Math.max(
    policy?.first_topup_rate_after_30_days ?? 0,
    0
  )
  const after30RepeatRate = Math.max(
    policy?.repeat_topup_rate_after_30_days ?? 0,
    0
  )
  const hasAfter30Window = attributionDays > 30
  const hasAfter30Commission = after30FirstRate > 0 || after30RepeatRate > 0

  return (
    <Card data-card-hover='false' className='bg-muted/20 py-0'>
      <CardContent className='grid gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.65fr)_minmax(280px,1fr)] lg:items-center'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <div className='bg-background flex size-8 shrink-0 items-center justify-center rounded-lg border'>
            <Share2 className='text-muted-foreground size-4' />
          </div>
          <div className='min-w-0'>
            <h3 className='truncate text-sm font-semibold'>
              {t('Referral Program')}
            </h3>
            <p className='text-muted-foreground line-clamp-1 text-xs'>
              {t(
                'Earn rewards when your referrals add funds. Settled rewards can be transferred to your balance.'
              )}
            </p>
          </div>
        </div>

        <div className='grid grid-cols-3 gap-1.5 text-center'>
          {[
            [t('Available'), formatQuota(availableQuota)],
            [t('Pending Settlement'), formatQuota(pendingQuota)],
            [t('Total Earned'), formatQuota(totalEarned)],
          ].map(([label, value]) => (
            <div key={label}>
              <div className='text-muted-foreground truncate text-[10px] font-medium tracking-wider uppercase'>
                {label}
              </div>
              <div className='mt-0.5 truncate text-sm font-semibold tabular-nums'>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className='flex items-center gap-2'>
          <Input
            value={affiliateLink}
            readOnly
            className='border-muted bg-background/70 h-9 min-w-0 flex-1 font-mono text-xs'
          />
          <CopyButton
            value={affiliateLink}
            variant='outline'
            className='bg-background size-9 shrink-0'
            iconClassName='size-4'
            tooltip={t('Copy referral link')}
            aria-label={t('Copy referral link')}
          />
          {onOpenDetails ? (
            <Button
              type='button'
              variant='outline'
              onClick={onOpenDetails}
              className='h-9 shrink-0 px-3'
              size='sm'
              aria-label={t('Reward Details')}
            >
              <ListChecks className='size-4' />
              <span className='hidden sm:inline'>{t('Reward Details')}</span>
            </Button>
          ) : null}
          {hasRewards && (
            <Button
              onClick={onTransfer}
              disabled={!complianceConfirmed}
              className='h-9 shrink-0 px-3'
              size='sm'
            >
              {t('Transfer to Balance')}
            </Button>
          )}
        </div>
        {!complianceConfirmed ? (
          <p className='text-muted-foreground text-xs lg:col-span-3'>
            {t(
              'Referral reward transfer is disabled until the administrator confirms compliance terms.'
            )}
          </p>
        ) : null}
        <div className='border-border/70 grid gap-2 border-t pt-3 lg:col-span-3 lg:grid-cols-[minmax(180px,0.35fr)_1fr] lg:items-start'>
          <div className='flex min-w-0 items-center gap-2'>
            <BadgePercent className='text-muted-foreground size-4 shrink-0' />
            <span className='text-sm font-medium'>{t('Referral Rules')}</span>
          </div>
          {policyEnabled ? (
            <div className='text-muted-foreground grid gap-1 text-xs sm:grid-cols-2'>
              {hasFirstWindow ? (
                <p>
                  {firstWindowEnd >= 7
                    ? t(
                        'Within 7 days: first top-up {{first}}, repeat {{repeat}}',
                        {
                          first: formatRewardRate(
                            policy?.first_topup_rate_within_7_days
                          ),
                          repeat: formatRewardRate(
                            policy?.repeat_topup_rate_within_7_days
                          ),
                        }
                      )
                    : t(
                        'Within {{days}} days: first top-up {{first}}, repeat {{repeat}}',
                        {
                          days: firstWindowEnd,
                          first: formatRewardRate(
                            policy?.first_topup_rate_within_7_days
                          ),
                          repeat: formatRewardRate(
                            policy?.repeat_topup_rate_within_7_days
                          ),
                        }
                      )}
                </p>
              ) : null}
              {hasSecondWindow ? (
                <p>
                  {secondWindowEnd >= 30
                    ? t(
                        'Day 8 to 30: first top-up {{first}}, repeat {{repeat}}',
                        {
                          first: formatRewardRate(
                            policy?.first_topup_rate_within_30_days
                          ),
                          repeat: formatRewardRate(
                            policy?.repeat_topup_rate_within_30_days
                          ),
                        }
                      )
                    : t(
                        'Day 8 to {{days}}: first top-up {{first}}, repeat {{repeat}}',
                        {
                          days: secondWindowEnd,
                          first: formatRewardRate(
                            policy?.first_topup_rate_within_30_days
                          ),
                          repeat: formatRewardRate(
                            policy?.repeat_topup_rate_within_30_days
                          ),
                        }
                      )}
                </p>
              ) : null}
              {hasAfter30Window ? (
                <p>
                  {hasAfter30Commission
                    ? t(
                        'After 30 days until {{days}} days: first top-up {{first}}, repeat {{repeat}}',
                        {
                          days: attributionDays,
                          first: formatRewardRate(after30FirstRate),
                          repeat: formatRewardRate(after30RepeatRate),
                        }
                      )
                    : t('No commission after 30 days.')}
                </p>
              ) : null}
              {!hasAfter30Window || hasAfter30Commission ? (
                <p>
                  {t(
                    'Rewards are counted for top-ups within {{days}} days after signup.',
                    { days: attributionDays }
                  )}
                </p>
              ) : null}
              <p>
                {settlementDays > 0
                  ? t(
                      'Rewards become transferable after {{days}} settlement days.',
                      { days: settlementDays }
                    )
                  : t(
                      'Rewards become transferable immediately after the top-up is confirmed.'
                    )}
              </p>
              {minTopupMoney > 0 ? (
                <p>
                  {t('Minimum eligible top-up: {{amount}}', {
                    amount: formatPlainAmount(minTopupMoney),
                  })}
                </p>
              ) : null}
            </div>
          ) : (
            <p className='text-muted-foreground text-xs'>
              {t('Recharge commission is currently disabled.')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function formatRewardRate(rate?: number) {
  const percent = Math.max(rate ?? 0, 0) * 100
  return `${percent.toFixed(percent % 1 === 0 ? 0 : 2)}%`
}

function formatPlainAmount(amount: number) {
  return amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  })
}
