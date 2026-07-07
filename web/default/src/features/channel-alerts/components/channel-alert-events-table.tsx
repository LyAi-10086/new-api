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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { ChannelAlertEvent } from '../types'
import {
  channelAlertChannelLabel,
  channelAlertSourceLabelKey,
  formatAlertTime,
} from '../utils'
import { PaginationFooter } from './pagination-footer'

type ChannelAlertEventsTableProps = {
  titleKey: string
  emptyKey: string
  events: ChannelAlertEvent[]
  isLoading: boolean
  page?: number
  pageSize?: number
  total?: number
  onPageChange?: (page: number) => void
}

const EVENT_TABLE_COLUMN_COUNT = 8

export function ChannelAlertEventsTable(props: ChannelAlertEventsTableProps) {
  const { t } = useTranslation()
  const showPagination =
    props.page !== undefined &&
    props.pageSize !== undefined &&
    props.total !== undefined &&
    props.onPageChange !== undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(props.titleKey)}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto rounded-lg border'>
          <Table className='min-w-[1080px]'>
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
              {props.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={EVENT_TABLE_COLUMN_COUNT}
                    className='h-24 text-center'
                  >
                    {t('Loading')}
                  </TableCell>
                </TableRow>
              ) : props.events.length ? (
                props.events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className='font-mono'>{event.id}</TableCell>
                    <TableCell className='max-w-52 truncate'>
                      {channelAlertChannelLabel(
                        event.channel_id,
                        event.channel_name
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant='secondary'>
                        {t(channelAlertSourceLabelKey(event.source))}
                      </Badge>
                    </TableCell>
                    <TableCell className='max-w-48 truncate font-mono text-xs'>
                      {event.rule_key || '-'}
                    </TableCell>
                    <TableCell>{event.status_code || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={event.alert_sent ? 'default' : 'outline'}>
                        {event.alert_sent ? t('Yes') : t('No')}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className='max-w-80 truncate'
                      title={event.error_preview || undefined}
                    >
                      {event.error_preview || '-'}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {formatAlertTime(event.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={EVENT_TABLE_COLUMN_COUNT}
                    className='h-24 text-center'
                  >
                    {t(props.emptyKey)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {showPagination && (
            <PaginationFooter
              page={props.page!}
              pageSize={props.pageSize!}
              total={props.total!}
              isLoading={props.isLoading}
              onPageChange={props.onPageChange!}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
