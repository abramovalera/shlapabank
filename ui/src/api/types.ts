// Типы ответов API (полное описание — Swagger, http://localhost:8080/docs). Деньги — строка с двумя знаками ("1500.00"), даты — ISO 8601 UTC.

export type Money = string;

export interface User {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  status: "ACTIVE" | "BLOCKED";
}

export interface LoginChallenge {
  challenge_id: string;
  phone_masked: string;
  /** Через сколько секунд можно запросить новый код — по часам банка */
  resend_in_seconds: number;
  /** Через сколько секунд код истечёт — по часам банка */
  expires_in_seconds: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface Account {
  id: number;
  number: string;
  name: string;
  balance: Money;
  has_card: boolean;
  created_at: string;
}

export interface Card {
  id: number;
  number_masked: string;
  last4: string;
  expiry: string;
  holder: string;
  account_id: number;
  status: "ACTIVE" | "BLOCKED";
}

export interface CardRequisites {
  number: string;
  expiry: string;
  cvv: string;
  holder: string;
}

export interface Recipient {
  name: string;
  bank_name: string;
  own_bank: boolean;
  fee_percent: string | number;
  fee_min: string | number;
}

export type OperationType =
  | "OWN_TRANSFER"
  | "PHONE_TRANSFER"
  | "CARD_TRANSFER"
  | "INCOMING_TRANSFER"
  | "MOBILE"
  | "UTILITY"
  | "TOPUP"
  | "BANK_DEPOSIT";

export type OperationStatus = "WAITING_CODE" | "DONE" | "DECLINED" | "CANCELLED";
export type OperationDirection = "out" | "in" | "internal";

export interface AccountRef {
  id: number;
  name: string;
  number_masked: string;
}

export interface CodeInfo {
  attempts_left: number;
  /** Через сколько секунд можно запросить новый код — по часам банка */
  resend_in_seconds: number;
  /** Через сколько секунд код истечёт — по часам банка */
  expires_in_seconds: number;
}

export interface Counterparty {
  name: string | null;
  phone: string | null;
  bank_name: string | null;
  card_masked: string | null;
  provider_name: string | null;
  payer_account: string | null;
  operator_name: string | null;
}

export interface Operation {
  id: number;
  number: string;
  type: OperationType;
  status: OperationStatus;
  direction: OperationDirection;
  amount: Money;
  fee: Money;
  total: Money;
  title: string;
  subtitle: string;
  account: AccountRef;
  to_account: AccountRef | null;
  counterparty: Counterparty | null;
  message: string | null;
  decline_reason: { code: string; message: string } | null;
  code: CodeInfo | null;
  created_at: string;
  completed_at: string | null;
}

export interface OperationsPage {
  items: Operation[];
  total: number;
}

export interface OperationsQuery {
  type?: OperationType[];
  status?: OperationStatus;
  direction?: "in" | "out";
  account_id?: number;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

/** Тарифные коды: у переводов по телефону и на карту — отдельно «свой банк» / «другой банк». */
export type TariffType =
  | "OWN_TRANSFER"
  | "PHONE_OWN_BANK"
  | "PHONE_OTHER_BANK"
  | "CARD_OWN_BANK"
  | "CARD_OTHER_BANK"
  | "MOBILE"
  | "UTILITY"
  | "TOPUP";

export interface Tariff {
  operation_type: TariffType | string;
  title: string;
  fee_percent: string | number;
  fee_min: Money | number;
  amount_min: Money | number;
  amount_max: Money | number;
  needs_code: boolean;
}

export interface LimitUsage {
  limit: Money;
  used: Money;
  left: Money;
}

export interface Limits {
  per_operation: Money;
  daily: LimitUsage;
  monthly: LimitUsage;
}

export interface Provider {
  code: string;
  name: string;
  category: string;
  payer_account_length: number;
}

export interface MobileOperator {
  name: string;
  prefixes: string[];
}

// Тела запросов на создание операций
export interface OwnTransferBody {
  from_account_id: number;
  to_account_id: number;
  amount: Money;
}
export interface PhoneTransferBody {
  from_account_id: number;
  phone: string;
  amount: Money;
  message?: string;
}
export interface CardTransferBody {
  from_account_id: number;
  card_number: string;
  amount: Money;
}
export interface MobileBody {
  from_account_id: number;
  phone: string;
  amount: Money;
}
export interface UtilityBody {
  from_account_id: number;
  provider_code: string;
  payer_account: string;
  amount: Money;
}
export interface TopUpBody {
  to_account_id: number;
  card_number: string;
  expiry: string;
  cvc: string;
  amount: Money;
}

export interface OperationBodies {
  "own-transfer": OwnTransferBody;
  "phone-transfer": PhoneTransferBody;
  "card-transfer": CardTransferBody;
  mobile: MobileBody;
  utility: UtilityBody;
  topup: TopUpBody;
}
export type OperationKind = keyof OperationBodies;
