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

import { Button } from '@/components/ui/button'

type PaginationFooterProps = {
  page: number
  pageSize: number
  total: number
  isLoading: boolean
  onPageChange: (page: number) => void
}

export function PaginationFooter(props: PaginationFooterProps) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize))
  const canPrevious = props.page > 1
  const canNext = props.page < totalPages

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm'>
      <div className='text-muted-foreground'>
        {t('Total {{count}}', { count: props.total })}
      </div>
      <div className='flex items-center gap-2'>
        <span className='text-muted-foreground'>
          {t('Page {{page}} of {{totalPages}}', {
            page: props.page,
            totalPages,
          })}
        </span>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!canPrevious || props.isLoading}
          onClick={() => props.onPageChange(props.page - 1)}
        >
          {t('Previous')}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!canNext || props.isLoading}
          onClick={() => props.onPageChange(props.page + 1)}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  )
}
