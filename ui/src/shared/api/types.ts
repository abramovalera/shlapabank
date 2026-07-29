// Типы отражают схемы бэкенда (backend/app/schemas.py).
// Держим их синхронно вручную — учебный проект без OpenAPI-генерации.

export type Currency = "RUB" | "USD" | "EUR" | "CNY";
export type AccountType = "DEBIT" | "SAVINGS";

export interface Account {
  id: number;
  name: string;
  account_number: string;
  account_type: AccountType;
  currency: Currency;
  balance: string;
  is_primary: boolean;
  cards_count: number;
}

export interface CardReveal {
  number: string; // отформатированный PAN "XXXX XXXX XXXX XXXX"
  cvv: string;
  holder_name: string;
  expiry_month: number;
  expiry_year: number;
}

export type CardType = "DEBIT" | "VIRTUAL" | "CREDIT" | "REGULAR" | "GOLD";
export type CardPaymentSystem = "VISA" | "MIR" | "MASTERCARD";
export type CardStatus = "ACTIVE" | "BLOCKED" | "EXPIRED";
export type CardDesign =
  | "CLASSIC"
  | "EMERALD"
  | "GRAPHITE"
  | "SUNSET"
  | "ROSE"
  | "GOLD_BAR"
  | "GOLD_MARBLE";

export interface Card {
  id: number;
  account_id: number;
  last4: string;
  holder_name: string;
  expiry_month: number;
  expiry_year: number;
  card_type: CardType;
  payment_system: CardPaymentSystem;
  status: CardStatus;
  design: CardDesign;
  is_contactless: boolean;
}

export type TransactionType = "TOPUP" | "TRANSFER" | "PAYMENT";
export type TransactionStatus = "COMPLETED" | "FAILED";

export interface TransactionMoney {
  amount: string;
  fee: string;
  total: string;
  currency: string;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  money: TransactionMoney;
  description: string | null;
  created_at: string;
  from_account_id: number | null;
  to_account_id: number | null;
  card_id: number | null;
  status: TransactionStatus;
}

export interface UserProfile {
  id: number;
  login: string;
  email: string | null;
  role: "CLIENT" | "ADMIN";
  status: "ACTIVE" | "BLOCKED";
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_color?: string | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  theme?: "dark" | "light";
  sbp_primary_bank?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: string | null;
}
