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
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Switch } from '@/components/ui/switch'
import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const schema = z.object({
  enabled: z.boolean(),
  minRewardAmount: z.coerce.number().min(0),
  maxRewardAmount: z.coerce.number().min(0),
})

type Values = z.infer<typeof schema>

export function CheckinSettingsSection({
  defaultValues,
}: {
  defaultValues: {
    enabled: boolean
    minQuota: number
    maxQuota: number
  }
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const defaultMinRewardAmount = quotaUnitsToDollars(defaultValues.minQuota)
  const defaultMaxRewardAmount = quotaUnitsToDollars(defaultValues.maxQuota)

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      enabled: defaultValues.enabled,
      minRewardAmount: defaultMinRewardAmount,
      maxRewardAmount: defaultMaxRewardAmount,
    },
  })

  const { isDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')

  async function onSubmit(values: Values) {
    const updates: Array<{ key: string; value: string }> = []
    const minQuota = parseQuotaFromDollars(values.minRewardAmount)
    const maxQuota = parseQuotaFromDollars(values.maxRewardAmount)

    if (maxQuota < minQuota) {
      toast.error(
        t('Maximum reward must be greater than or equal to minimum reward')
      )
      return
    }

    if (values.enabled !== defaultValues.enabled) {
      updates.push({
        key: 'checkin_setting.enabled',
        value: String(values.enabled),
      })
    }

    if (minQuota !== defaultValues.minQuota) {
      updates.push({
        key: 'checkin_setting.min_quota',
        value: String(minQuota),
      })
    }

    if (maxQuota !== defaultValues.maxQuota) {
      updates.push({
        key: 'checkin_setting.max_quota',
        value: String(maxQuota),
      })
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    form.reset({
      enabled: values.enabled,
      minRewardAmount: quotaUnitsToDollars(minQuota),
      maxRewardAmount: quotaUnitsToDollars(maxQuota),
    })
  }

  return (
    <SettingsSection title={t('Check-in Settings')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || isSubmitting}
            isSaveDisabled={!isDirty}
            saveLabel='Save check-in settings'
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable check-in feature')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Allow users to check in daily for random quota rewards'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={updateOption.isPending || isSubmitting}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          {enabled && (
            <div className='grid gap-6 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='minRewardAmount'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Minimum check-in reward')}</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        inputMode='decimal'
                        placeholder='0.01'
                        value={field.value ?? ''}
                        onChange={(event) => {
                          const next = event.target.value.trim()
                          if (/^\d*(?:\.\d*)?$/.test(next)) {
                            field.onChange(next)
                          }
                        }}
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Displayed as currency and saved internally as quota.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='maxRewardAmount'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Maximum check-in reward')}</FormLabel>
                    <FormControl>
                      <Input
                        type='text'
                        inputMode='decimal'
                        placeholder='0.10'
                        value={field.value ?? ''}
                        onChange={(event) => {
                          const next = event.target.value.trim()
                          if (/^\d*(?:\.\d*)?$/.test(next)) {
                            field.onChange(next)
                          }
                        }}
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Displayed as currency and saved internally as quota.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
