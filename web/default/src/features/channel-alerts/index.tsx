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
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  clearChannelAlertState,
  getChannelAlertEvents,
  getChannelAlertStates,
} from './api'
import { ChannelAlertsFilterBar } from './components/channel-alerts-filter-bar'
import { ChannelAlertEventsTable } from './components/channel-alert-events-table'
import { ChannelAlertStatesTable } from './components/channel-alert-states-table'
import type { ChannelAlertFilterDraft } from './types'
import {
  buildEventQuery,
  buildStateQuery,
  CHANNEL_ALERT_DEFAULT_DRAFT,
} from './utils'

const PAGE_SIZE = 20

function requireData<T>(
  response: { success: boolean; message?: string; data?: T },
  fallbackMessage: string
): T {
  if (!response.success || response.data == null) {
    throw new Error(response.message || fallbackMessage)
  }
  return response.data
}

export function ChannelAlerts() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<ChannelAlertFilterDraft>(
    CHANNEL_ALERT_DEFAULT_DRAFT
  )
  const [filters, setFilters] = useState<ChannelAlertFilterDraft>(
    CHANNEL_ALERT_DEFAULT_DRAFT
  )
  const [eventsPage, setEventsPage] = useState(1)
  const [statesPage, setStatesPage] = useState(1)

  const eventQuery = useMemo(
    () => buildEventQuery(filters, eventsPage, PAGE_SIZE),
    [eventsPage, filters]
  )
  const stateQuery = useMemo(
    () => buildStateQuery(filters, statesPage, PAGE_SIZE),
    [filters, statesPage]
  )

  const eventsQuery = useQuery({
    queryKey: ['channel-alerts', 'events', eventQuery],
    queryFn: async () =>
      requireData(
        await getChannelAlertEvents(eventQuery),
        t('We could not load channel alert events.')
      ),
  })

  const statesQuery = useQuery({
    queryKey: ['channel-alerts', 'states', stateQuery],
    queryFn: async () =>
      requireData(
        await getChannelAlertStates(stateQuery),
        t('We could not load active alert states.')
      ),
  })

  const clearState = useMutation({
    mutationFn: clearChannelAlertState,
    onSuccess: () => {
      toast.success(t('Channel alert state cleared.'))
      queryClient.invalidateQueries({ queryKey: ['channel-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['channel-alert-states'] })
      queryClient.invalidateQueries({ queryKey: ['channel-alert-events'] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('Clear failed.'))
    },
  })

  const applyFilters = () => {
    setFilters(draft)
    setEventsPage(1)
    setStatesPage(1)
  }

  const resetFilters = () => {
    setDraft(CHANNEL_ALERT_DEFAULT_DRAFT)
    setFilters(CHANNEL_ALERT_DEFAULT_DRAFT)
    setEventsPage(1)
    setStatesPage(1)
  }

  const refresh = () => {
    void eventsQuery.refetch()
    void statesQuery.refetch()
  }

  const eventsError = eventsQuery.error instanceof Error ? eventsQuery.error : null
  const statesError = statesQuery.error instanceof Error ? statesQuery.error : null
  const isLoading = eventsQuery.isFetching || statesQuery.isFetching

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Channel Alerts')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={refresh}
          disabled={isLoading}
        >
          <RefreshCw
            data-icon='inline-start'
            className={cn(isLoading && 'animate-spin')}
            aria-hidden='true'
          />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex w-full flex-col gap-4'>
          <ChannelAlertsFilterBar
            draft={draft}
            isLoading={isLoading}
            onChange={setDraft}
            onApply={applyFilters}
            onReset={resetFilters}
          />

          {eventsError || statesError ? (
            <ErrorState
              title={t('We could not load channel alerts.')}
              description={eventsError?.message || statesError?.message}
              onRetry={refresh}
              className='min-h-[220px]'
            />
          ) : (
            <div className='grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]'>
              <ChannelAlertEventsTable
                titleKey='Channel Alert Events'
                emptyKey='No channel alert events found.'
                events={eventsQuery.data?.items ?? []}
                isLoading={eventsQuery.isLoading}
                page={eventsQuery.data?.page ?? eventsPage}
                pageSize={eventsQuery.data?.page_size ?? PAGE_SIZE}
                total={eventsQuery.data?.total ?? 0}
                onPageChange={setEventsPage}
              />
              <ChannelAlertStatesTable
                states={statesQuery.data?.items ?? []}
                isLoading={statesQuery.isLoading}
                page={statesQuery.data?.page ?? statesPage}
                pageSize={statesQuery.data?.page_size ?? PAGE_SIZE}
                total={statesQuery.data?.total ?? 0}
                clearingId={clearState.variables}
                onPageChange={setStatesPage}
                onClear={(stateId) => clearState.mutate(stateId)}
              />
            </div>
          )}

          <Alert>
            <AlertTriangle aria-hidden='true' />
            <AlertTitle>{t('Manual clear keeps history')}</AlertTitle>
            <AlertDescription>
              {t(
                'Clearing an active state only marks it recovered and records a manual_clear event. Existing alert events remain available for audit.'
              )}
            </AlertDescription>
          </Alert>
          <Alert>
            <ShieldCheck aria-hidden='true' />
            <AlertTitle>{t('Sensitive details are limited')}</AlertTitle>
            <AlertDescription>
              {t(
                'This page shows the stored safe error preview only and does not expose full upstream responses or secret headers.'
              )}
            </AlertDescription>
          </Alert>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
