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
// ============================================================================
// Wallet Type Definitions
// ============================================================================

/**
 * Generic API response
 */
export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

/**
 * Standard API response types
 */
export type TopupInfoResponse = ApiResponse<TopupInfo>
export type RedemptionResponse = ApiResponse<number>
export type AmountResponse = ApiResponse<string>
export type PaymentResponse = ApiResponse<Record<string, unknown>> & {
  url?: string
}
export type StripePaymentResponse = ApiResponse<{ pay_link: string }>
export type AffiliateCodeResponse = ApiResponse<string>
export type AffiliateTransferResponse = ApiResponse
export type AffiliateCommissionSummary = {
  pending_quota: number
  available_quota: number
  transferred_quota: number
  total_reward_quota: number
}
export type AffiliateRechargePolicy = {
  enabled: boolean
  attribution_days: number
  settlement_days: number
  include_manual_topup: boolean
  min_topup_money: number
  first_topup_rate_within_7_days: number
  repeat_topup_rate_within_7_days: number
  first_topup_rate_within_30_days: number
  repeat_topup_rate_within_30_days: number
  first_topup_rate_after_30_days: number
  repeat_topup_rate_after_30_days: number
}
export type AffiliateSummaryResponse = ApiResponse<{
  summary: AffiliateCommissionSummary
  policy?: AffiliateRechargePolicy
}>
export type AffiliateCommissionStatus =
  | 'pending'
  | 'available'
  | 'transferred'
  | 'voided'
export type AffiliateCommissionRecord = {
  id: number
  topup_quota: number
  invite_age_days: number
  is_first_topup: boolean
  final_rate: number
  reward_quota: number
  transferred_quota: number
  status: AffiliateCommissionStatus
  eligible_at: number
  settled_at: number
  transferred_at: number
  void_reason: string
  created_at: number
}
export type AffiliateCommissionsPage = {
  page: number
  page_size: number
  total: number
  items: AffiliateCommissionRecord[]
}
export type AffiliateCommissionsResponse =
  ApiResponse<AffiliateCommissionsPage>
export type AffiliateReferral = {
  id: number
  display_name: string
  username: string
  status: number
  created_at: number
  commission_count: number
  pending_quota: number
  available_quota: number
  transferred_quota: number
  total_reward_quota: number
  last_commission_at: number
}
export type AffiliateReferralsPage = {
  page: number
  page_size: number
  total: number
  items: AffiliateReferral[]
}
export type AffiliateReferralsResponse = ApiResponse<AffiliateReferralsPage>
export type CreemPaymentResponse = ApiResponse<{ checkout_url: string }>
export type WaffoPaymentResponse = ApiResponse<
  { payment_url?: string } | string
>
export type WaffoPancakePaymentResponse = ApiResponse<
  | {
      checkout_url?: string
      session_id?: string
      expires_at?: number | string
      order_id?: string
      // Self-service session token + expiry — surfaced by the backend so
      // future flows (refund / cancel from new-api's own UI) can use them
      // without re-issuing checkout. Not consumed by the current handler.
      token?: string
      token_expires_at?: number | string
    }
  | string
>

/**
 * Creem product configuration
 */
export interface CreemProduct {
  /** Product display name */
  name: string
  /** Creem product ID */
  productId: string
  /** Product price */
  price: number
  /** Quota amount to credit */
  quota: number
  /** Currency (USD or EUR) */
  currency: 'USD' | 'EUR'
}

/**
 * Creem payment request
 */
export interface CreemPaymentRequest {
  /** Creem product ID */
  product_id: string
  /** Payment method identifier */
  payment_method: 'creem'
}

/**
 * Payment method configuration
 */
export interface PaymentMethod {
  /** Display name of payment method */
  name: string
  /** Payment method type identifier */
  type: string
  /** Legacy optional color for UI display */
  color?: string
  /** Minimum topup amount for this payment method */
  min_topup?: number
  /** Optional react-icons component name or safe icon URL */
  icon?: string
}

/**
 * Waffo payment method configuration
 */
export interface WaffoPayMethod {
  /** Display name of payment method */
  name: string
  /** Optional icon path */
  icon?: string
  /** Waffo pay method type */
  payMethodType?: string
  /** Waffo pay method name */
  payMethodName?: string
}

