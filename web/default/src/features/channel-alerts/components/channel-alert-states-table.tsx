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
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import type { ChannelAlertState } from '../types'
import { channelAlertChannelLabel, formatAlertTime } from '../utils'
import { PaginationFooter } from './pagination-footer'

type ChannelAlertStatesTableProps = {
  states: ChannelAlertState[]
  isLoading: boolean
  page: number
  pageSize: number
  total: number
  clearingId?: number
  onClear: (stateId: number) => void
  onPageChange: (page: number) => void
}

const STATE_TABLE_COLUMN_COUNT = 8

export function ChannelAlertStatesTable(props: ChannelAlertStatesTableProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Active Alert States')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto rounded-lg border'>
          <Table className='min-w-[980px]'>
            <TableHeader>
              <TableRow>
                <TableHead>{t('State ID')}</TableHead>
                <TableHead>{t('Channel')}</TableHead>
                <TableHead>{t('Rule')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Window Hits')}</TableHead>
                <TableHead>{t('Last Alert')}</TableHead>
                <TableHead>{t('Last Recovery')}</TableHead>
                <TableHead className='pr-4'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={STATE_TABLE_COLUMN_COUNT}
                    className='h-24 text-center'
                  >
                    {t('Loading')}
                  </TableCell>
                </TableRow>
              ) : props.states.length ? (
                props.states.map((state) => {
                  const isClearing = props.clearingId === state.id
                  return (
                    <TableRow key={state.id}>
                      <TableCell className='font-mono'>{state.id}</TableCell>
                      <TableCell>
                        {channelAlertChannelLabel(state.channel_id)}
                      </TableCell>
                      <TableCell className='max-w-52 truncate font-mono text-xs'>
                        {state.rule_key || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={state.active ? 'destructive' : 'outline'}
                          className={cn(!state.active && 'text-muted-foreground')}
                        >
                          {state.active ? t('Active') : t('Inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>{state.window_count}</TableCell>
                      <TableCell className='whitespace-nowrap'>
                        {formatAlertTime(state.last_alert_at)}
                      </TableCell>
                      <TableCell className='whitespace-nowrap'>
                        {formatAlertTime(state.last_recovery_at)}
                      </TableCell>
                      <TableCell className='pr-4'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          disabled={!state.active || isClearing}
                          onClick={() => props.onClear(state.id)}
                        >
                          {isClearing && (
                            <RefreshCw
                              data-icon='inline-start'
                              className='animate-spin'
                              aria-hidden='true'
                            />
                          )}
                          {t('Clear State')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={STATE_TABLE_COLUMN_COUNT}
                    className='h-24 text-center'
                  >
                    {t('No active channel alert states found.')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationFooter
            page={props.page}
            pageSize={props.pageSize}
            total={props.total}
            isLoading={props.isLoading}
            onPageChange={props.onPageChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}