/**
 * Topup configuration information
 */
export interface TopupInfo {
  /** Whether online topup is enabled */
  enable_online_topup: boolean
  /** Whether Stripe topup is enabled */
  enable_stripe_topup: boolean
  /** Available payment methods */
  pay_methods: PaymentMethod[]
  /** Minimum topup amount for online topup */
  min_topup: number
  /** Regular payment unit price returned by the topup endpoint */
  price?: number
  /** USD exchange rate returned by the topup endpoint */
  usd_exchange_rate?: number
  /** Minimum topup amount for Stripe */
  stripe_min_topup: number
  /** Preset amount options */
  amount_options: number[]
  /** Discount rates by amount */
  discount: Record<number, number>
  /** Optional topup link for purchasing codes */
  topup_link?: string
  /** Whether Creem topup is enabled */
  enable_creem_topup?: boolean
  /** Available Creem products */
  creem_products?: CreemProduct[]
  /** Whether Waffo topup is enabled */
  enable_waffo_topup?: boolean
  /** Available Waffo payment methods */
  waffo_pay_methods?: WaffoPayMethod[]
  /** Minimum topup amount for Waffo */
  waffo_min_topup?: number
  /** Whether Waffo Pancake topup is enabled */
  enable_waffo_pancake_topup?: boolean
  /** Minimum topup amount for Waffo Pancake */
  waffo_pancake_min_topup?: number
  /** Whether redemption code usage is enabled */
  enable_redemption?: boolean
  /** Whether compliance confirmation has been completed */
  payment_compliance_confirmed?: boolean
  /** Current compliance terms version */
  payment_compliance_terms_version?: string
}

/**
 * Preset amount option with optional discount
 */
export interface PresetAmount {
  /** Preset amount value */
  value: number
  /** Optional discount rate (0-1) */
  discount?: number
}

/**
 * Redemption code request
 */
export interface RedemptionRequest {
  /** Redemption code key */
  key: string
}

/**
 * Payment request parameters
 */
export interface PaymentRequest {
  /** Topup amount */
  amount: number
  /** Payment method identifier */
  payment_method: string
}

/**
 * Waffo payment request parameters
 */
export interface WaffoPaymentRequest {
  /** Topup amount */
  amount: number
  /** Optional server-side Waffo payment method index */
  pay_method_index?: number
}

/**
 * Waffo Pancake payment request parameters
 */
export interface WaffoPancakePaymentRequest {
  /** Topup amount */
  amount: number
}

/**
 * Amount calculation request
 */
export interface AmountRequest {
  /** Topup amount to calculate */
  amount: number
}

/**
 * Affiliate quota transfer request
 */
export interface AffiliateTransferRequest {
  /** Quota amount to transfer */
  quota: number
}

/**
 * User wallet data
 */
export interface UserWalletData {
  /** User ID */
  id: number
  /** Username */
  username: string
  /** Current quota balance */
  quota: number
  /** Total used quota */
  used_quota: number
  /** Total request count */
  request_count: number
  /** Affiliate quota (pending rewards) */
  aff_quota: number
  /** Total affiliate quota earned (historical) */
  aff_history_quota: number
  /** Number of successful affiliate invites */
  aff_count: number
  /** User group */
  group: string
}

/**
 * Topup record status
 */
export type TopupStatus = 'success' | 'pending' | 'expired'

/**
 * Topup billing record
 */
export interface TopupRecord {
  /** Record ID */
  id: number
  /** User ID */
  user_id: number
  /** Topup amount (quota) */
  amount: number
  /** Payment amount (actual money paid) */
  money: number
  /** Trade/order number */
  trade_no: string
  /** Payment method type */
  payment_method: string
  /** Creation timestamp */
  create_time: number
  /** Completion timestamp */
  complete_time?: number
  /** Payment status */
  status: TopupStatus
}

/**
 * Billing history response
 */
export interface BillingHistoryResponse {
  items: TopupRecord[]
  total: number
}

/**
 * Complete order request (admin only)
 */
export interface CompleteOrderRequest {
  trade_no: string
}
