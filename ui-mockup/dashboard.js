const API_BASE = localStorage.getItem("sb_api_base") || "http://localhost:8001/api/v1";
const TOKEN = localStorage.getItem("sb_access_token");

if (!TOKEN) {
  window.location.href = "/login";
}
if (window.location.pathname === "/confirm") {
  window.location.replace("/dashboard");
}

const DEFAULT_SETTINGS = { theme: "LIGHT", language: "RU", notificationsEnabled: true };

const state = {
  profile: null,
  accounts: [],
  transfersInfo: null,
  transactions: [],
  operators: [],
  providers: [],
  settings: DEFAULT_SETTINGS,
  exchangeRates: null,
  byAccountIsExternal: false,
  byPhoneIsExternal: false,
};

const qs = (id) => document.getElementById(id);
const toastEl = qs("toast");

const CURRENCY_UNITS = { RUB: "₽", USD: "$", EUR: "€", CNY: "¥" };

function getUnitForAmountField(inputId) {
  const accountSelectMap = {
    homeTransferAmount: "homeTransferFrom",
    homeByAccountAmount: "homeByAccountFrom",
    homeByPhoneAmount: "homeByPhoneFrom",
    homeExchangeAmount: "homeExchangeFrom",
  };
  let accountId = null;
  if (accountSelectMap[inputId]) {
    const select = qs(accountSelectMap[inputId]);
    if (select?.value) accountId = Number(select.value);
  } else if (inputId === "mobileAmount" || inputId === "vendorAmount") {
    return "₽";
  }
  if (accountId && state.accounts?.length) {
    const acc = state.accounts.find((a) => a.id === accountId);
    if (acc?.currency) return CURRENCY_UNITS[acc.currency] ?? "денег";
  }
  return "денег";
}

const AMOUNT_CONFIGS = {
  homeTransferAmount: { min: 10, max: 300000 },
  homeByAccountAmount: { min: 10, max: 300000 },
  homeByPhoneAmount: { min: 10, max: 300000 },
  homeExchangeAmount: { min: 0.01 },
  mobileAmount: { min: 100, max: 12000, unit: "₽" },
  vendorAmount: { min: 100, max: 500000, unit: "₽" },
};
let recentLimit = 5;
let pendingCloseAccountId = null;
let pendingOtp = null;
let otpTimerId = null;
let otpExpiresAt = 0;

function mapApiError(detail) {
  switch (detail) {
    case "invalid_token":
      return "Сессия истекла. Войдите заново.";
    case "invalid_otp_code":
      return "Неверный OTP-код.";
    case "transfer_same_account":
      return "Нельзя переводить на тот же счёт.";
    case "transfer_amount_too_small":
      return "Слишком маленькая сумма перевода.";
    case "transfer_amount_exceeds_single_limit":
      return "Сумма превышает лимит на одну операцию.";
    case "transfer_amount_exceeds_daily_limit":
      return "Превышен дневной лимит по переводам.";
    case "account_not_found":
      return "Такого счёта нет в нашем банке(((";
    case "account_found_in_bank":
      return "Этот счёт принадлежит нашему банку. Выберите перевод по номеру счёта (без комиссии).";
    case "invalid_account_number":
      return "Недопустимый номер счёта (требуется 16 цифр).";
    case "recipient_not_found_in_our_bank":
      return "Такого пользователя нет в нашем банке(((";
    case "recipient_has_no_suitable_account":
      return "У получателя нет подходящего счёта для перевода.";
    case "forbidden_account_access":
      return "Нет доступа к этому счёту.";
    case "account_inactive":
      return "Операция недоступна: счёт не активен.";
    case "currency_mismatch":
      return "Нельзя перевести между счетами с разными валютами.";
    case "insufficient_funds":
      return "Недостаточно средств на счёте.";
    case "account_limit_exceeded":
      return "Достигнут лимит по количеству счетов для этой валюты.";
    case "account_already_closed":
      return "Счёт уже закрыт.";
    case "account_close_requires_zero_balance":
      return "Чтобы закрыть счёт, баланс должен быть 0,00.";
    case "transfer_not_allowed_from_savings":
      return "С накопительного счёта нельзя переводить. Используйте дебетовый.";
    case "currency_not_supported_for_exchange":
      return "Эта пара валют недоступна для обмена.";
    case "user_blocked":
      return "Пользователь заблокирован.";
    case "invalid_credentials":
      return "Неверный логин или пароль.";
    case "payment_operator_not_supported":
      return "Выбранный оператор не поддерживается.";
    case "payment_amount_out_of_range":
      return "Сумма платежа вне допустимого диапазона.";
    case "payment_requires_rub_account":
      return "Платёж возможен только с рублёвого счёта.";
    case "payment_provider_not_supported":
      return "Выбранный поставщик не поддерживается.";
    case "payment_provider_not_in_category":
      return "Поставщик не относится к выбранной категории платежа.";
    case "payment_account_number_invalid_length":
      return "Недопустимая длина номера лицевого счёта для этого поставщика.";
    case "amount_must_be_positive":
      return "Сумма должна быть больше нуля.";
    case "not_found":
      return "Объект не найден.";
    case "forbidden":
      return "Доступ запрещён.";
    case "validation_error: phone_not_unique":
      return "Этот номер телефона уже используется.";
    case "validation_error: email_not_unique":
      return "Этот email уже используется.";
    case "validation_error: password_change_requires_both_fields":
      return "Для смены пароля нужен текущий пароль. Смена пароля в профиле временно недоступна.";
    case "invalid_current_password":
      return "Неверный текущий пароль.";
    case "validation_error: password_reuse_not_allowed":
      return "Новый пароль не должен совпадать с текущим.";
    case "validation_error: password_equals_login":
      return "Пароль не должен совпадать с логином.";
    case "validation_error: password_contains_space":
      return "Пароль не должен содержать пробелы.";
    case "validation_error: weak_password":
      return "Новый пароль не подходит: от 8 до 30 символов, нужны строчная и заглавная буква, цифра и спецсимвол (например !@#$).";
    case "validation_error":
    case "value_error":
      return "Ошибка валидации. Проверьте введённые данные.";
    case "amount_too_large":
      return "Сумма превышает допустимый лимит (макс. 999 999 999 999,99).";
    case "database_migration_required":
      return "Требуется обновление БД: выполните backend/scripts/add_fee_to_transactions.sql";
    case "salary_credit_admin_only":
      return "Начисление зарплаты доступно только администратору.";
    case "request_failed":
    default:
      return "Не удалось выполнить запрос. Попробуйте позже.";
  }
}

function validateNewPassword(password, login) {
  if (!password || password.length < 8) {
    return "Пароль должен быть не короче 8 символов.";
  }
  if (password.length > 30) {
    return "Пароль должен быть не длиннее 30 символов.";
  }
  if (/\s/.test(password)) {
    return "Пароль не должен содержать пробелы.";
  }
  if (login && password === login) {
    return "Пароль не должен совпадать с логином.";
  }
  if (!/[a-z]/.test(password)) {
    return "Паролю не хватает строчной буквы.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Паролю не хватает заглавной буквы.";
  }
  if (!/[0-9]/.test(password)) {
    return "Паролю не хватает цифры.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Паролю не хватает спецсимвола (например !@#$).";
  }
  return "";
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.setAttribute("data-toast-type", isError ? "error" : "success");
  toastEl.setAttribute("data-toast-message", message);
  toastEl.classList.add("show");
  toastEl.classList.toggle("error", isError);
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toastEl.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let code = data.detail ?? "request_failed";
    if (Array.isArray(code) && code.length > 0) {
      const first = code[0];
      code = first.msg || first.type || "validation_error";
    }
    // 401 с пустым телом при PUT /profile часто значит «неверный текущий пароль» — не разлогиниваем
    if (response.status === 401 && code === "request_failed" && options.method === "PUT" && path === "/profile") {
      code = "invalid_current_password";
    }

    // Если токен недействителен — разлогиниваем (но не при ошибке «неверный текущий пароль»)
    if (code === "invalid_token" || (response.status === 401 && code !== "invalid_current_password")) {
      try {
        localStorage.removeItem("sb_access_token");
        localStorage.removeItem("sb_role");
      } catch {
        // ignore storage errors
      }
      showToast("Сессия истекла. Войдите заново.", true);
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
      const error = new Error("Сессия истекла. Войдите заново.");
      error.code = code;
      throw error;
    }

    const message = typeof code === "string" ? mapApiError(code) : "Ошибка валидации данных.";
    const error = new Error(message);
    error.code = code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatAmount(value, currency) {
  const num = Number(value);
  if (Number.isNaN(num) || typeof value === "object") {
    return `0,00 ${currency || "RUB"}`;
  }
  return `${num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "RUB"}`;
}

function maskAccount(accountNumber) {
  if (!accountNumber) return "-";
  return `••••${String(accountNumber).slice(-4)}`;
}

function formatAccountTypeLabel(accountType) {
  if (accountType === "DEBIT") return "Дебетовый";
  if (accountType === "SAVINGS") return "Накопительный";
  return accountType || "";
}

function getAccountLabelById(accountId) {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc) return null;
  const masked = maskAccount(acc.account_number);
  return `${acc.currency} · ${masked}`;
}

/** Берёт сумму/комиссию/валюту из tx: из объекта money (новый API) или из полей amount, fee, currency (fallback). */
function getTxMoney(tx) {
  if (tx.money && typeof tx.money === "object") {
    return {
      amount: Number(tx.money.amount) || 0,
      fee: Number(tx.money.fee) || 0,
      total: Number(tx.money.total) || 0,
      currency: tx.money.currency || "RUB",
    };
  }
  const amount = Number(tx.amount) || 0;
  let fee = typeof tx.fee === "number" ? tx.fee : parseFloat(tx.fee) || 0;
  if (fee === 0 && tx.description) fee = parseFeeFromDescription(tx.description);
  fee = Number(fee) || 0;
  return { amount, fee, total: amount + fee, currency: tx.currency || "RUB" };
}

function getTransactionMeta(tx) {
  const description = tx.description || "";
  let kind = "other";

  if (tx.type === "TOPUP") {
    kind = "topup";
  } else if (tx.type === "PAYMENT") {
    kind = "payment";
  } else if (tx.type === "TRANSFER") {
    if (description.startsWith("fx_exchange")) {
      kind = "fx";
    } else if (description === "p2p_transfer") {
      kind = "transfer-own";
    } else if (
      description.startsWith("p2p_transfer_by_account") ||
      description.startsWith("p2p_transfer_by_phone") ||
      description.startsWith("p2p_by_phone_external") ||
      description.startsWith("external_transfer")
    ) {
      kind = "transfer-out";
    } else {
      kind = "transfer-own";
    }
  }

  let sign = "";
  let icon = "•";
  let iconClass = "tx-icon--other";
  let amountClass = "";
  const ownedAccountIds = state.accounts.map((a) => a.id);
  const ownsFrom = tx.from_account_id && ownedAccountIds.includes(tx.from_account_id);
  const ownsTo = tx.to_account_id && ownedAccountIds.includes(tx.to_account_id);

  switch (kind) {
    case "topup":
      sign = "+";
      icon = "+";
      iconClass = "tx-icon--topup";
      amountClass = "recent-amount-pos";
      break;
    case "payment":
      sign = "−";
      icon = "₽";
      iconClass = "tx-icon--payment";
      amountClass = "recent-amount-neg";
      break;
    case "transfer-out":
      if (ownsFrom && !ownsTo) {
        // Мы отправили другому
        sign = "−";
        icon = "↗";
        iconClass = "tx-icon--transfer-out";
        amountClass = "recent-amount-neg";
      } else if (!ownsFrom && ownsTo) {
        // Мы получили от другого
        sign = "+";
        icon = "↙"; // стрелка к нам
        iconClass = "tx-icon--topup";
        amountClass = "recent-amount-pos";
      } else {
        sign = "";
        icon = "↗";
        iconClass = "tx-icon--transfer-out";
        amountClass = "";
      }
      break;
    case "transfer-own":
      sign = "";
      icon = "⇄";
      iconClass = "tx-icon--transfer-own";
      amountClass = "";
      break;
    case "fx":
      sign = "";
      icon = "⇆";
      iconClass = "tx-icon--fx";
      amountClass = "";
      break;
    default:
      sign = "";
      icon = "•";
      iconClass = "tx-icon--other";
      amountClass = "";
  }

  const money = getTxMoney(tx);
  const baseAmount = formatAmount(money.total, money.currency);
  const signedAmount =
    sign === "+" ? `+${baseAmount}` : sign === "−" ? `-${baseAmount}` : baseAmount;

  return {
    kind,
    sign,
    icon,
    iconClass,
    amountClass,
    signedAmount,
    fee: money.fee,
    totalAmount: money.total,
  };
}

/** Парсит description для mobile: оператор:телефон */
function parseMobileDescription(desc) {
  if (!desc?.startsWith("mobile:")) return null;
  const parts = desc.split(":");
  return { operator: parts[1] || "—", phone: parts[2] || "—" };
}

/** Парсит description для vendor: поставщик:лицевой_счёт */
function parseVendorDescription(desc) {
  if (!desc?.startsWith("vendor:")) return null;
  const parts = desc.split(":");
  return { provider: parts[1] || "—", accountNumber: parts[2] || "—" };
}

/** Парсит description для p2p_transfer_by_account:валюта:••••1234 */
function parseTransferByAccountDescription(desc) {
  if (!desc?.startsWith("p2p_transfer_by_account")) return null;
  const parts = desc.split(":");
  if (parts.length >= 3) return { currency: parts[1] || "RUB", masked: parts[2] || "••••" };
  return null;
}

/** Парсит description для p2p_transfer_by_phone:валюта:••••1234 */
function parseTransferByPhoneDescription(desc) {
  if (!desc?.startsWith("p2p_transfer_by_phone")) return null;
  const parts = desc.split(":");
  if (parts.length >= 3) return { currency: parts[1] || "RUB", masked: parts[2] || "••••" };
  return null;
}

/** Парсит description для p2p_by_phone_external:bank_code:phone */
function parseTransferExternalDescription(desc) {
  if (!desc?.startsWith("p2p_by_phone_external")) return null;
  const parts = desc.split(":");
  return { bankCode: parts[1] || "", phone: parts[2] || "—" };
}

/** Извлекает комиссию из description (external_transfer:...:fee_15000 или p2p_by_phone_external:...:fee_6000) */
function parseFeeFromDescription(desc) {
  if (!desc || typeof desc !== "string") return 0;
  const match = desc.match(/:fee_([\d.]+)$/);
  return match ? parseFloat(match[1]) || 0 : 0;
}

/** Возвращает массив полей {label, value} для деталей операции в зависимости от типа */
function getTransactionDetailFields(tx) {
  const meta = getTransactionMeta(tx);
  const desc = tx.description || "";
  const fromLabel = tx.from_account_id ? getAccountLabelById(tx.from_account_id) : null;
  const toLabel = tx.to_account_id ? getAccountLabelById(tx.to_account_id) : null;
  const dt = new Date(tx.created_at);
  const dateStr = dt.toLocaleDateString("ru-RU");
  const timeStr = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateTime = `${dateStr} ${timeStr}`;
  const fields = [];

  switch (meta.kind) {
    case "payment": {
      const mobile = parseMobileDescription(desc);
      const vendor = parseVendorDescription(desc);
      if (mobile) {
        fields.push({ label: "Оператор", value: mobile.operator });
        fields.push({ label: "Номер телефона", value: mobile.phone });
      } else if (vendor) {
        fields.push({ label: "Поставщик", value: vendor.provider });
        fields.push({ label: "Лицевой счёт", value: vendor.accountNumber });
      } else {
        fields.push({ label: "Куда", value: desc || "Оплата услуг" });
      }
      fields.push({ label: "Откуда", value: fromLabel || "Счёт списания" });
      break;
    }
    case "topup": {
      const incomeLabel = getIncomeTypeLabel(desc);
      const sourceLabel =
        incomeLabel === "Зарплата"
          ? "ShlapaBank (зарплата)"
          : incomeLabel === "Подарок"
          ? "ShlapaBank (подарок)"
          : "ShlapaBank";
      fields.push({ label: "Куда", value: toLabel || "Счёт" });
      fields.push({ label: "Откуда", value: sourceLabel });
      break;
    }
    case "transfer-own":
    case "fx":
      fields.push({ label: "Откуда", value: fromLabel || "Счёт" });
      fields.push({ label: "Куда", value: toLabel || "Счёт" });
      break;
    case "transfer-out": {
      fields.push({ label: "Откуда", value: fromLabel || "Счёт" });
      const byAccount = parseTransferByAccountDescription(desc);
      const byPhone = parseTransferByPhoneDescription(desc);
      const external = parseTransferExternalDescription(desc);
      if (byAccount) {
        fields.push({ label: "Счёт получателя", value: `${byAccount.currency} · ${byAccount.masked}` });
      } else if (byPhone) {
        fields.push({ label: "Счёт получателя", value: `${byPhone.currency} · ${byPhone.masked}` });
      } else if (external) {
        fields.push({ label: "Банк получателя", value: BANK_LABELS[external.bankCode] || external.bankCode || "—" });
        if (external.phone && external.phone !== "—") {
          fields.push({ label: "Номер телефона", value: external.phone });
        }
      } else {
        fields.push({ label: "Куда", value: toLabel || "Получатель" });
      }
      break;
    }
    default:
      fields.push({ label: "Откуда", value: fromLabel || "—" });
      fields.push({ label: "Куда", value: toLabel || desc || "—" });
  }

  fields.push({ label: "Дата и время", value: dateTime });
  fields.push({ label: "Банк", value: "ShlapaBank" });
  const money = getTxMoney(tx);
  if (money.fee > 0) {
    fields.push({ label: "Комиссия", value: formatAmount(money.fee, money.currency), amountClass: meta.amountClass || "" });
    fields.push({ label: "Сумма", value: formatAmount(money.total, money.currency), amountClass: meta.amountClass || "" });
  } else {
    fields.push({ label: "Сумма", value: meta.signedAmount, amountClass: meta.amountClass || "" });
  }
  return fields;
}


/** Справочник банков для отображения в операциях (код → название) */
const BANK_LABELS = {
  shlapabank: "ShlapaBank",
  alpha: "Бабальфа Банк",
  tinkoff: "Пенькофф Банк",
  sber: "Сберушка Банк",
  vtb: "ВТБей",
  gazprombank: "Газовик Банк",
  raiffeisen: "Райфейзен Банк",
  rosbank: "Россик Банк",
  otkritie: "Банк Откройка",
  unicredit: "Юникред Банк",
  rshb: "СельхозФинанс",
  sovcombank: "Совком Плюс",
  promsvyaz: "ПромСбер Банк",
  mts: "МТСей Финанс",
  post: "ПочтаФинанс",
  uralsib: "УралСиб Банк",
};

/** Главный заголовок операции: куда платили / кому переводили (Beeline, банк и т.д.) */
function getTransactionTitle(tx, meta) {
  const description = tx.description || "";
  const fromLabel = tx.from_account_id ? getAccountLabelById(tx.from_account_id) : null;
  const toLabel = tx.to_account_id ? getAccountLabelById(tx.to_account_id) : null;

  switch (meta.kind) {
    case "payment":
      if (description.startsWith("mobile:")) {
        const parts = description.split(":");
        return parts[1] || "Мобильная связь";
      }
      if (description.startsWith("vendor:")) {
        const parts = description.split(":");
        return parts[1] || "Поставщик";
      }
      return "Оплата услуг";
    case "transfer-own":
      return "Между своими счетами";
    case "transfer-out": {
      const ownsFrom = tx.from_account_id && (state.accounts || []).map((a) => a.id).includes(tx.from_account_id);
      const ownsTo = tx.to_account_id && (state.accounts || []).map((a) => a.id).includes(tx.to_account_id);
      if (!ownsFrom && ownsTo) return "Перевод"; // получен
      if (description.startsWith("p2p_by_phone_external:")) {
        const bankCode = description.split(":")[1];
        return BANK_LABELS[bankCode] || bankCode || "Банк получателя";
      }
      if (description.startsWith("external_transfer")) return "В другой банк";
      if (description.startsWith("p2p_transfer_by_account")) return "По номеру счёта";
      if (description.startsWith("p2p_transfer_by_phone")) return "По номеру телефона";
      return "Перевод";
    }
    case "fx":
      return "Обмен валют";
    case "topup": {
      const incomeLabel = getIncomeTypeLabel(description);
      if (incomeLabel === "Зарплата") return "Зарплата от банка";
      if (incomeLabel === "Подарок") return "Подарок от банка";
      return incomeLabel ? `${incomeLabel} от банка` : "Пополнение от банка";
    }
    default:
      return tx.type || "Операция";
  }
}

/** Подпись типа операции (мелким текстом под заголовком) */
function getTransactionTypeLabel(tx, meta) {
  switch (meta.kind) {
    case "payment": {
      const d = tx.description || "";
      if (d.startsWith("mobile:")) return "Оплата мобильной связи";
      if (d.startsWith("vendor:")) return "Оплата услуг";
      return "Оплата услуг";
    }
    case "transfer-own":
    case "transfer-out":
      return "Перевод";
    case "fx":
      return "Обмен валют";
    case "topup": {
      const d = tx.description || "";
      if (d.startsWith("self_topup:salary") || d === "admin_credit") return "Пополнение от банка (зарплата)";
      if (d.startsWith("self_topup:gift")) return "Пополнение от банка (подарок)";
      return "Пополнение от банка";
    }
    default:
      return tx.type || "Операция";
  }
}

function formatTransactionSubtitle(tx, meta) {
  const dt = new Date(tx.created_at);
  const dateStr = dt.toLocaleDateString("ru-RU");
  const timeStr = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const dateTime = `${dateStr} ${timeStr}`;
  const fromLabel = tx.from_account_id ? getAccountLabelById(tx.from_account_id) : null;
  const toLabel = tx.to_account_id ? getAccountLabelById(tx.to_account_id) : null;

  switch (meta.kind) {
    case "topup": {
      const target = toLabel || getAccountLabelById(tx.to_account_id);
      return target ? `${dateTime} · Пополнение счёта ${target}` : `${dateTime} · Пополнение баланса`;
    }
    case "payment": {
      const base = `${dateTime} · Оплата услуг`;
      return tx.description ? `${base} · ${tx.description}` : base;
    }
    case "transfer-own": {
      const from = fromLabel || "со счёта";
      const to = toLabel || "на счёт";
      return `${dateTime} · Перевод ${from} → ${to}`;
    }
    case "transfer-out": {
      const from = fromLabel || "со счёта";
      return `${dateTime} · Перевод другому · ${from}`;
    }
    case "fx": {
      return `${dateTime} · Обмен валют`;
    }
    default: {
      return tx.description ? `${dateTime} · ${tx.description}` : dateTime;
    }
  }
}

/** Форматирует номер для отображения: +7(906)000-00-00 */
function formatPhoneDisplay(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  let d = digits.startsWith("7") ? digits.slice(1) : digits;
  d = d.slice(0, 10);
  if (d.length === 0) return "+7";
  if (d.length <= 3) return `+7(${d}`;
  if (d.length <= 6) return `+7(${d.slice(0, 3)})${d.slice(3)}`;
  if (d.length <= 8) return `+7(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6)}`;
  return `+7(${d.slice(0, 3)})${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}

/** Извлекает сырой номер +7XXXXXXXXXX из ввода для API */
function getRawPhone(value) {
  let digits = (value || "").replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length >= 11) digits = "7" + digits.slice(1);
  if (digits.length === 10 && !digits.startsWith("7")) digits = "7" + digits;
  if (digits.startsWith("7")) digits = digits.slice(0, 11);
  return digits.length >= 11 ? "+" + digits.slice(0, 11) : "";
}

function applyPhoneMask(input) {
  const oldVal = input.value || "";
  let digits = oldVal.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length >= 11) digits = "7" + digits.slice(1);
  if (digits.length === 10 && !digits.startsWith("7")) digits = "7" + digits;
  if (digits.startsWith("7")) digits = digits.slice(0, 11);
  input.value = formatPhoneDisplay("+" + digits);
}

function stripEdgeSpacesInput(input) {
  const v = input.value;
  const trimmed = v.replace(/^\s+/, "").replace(/\s+$/, "");
  if (trimmed !== v) {
    input.value = trimmed;
  }
}

function stripAllSpacesInput(input) {
  const v = input.value;
  const noSpaces = v.replace(/\s+/g, "");
  if (noSpaces !== v) {
    input.value = noSpaces;
  }
}

/** Номер счёта: 16 цифр. Форматирование с пробелом каждые 4 цифры. */
const ACCOUNT_NUMBER_LENGTH = 16;
const ACCOUNT_NUMBER_MIN = 16;
const ACCOUNT_NUMBER_MAX = 16;

/** Единообразные сообщения валидации (красные под полем). */
const VALIDATION_MESSAGES = {
  phone: "Проверьте корректность введённого номера",
  personalAccount: "Проверьте корректность введённого лицевого счёта",
  accountNumber: "Проверьте корректность введённого номера счёта",
  personalAccountEmpty: "Укажите лицевой счёт",
  bank: "Выберите банк",
};

function formatAccountNumberWithSpaces(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, ACCOUNT_NUMBER_LENGTH);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function getAccountNumberDigits(value) {
  return String(value).replace(/\D/g, "");
}

function preventSpaceKey(event) {
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
  }
}

function collectOtpCode() {
  const d1 = qs("otpDigit1")?.value || "";
  const d2 = qs("otpDigit2")?.value || "";
  const d3 = qs("otpDigit3")?.value || "";
  const d4 = qs("otpDigit4")?.value || "";
  const code = `${d1}${d2}${d3}${d4}`;
  return code;
}

function resetOtpInputs() {
  ["otpDigit1", "otpDigit2", "otpDigit3", "otpDigit4"].forEach((id) => {
    const el = qs(id);
    if (el) el.value = "";
  });
}

/** Показать ошибку у поля. По умолчанию — toast. При options.showToast === false — только подсветка и текст под полем (как «Максимальная сумма 500 000 ₽»). */
function setAmountError(inputId, message, options) {
  options = options || {};
  const useToast = options.showToast !== false;
  const input = qs(inputId);
  if (!input) return;
  const label = input.closest("label");
  const errorEl = qs(`${inputId}Error`);
  if (label) {
    label.classList.toggle("has-error", Boolean(message));
    if (inputId === "mobileAmount" || inputId === "vendorAmount") {
      const amountHint = label.querySelector(".payments-limit-hint");
      if (amountHint) amountHint.style.display = ""; // подсказка всегда видна
    }
  }
  if (errorEl) errorEl.textContent = useToast ? "" : (message || "");
  if (message && useToast) showToast(message, true);
}

/** Обновляет подсказку по лимитам: минимум всегда показан, при превышении — максимум.
 *  showToastOnError: true только при отправке формы — тогда ошибка в toast и без текста под полем.
 *  При вводе (input/blur) showToastOnError не передаётся — подсказка остаётся под полем, toast не показываем. */
function updateAmountHint(inputId, config, options) {
  options = options || {};
  const { min, max } = config || {};
  const unit = config?.unit ?? getUnitForAmountField(inputId);
  const { showEmptyError = false, showToastOnError = false } = options;
  const input = qs(inputId);
  if (!input) return true;
  const label = input.closest("label");
  const hintEl =
    inputId === "mobileAmount" || inputId === "vendorAmount"
      ? label?.querySelector(".payments-limit-hint")
      : qs(`${inputId}Error`);
  if (!hintEl) return true;

  const raw = input.value;
  const value = raw ? Number(raw) : NaN;
  const isEmpty = !raw;
  const isInvalidNum = !isEmpty && (!Number.isFinite(value) || value <= 0);

  let hintText = "";
  let isError = false;

  if (isInvalidNum) {
    hintText = "Некорректная сумма";
    isError = true;
  } else if (isEmpty) {
    hintText = typeof min === "number" ? `Минимальная сумма ${formatAmountLimit(min)} ${unit}`.trim() : "Укажите сумму";
    isError = showEmptyError;
  } else if (typeof min === "number" && value < min) {
    hintText = `Минимальная сумма ${formatAmountLimit(min)} ${unit}`.trim();
    isError = !isEmpty;
  } else if (typeof max === "number" && value > max) {
    hintText = `Максимальная сумма ${formatAmountLimit(max)} ${unit}`.trim();
    isError = true;
  } else {
    if (typeof max === "number") {
      hintText = `Максимальная сумма ${formatAmountLimit(max)} ${unit}`.trim();
    } else if (typeof min === "number") {
      hintText = `Минимальная сумма ${formatAmountLimit(min)} ${unit}`.trim();
    }
    isError = false;
  }
  const suffix = options.amountHintMaxSuffix;
  if (typeof suffix === "string" && suffix && /Максимальная сумма/.test(hintText)) {
    hintText = hintText + suffix;
  }

  if (showToastOnError && isError && hintText) showToast(hintText, true);
  hintEl.textContent = showToastOnError && isError ? "" : hintText;
  hintEl.classList.toggle("limit-hint-accent", !isError && /Минимальная сумма|Максимальная сумма/.test(hintText));
  if (label) label.classList.toggle("has-error", isError);
  return !isError;
}

function formatAmountLimit(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  const hasFraction = Math.round(num * 100) % 100 !== 0;
  return num.toLocaleString("ru-RU", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

function validateAmountField(inputId, config, options = {}) {
  return updateAmountHint(inputId, config, options);
}

function validateVendorAccountNumber(options = {}) {
  const { showEmptyError = false, showToast = true } = options || {};
  const errOpts = { showToast };
  const inputId = "vendorAccountNumber";
  const input = qs(inputId);
  const providerSelect = qs("vendorProvider");
  if (!input || !providerSelect) return true;

  const value = input.value.trim();
  if (!value) {
    if (showEmptyError) {
      setAmountError(inputId, VALIDATION_MESSAGES.personalAccountEmpty, errOpts);
      input.focus();
      return false;
    }
    setAmountError(inputId, "", errOpts);
    return false;
  }

  const provider = providerSelect.value;
  const rule = PROVIDER_PREFIX_RULES[provider];
  if (rule && rule.prefix && !value.startsWith(rule.prefix)) {
    setAmountError(inputId, VALIDATION_MESSAGES.personalAccount, errOpts);
    input.focus();
    return false;
  }

  const opt = providerSelect.options[providerSelect.selectedIndex];
  const expectedLen = opt && opt.dataset.accountLength ? parseInt(opt.dataset.accountLength, 10) : 0;
  if (expectedLen > 0 && value.length !== expectedLen) {
    setAmountError(inputId, VALIDATION_MESSAGES.personalAccount, errOpts);
    input.focus();
    return false;
  }

  setAmountError(inputId, "", errOpts);
  return true;
}

async function openOtpModal(context) {
  const modal = qs("otpModal");
  if (!modal) return;
  pendingOtp = context;
  resetOtpInputs();
  window.history.pushState({ page: "confirm" }, "", "/confirm");
  const preview = qs("otpPreview");
  if (preview) {
    preview.textContent = "Получаем SMS-код...";
  }
  modal.hidden = false;
  modal.classList.add("show");
  try {
    const data = await api("/helper/otp/preview");
    const code = data?.otp || "";
    const ttlSeconds = data?.ttlSeconds ?? 60;
    if (preview) {
      if (code) {
        attachOtpPreviewButton(preview, code);
        startOtpTimer(ttlSeconds);
      } else {
        preview.textContent = data?.message || "SMS-код сгенерирован.";
      }
    }
  } catch (error) {
    if (preview) {
      preview.textContent = "Не удалось получить SMS-код. Попробуйте ещё раз.";
    }
  }

  const first = qs("otpDigit1");
  if (first) {
    first.focus();
    first.select?.();
  }
}

function hideOtpModal() {
  const modal = qs("otpModal");
  if (!modal) return;
  if (typeof pendingOtp?.onClose === "function") {
    try {
      pendingOtp.onClose();
    } catch (_) {}
  }
  modal.classList.remove("show");
  modal.hidden = true;
  pendingOtp = null;
  stopOtpTimer();
  if (window.location.pathname === "/confirm") {
    window.history.back();
  }
}

function stopOtpTimer() {
  if (otpTimerId) {
    clearInterval(otpTimerId);
    otpTimerId = null;
  }
  otpExpiresAt = 0;
  const timerEl = qs("otpTimer");
  if (timerEl) {
    timerEl.textContent = "";
    timerEl.classList.remove("expired");
  }
}

function getOtpRemainingSeconds() {
  if (otpExpiresAt <= 0) return 0;
  return Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
}

function formatOtpTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startOtpTimer(ttlSeconds) {
  stopOtpTimer();
  otpExpiresAt = Date.now() + ttlSeconds * 1000;
  const timerEl = qs("otpTimer");
  if (!timerEl) return;

  const tick = () => {
    const remaining = getOtpRemainingSeconds();
    if (remaining <= 0) {
      timerEl.textContent = "0:00";
      timerEl.classList.add("expired");
      stopOtpTimer();
      return;
    }
    timerEl.textContent = `Код действителен: ${formatOtpTimer(remaining)}`;
    timerEl.classList.remove("expired");
  };

  tick();
  otpTimerId = setInterval(tick, 1000);
}

function attachOtpPreviewButton(preview, code) {
  const normalizedCode = String(code || "").replace(/\D/g, "").slice(0, 4);
  if (!normalizedCode) return;
  preview.innerHTML = `SMS: ваш код подтверждения <button type="button" class="otp-preview-code" data-otp-code="${normalizedCode}">${normalizedCode}</button>`;
  const codeButton = preview.querySelector(".otp-preview-code");
  if (codeButton) {
    const applyCodeFromPreview = () => {
      const digits = String(codeButton.dataset.otpCode || "")
        .replace(/\D/g, "")
        .slice(0, 4)
        .split("");
      const otpIds = ["otpDigit1", "otpDigit2", "otpDigit3", "otpDigit4"];
      otpIds.forEach((id, index) => {
        const input = qs(id);
        if (input) input.value = digits[index] || "";
      });
      const lastIndex = Math.min(digits.length, otpIds.length) - 1;
      const lastInput = lastIndex >= 0 ? qs(otpIds[lastIndex]) : qs(otpIds[otpIds.length - 1]);
      if (lastInput) {
        lastInput.focus();
        lastInput.select?.();
      }
      const collected = collectOtpCode();
      if (collected.length === 4) handleOtpSubmit();
    };
    codeButton.addEventListener("click", applyCodeFromPreview);
    codeButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        applyCodeFromPreview();
      }
    });
  }
}

async function refreshOtpInModal() {
  const preview = qs("otpPreview");
  if (!preview || !pendingOtp) return;
  try {
    const data = await api("/helper/otp/preview");
    const code = data?.otp || "";
    const ttlSeconds = data?.ttlSeconds ?? 60;
    attachOtpPreviewButton(preview, code);
    startOtpTimer(ttlSeconds);
    resetOtpInputs();
    const first = qs("otpDigit1");
    if (first) first.focus();
  } catch (_) {
    preview.textContent = "Не удалось получить новый код. Попробуйте ещё раз.";
  }
}

async function handleOtpSubmit() {
  if (!pendingOtp) {
    hideOtpModal();
    return;
  }
  const code = collectOtpCode();
  if (code.length !== 4) {
    showToast("Введите 4-значный OTP код", true);
    return;
  }
  if (getOtpRemainingSeconds() <= 0) {
    showToast("OTP истёк. Отправлен новый код.", true);
    await refreshOtpInModal();
    return;
  }
  const { kind, payload, onSuccess, errorPrefix, successMessage } = pendingOtp;
  try {
    if (kind === "transfer-own") {
      await api("/transfers", {
        method: "POST",
        body: JSON.stringify({ ...payload, otp_code: code }),
      });
    } else     if (kind === "transfer-by-account") {
      await api("/transfers/by-account", {
        method: "POST",
        body: JSON.stringify({ ...payload, otp_code: code }),
      });
    } else if (kind === "transfer-external-by-account") {
      await api("/transfers/external-by-account", {
        method: "POST",
        body: JSON.stringify({ ...payload, otp_code: code }),
      });
    } else if (kind === "transfer-by-phone") {
      await api("/transfers/by-phone", {
        method: "POST",
        body: JSON.stringify({ ...payload, otp_code: code }),
      });
    } else if (kind === "exchange") {
      await api("/transfers/exchange", {
        method: "POST",
        body: JSON.stringify({ ...payload, otp_code: code }),
      });
    } else if (kind === "mobile") {
      await api("/payments/mobile", {
        method: "POST",
        body: JSON.stringify({ ...payload, otp_code: code }),
      });
    } else if (kind === "topup") {
      const { account_id, amount, purpose } = payload;
      await api(`/accounts/${account_id}/topup`, {
        method: "POST",
        body: JSON.stringify({ amount, otp_code: code, purpose: purpose || undefined }),
      });
    } else {
      // vendor и все категории (internet, utilities, education, charity) — один эндпоинт
      await api("/payments/vendor", {
        method: "POST",
        body: JSON.stringify({ ...payload, otp_code: code }),
      });
    }
    showToast(successMessage || "Операция выполнена");
    hideOtpModal();
    if (typeof onSuccess === "function") {
      await onSuccess();
    }
  } catch (error) {
    if (error && error.code === "invalid_otp_code") {
      showToast("OTP истёк. Отправлен новый код.", true);
      await refreshOtpInModal();
    } else if (
      pendingOtp &&
      (pendingOtp.kind === "transfer-external-by-account" ||
        (pendingOtp.kind === "transfer-by-phone" &&
          pendingOtp.payload?.recipient_bank_id !== "shlapabank")) &&
      (error.code === "insufficient_funds" || error.code === "transfer_amount_exceeds_daily_limit")
    ) {
      showToast("Недостаточно средств для перевода с учётом комиссии", true);
    } else {
      showToast(`${errorPrefix || "Ошибка операции"}: ${error.message}`, true);
    }
  } finally {
    // для успешных операций очищаем код и модалку, при invalid_otp_code уже сбросили выше
    if (!pendingOtp) {
      resetOtpInputs();
    }
  }
}

function isUserBlocked() {
  return state.profile?.status === "BLOCKED";
}

function renderProfile() {
  if (!state.profile) return;
  const firstName = state.profile.first_name || "";
  const initial = firstName ? firstName.charAt(0).toUpperCase() : "";

  qs("userAvatar").textContent = initial;
  const statusEl = qs("statusBadge");
  if (statusEl) {
    const isActive = state.profile.status === "ACTIVE";
    statusEl.textContent = isActive ? "Активный" : "Заблокирован";
    statusEl.classList.toggle("green", isActive);
    statusEl.classList.toggle("blocked", !isActive);
  }
  const supportMsg = qs("profileSupportMessage");
  if (supportMsg) supportMsg.hidden = !isUserBlocked();
  qs("firstName").value = state.profile.first_name || "";
  qs("lastName").value = state.profile.last_name || "";
  qs("phone").value = state.profile.phone ? formatPhoneDisplay(state.profile.phone) : "";
  const emailField = qs("email");
  if (emailField) {
    const email = state.profile.email;
    emailField.value = email && email !== state.profile.login ? email : "";
  }
  const blocked = isUserBlocked();
  const profileForm = qs("profileForm");
  if (profileForm) {
    profileForm.querySelectorAll("input").forEach((el) => (el.readOnly = blocked));
    const submitBtn = profileForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = blocked;
  }
  applyBlockedState();
  renderNotifications();
}

/** Заблокирован: активна только вкладка «Ещё», остальное недоступно. */
function applyBlockedState() {
  const blocked = isUserBlocked();
  const c = "blocked-disabled";
  document.querySelectorAll('.topnav-tab[data-page-target="home"], .topnav-tab[data-page-target="payments"], .topnav-tab[data-page-target="chat"]').forEach((el) => {
    el.classList.toggle(c, blocked);
    el.disabled = blocked;
  });
  [
    "homeTransferOwnBtn", "homeTransferByAccountBtn", "homeTransferByPhoneBtn", "homeExchangeBtn",
    "showMoreTxBtn", "chatSendBtn", "chatAttachBtn", "chatInput", "primaryAccountsBtn", "superClearBtn",
  ].forEach((id) => {
    const el = qs(id);
    if (el) {
      el.classList.toggle(c, blocked);
      el.disabled = blocked;
      if (el.tagName === "INPUT") el.readOnly = blocked;
    }
  });
  const openBtn = qs("createAccountForm")?.querySelector('button[type="submit"]');
  if (openBtn) {
    openBtn.classList.toggle(c, blocked);
    openBtn.disabled = blocked;
  }
  ["mobileForm", "vendorForm"].forEach((formId) => {
    const btn = qs(formId)?.querySelector('button[type="submit"]');
    if (btn) {
      btn.classList.toggle(c, blocked);
      btn.disabled = blocked;
    }
  });
}

function renderNotifications() {
  const list = qs("notificationsList");
  const empty = qs("notificationsEmpty");
  const badge = qs("notificationsBadge");
  if (!list || !empty || !badge) return;

  const items = [];
  const p = state.profile;
  if (p) {
    const fn = p.first_name;
    const ln = p.last_name;
    const ph = p.phone;
    if (!fn || (typeof fn === "string" && fn.trim() === "")) {
      items.push({ text: "Заполните имя в профиле" });
    }
    if (!ln || (typeof ln === "string" && ln.trim() === "")) {
      items.push({ text: "Заполните фамилию в профиле" });
    }
    if (!ph || (typeof ph === "string" && ph.trim() === "")) {
      items.push({ text: "Заполните номер телефона в профиле" });
    }
  }

  list.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "notifications-item";
    div.textContent = item.text;
    list.appendChild(div);
  });

  empty.hidden = items.length > 0;
  badge.hidden = items.length === 0;
  badge.textContent = String(items.length);
}

function renderBalances() {
  const container = qs("balanceTotals");
  if (!container) return;

  const totals = state.accounts.reduce((acc, item) => {
    const key = item.currency;
    acc[key] = (acc[key] || 0) + Number(item.balance || 0);
    return acc;
  }, {});

  container.innerHTML = "";
  if (!state.accounts.length) {
    container.innerHTML = `<span class="balance-chip">${formatAmount(0, "RUB")}</span>`;
    return;
  }

  Object.entries(totals).forEach(([currency, value]) => {
    const chip = document.createElement("span");
    chip.className = "balance-chip";
    chip.textContent = `${formatAmount(value, currency)}`;
    container.appendChild(chip);
  });
}

/** Цвета для полосок по валютам: рубль — зелёный, доллар — синий, евро — жёлтый, CNY — фиолетовый */
/** Маппинг description → читаемая подпись дохода */
function getIncomeTypeLabel(desc) {
  if (!desc) return "Пополнение";
  if (desc.startsWith("self_topup:salary") || desc === "admin_credit") return "Зарплата";
  if (desc.startsWith("self_topup:gift") || desc === "helper_topup:gift") return "Подарок";
  if (desc.startsWith("self_topup:") || desc.startsWith("helper_topup:")) return desc.split(":")[1] || "Пополнение";
  if (desc === "helper_topup") return "Пополнение";
  return "Пополнение";
}

function renderAccounts() {
  const listEl = qs("accountsList");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!state.accounts.length) {
    listEl.innerHTML = '<p class="empty" data-testid="empty-accounts">Нет активных счетов. Откройте первый счёт.</p>';
    return;
  }

  const sortedAccounts = state.accounts
    .map((account, index) => ({ account, index }))
    .sort((a, b) => {
      const aIsRub = a.account.currency === "RUB";
      const bIsRub = b.account.currency === "RUB";
      if (aIsRub && !bIsRub) return -1;
      if (!aIsRub && bIsRub) return 1;
      if (a.account.currency !== b.account.currency) {
        return a.account.currency.localeCompare(b.account.currency);
      }
      return a.index - b.index;
    })
    .map((item) => item.account);

  sortedAccounts.forEach((account) => {
    const last4 = String(account.account_number || "").slice(-4) || "----";
    const typeLabel = formatAccountTypeLabel(account.account_type);
    const fullNumber = account.account_number || "";
    const maskedLabel = `Счет: * ${last4}`;
    const fullLabel = fullNumber ? `Счет: ${fullNumber}` : maskedLabel;

    const balanceLine = formatAmount(account.balance, account.currency);
    const typeLine = typeLabel || "";

    const row = document.createElement("div");
    row.className = "account-item";
    row.dataset.accountId = String(account.id);
    row.dataset.fullAccount = fullNumber;
    row.dataset.maskedLabel = maskedLabel;
    row.dataset.fullLabel = fullLabel;
    row.dataset.expanded = "false";
    row.innerHTML = `
      <div class="account-main">
        <div class="account-main-text">
          <strong>${balanceLine}</strong>
          <span>${typeLine}</span>
          <span class="account-number-tap">${maskedLabel}</span>
        </div>
      </div>
      <div class="account-actions">
        <button class="btn-mini warn" data-close-id="${account.id}" type="button" data-testid="btn-account-close">Закрыть счёт</button>
      </div>
    `;
    listEl.appendChild(row);
  });
}

function fillAccountSelects() {
  const allSelectIds = [
    "homeTransferFrom",
    "homeTransferTo",
    "homeByAccountFrom",
    "homeExchangeFrom",
    "homeExchangeTo",
    "cheatAccountSelect",
    "mobileAccount",
    "vendorAccount",
    "homeByPhoneFrom",
  ];
  const rubOnlyIds = ["mobileAccount", "vendorAccount"];
  const options = state.accounts.map((a) => ({
    id: a.id,
    label: `${a.currency} · ${maskAccount(a.account_number)}`,
    currency: a.currency,
    account_type: a.account_type,
  }));

  allSelectIds.forEach((id) => {
    const select = qs(id);
    if (!select) return;
    select.innerHTML = "";
    if (id === "homeExchangeTo") {
      fillExchangeToSelect();
      return;
    }
    if (id === "homeTransferTo") {
      fillHomeTransferToSelect();
      return;
    }
    const isPhoneFrom = id === "homeByPhoneFrom";
    const filtered = rubOnlyIds.includes(id)
      ? options.filter((opt) => opt.currency === "RUB" && opt.account_type === "DEBIT")
      : id === "homeTransferFrom" || id === "homeByAccountFrom" || id === "homeExchangeFrom" || isPhoneFrom
      ? options.filter((opt) => opt.account_type === "DEBIT")
      : options;
    if (isPhoneFrom) {
      filtered.forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt.id);
        option.textContent = opt.label;
        select.appendChild(option);
      });
      return;
    }
    filtered.forEach((opt) => {
      const option = document.createElement("option");
      option.value = String(opt.id);
      option.textContent = opt.label;
      select.appendChild(option);
    });
  });
}

async function fillHomeByPhoneBankSelect(phone) {
  const select = qs("homeByPhoneBank");
  if (!select) return;
      const raw = getRawPhone(phone || "");
      const validPhone = raw.length === 12 && /^\+7\d{10}$/.test(raw);
  const warningEl = qs("homeByPhoneNotInBankWarning");
  if (warningEl) warningEl.hidden = true;
  select.innerHTML = "";
  if (!validPhone) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Введите номер телефона";
    placeholder.disabled = true;
    select.appendChild(placeholder);
    return;
  }
  try {
    const data = await api(`/transfers/by-phone/check?phone=${encodeURIComponent(raw)}`);
    if (warningEl) warningEl.hidden = true;
    const banks = (data && data.availableBanks) || [];
    if (banks.length > 0) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = VALIDATION_MESSAGES.bank;
      select.appendChild(placeholder);
    }
    banks.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.label;
      select.appendChild(opt);
    });
    if (banks.length === 0) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Нет доступных банков";
      empty.disabled = true;
      select.appendChild(empty);
    }
  } catch (_) {
    const err = document.createElement("option");
    err.value = "";
    err.textContent = "Ошибка загрузки";
    err.disabled = true;
    select.appendChild(err);
  }
}

const PRIMARY_ACCOUNTS_CURRENCIES = ["RUB", "USD", "EUR", "CNY"];

function fillPrimaryAccountsModal() {
  const container = qs("primaryAccountsFields");
  if (!container) return;
  container.innerHTML = "";
  let hasAny = false;
  PRIMARY_ACCOUNTS_CURRENCIES.forEach((currency) => {
    const accounts = state.accounts.filter(
      (a) => a.currency === currency && a.account_type === "DEBIT" && a.is_active !== false
    );
    if (accounts.length === 0) return;
    hasAny = true;
    const label = document.createElement("label");
    label.innerHTML = `<span>${currency}</span>`;
    const select = document.createElement("select");
    select.dataset.currency = currency;
    select.required = true;
    accounts.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = String(a.id);
      opt.textContent = maskAccount(a.account_number);
      if (a.is_primary) opt.selected = true;
      select.appendChild(opt);
    });
    container.appendChild(label);
    container.appendChild(select);
  });
  if (!hasAny) {
    const msg = document.createElement("p");
    msg.className = "modal-text small";
    msg.textContent = "Нет активных счетов для настройки.";
    container.appendChild(msg);
  }
}

function fillHomeTransferToSelect() {
  const toSelect = qs("homeTransferTo");
  const fromSelect = qs("homeTransferFrom");
  const hintEl = qs("homeTransferToHint");
  const submitBtn = qs("homeTransferForm")?.querySelector('button[type="submit"]');
  if (!toSelect || !fromSelect) return;
  toSelect.innerHTML = "";
  toSelect.required = true;
  if (hintEl) hintEl.hidden = true;
  if (submitBtn) submitBtn.disabled = false;

  const fromId = fromSelect.value;
  if (!fromId || !state.accounts.length) return;
  const fromAcc = state.accounts.find((a) => String(a.id) === fromId);
  if (!fromAcc) return;
  const fromCurrency = fromAcc.currency;
  const options = state.accounts
    .filter((a) => a.account_type === "DEBIT" && a.currency === fromCurrency && String(a.id) !== fromId)
    .map((a) => ({ id: a.id, label: `${a.currency} · ${maskAccount(a.account_number)}` }));
  if (options.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Нет другого счёта в этой валюте";
    placeholder.disabled = true;
    toSelect.appendChild(placeholder);
    toSelect.required = false;
    if (hintEl) hintEl.hidden = false;
    if (submitBtn) submitBtn.disabled = true;
    return;
  }
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = String(opt.id);
    option.textContent = opt.label;
    toSelect.appendChild(option);
  });
}

function fillExchangeToSelect() {
  const toSelect = qs("homeExchangeTo");
  const fromSelect = qs("homeExchangeFrom");
  if (!toSelect || !fromSelect) return;
  toSelect.innerHTML = "";
  const fromId = fromSelect.value;
  if (!fromId || !state.accounts.length) return;
  const fromAcc = state.accounts.find((a) => String(a.id) === fromId);
  if (!fromAcc) return;
  const fromCurrency = fromAcc.currency;
  const options = state.accounts
    .filter((a) => a.account_type === "DEBIT" && a.currency !== fromCurrency)
    .map((a) => ({ id: a.id, label: `${a.currency} · ${maskAccount(a.account_number)}` }));
  if (options.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Нет счёта в другой валюте";
    placeholder.disabled = true;
    toSelect.appendChild(placeholder);
    return;
  }
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = String(opt.id);
    option.textContent = opt.label;
    toSelect.appendChild(option);
  });
}

function renderRules() {
  // Правила лимитов визуализируются через прогресс-бары в модалках переводов.
  // Специального отдельного блока сейчас нет.
}

/** Фиксированные курсы (запасной вариант при недоступности API) */
const FALLBACK_RATES = { RUB: "1", USD: "95", EUR: "105", CNY: "13.5" };

function renderExchangeRates() {
  const el = qs("exchangeRatesBox");
  if (!el) return;
  const data = state.exchangeRates || { base: "RUB", toRub: FALLBACK_RATES };
  const rates = data.toRub && typeof data.toRub === "object" ? data.toRub : FALLBACK_RATES;
  const base = data.base || "RUB";

  const lines = Object.entries(rates)
    .filter(([code]) => code !== base)
    .map(
      ([code, rate]) =>
        `<div class="exchange-rate-row"><span class="exchange-rate-pair">1 ${code}</span><span class="exchange-rate-arrow">=</span><span class="exchange-rate-value">${Number(rate).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${base}</span></div>`
    )
    .join("");

  el.innerHTML = `<div class="exchange-rates-title">Курс валют</div><div class="exchange-rates-list">${lines}</div>`;
}

function renderSettings() {
  const el = qs("settingsBox");
  if (!el) return;
  if (!state.settings) {
    el.textContent = "Настройки пока недоступны.";
    return;
  }
  el.innerHTML = `
    <strong>Настройки</strong><br />
    Theme: ${state.settings.theme}<br />
    Language: ${state.settings.language}<br />
    Notifications: ${state.settings.notificationsEnabled ? "ON" : "OFF"}
  `;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderTransactions() {
  const body = qs("transactionsBody");
  if (!body) return;
  body.innerHTML = "";
  const list = state.transactions;

  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Операций пока нет.</td></tr>';
    return;
  }

  list.forEach((tx) => {
    const meta = getTransactionMeta(tx);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span class="tx-icon ${meta.iconClass}">${meta.icon}</span>
        <span class="tx-type-label">${tx.type}</span>
      </td>
      <td class="${meta.amountClass}">${meta.signedAmount}</td>
      <td>${getTxMoney(tx).currency}</td>
      <td>${tx.status}</td>
      <td>${tx.description || "-"}</td>
      <td>${new Date(tx.created_at).toLocaleString("ru-RU")}</td>
    `;
    body.appendChild(tr);
  });
}

function renderRecentTransactionsHome() {
  const container = qs("recentTransactions");
  if (!container) return;
  container.innerHTML = "";

  const list = state.transactions.slice(0, recentLimit);
  if (!list.length) {
    container.innerHTML = '<p class="empty">Операций пока нет.</p>';
  } else {
    list.forEach((tx) => {
      const meta = getTransactionMeta(tx);
      const row = document.createElement("div");
      row.className = "recent-item";
      row.dataset.txId = String(tx.id);
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Операция ${tx.type}, ${meta.signedAmount}. Нажмите для просмотра деталей`);
      const title = getTransactionTitle(tx, meta);
      const typeLabel = getTransactionTypeLabel(tx, meta);
      const dt = new Date(tx.created_at);
      const dateStr = dt.toLocaleDateString("ru-RU");
      const timeStr = dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const dateTime = `${dateStr} ${timeStr}`;
      row.innerHTML = `
        <div class="recent-item-icon">
          <span class="tx-icon ${meta.iconClass}">${meta.icon}</span>
        </div>
        <div class="recent-main">
          <div class="recent-main-header">
            <strong>${escapeHtml(title)}</strong>
          </div>
          <span class="recent-type-label">${dateTime} · ${escapeHtml(typeLabel)}</span>
        </div>
        <div class="recent-amount ${meta.amountClass}">${meta.signedAmount}</div>
      `;
      container.appendChild(row);
    });
  }

  const btn = qs("showMoreTxBtn");
  if (!btn) return;
  btn.textContent = "Показать ещё";
}

let selectedTransactionForDetail = null;

function openTransactionDetailModal(tx) {
  selectedTransactionForDetail = tx;
  const modal = qs("transactionDetailModal");
  const container = qs("transactionDetailContent");
  if (!modal || !container) return;
  const fields = getTransactionDetailFields(tx);
  container.innerHTML = fields
    .map(
      (f) => `
    <div class="transaction-detail-row">
      <span class="transaction-detail-label">${escapeHtml(f.label)}</span>
      <span class="transaction-detail-value ${f.amountClass || ""}">${escapeHtml(f.value)}</span>
    </div>`
    )
    .join("");
  modal.hidden = false;
  modal.classList.add("show");
}

function hideTransactionDetailModal() {
  const modal = qs("transactionDetailModal");
  if (modal) {
    modal.hidden = true;
    modal.classList.remove("show");
  }
  selectedTransactionForDetail = null;
}

async function downloadReceipt(tx) {
  const dateStr = new Date(tx.created_at).toLocaleDateString("ru-RU");
  const filename = `chek-operacii-${tx.id}-${dateStr.replace(/\./g, "-")}.html`;
  try {
    const res = await fetch(`${API_BASE}/transactions/${tx.id}/receipt`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (res.ok) {
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
  } catch (_) {
    // fallback to client-built receipt
  }
  const fields = getTransactionDetailFields(tx);
  const rowsHtml = fields
    .map(
      (f) =>
        `<div class="row"><span class="label">${escapeHtml(f.label)}</span><br><span class="value ${f.amountClass || ""}">${escapeHtml(f.value)}</span></div>`
    )
    .join("\n  ");
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Чек операции №${tx.id}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; padding: 24px; max-width: 400px; margin: 0 auto; }
    h1 { font-size: 18px; margin: 0 0 20px; }
    .row { margin-bottom: 12px; }
    .label { font-size: 12px; color: #666; }
    .value { font-size: 15px; font-weight: 500; }
    .amount { font-size: 20px; font-weight: 600; margin-top: 16px; }
    .footer { margin-top: 24px; font-size: 11px; color: #888; }
  </style>
</head>
<body>
  <h1>ShlapaBank — Чек операции</h1>
  ${rowsHtml}
  <div class="footer">Операция №${tx.id} · ${tx.status}</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fillPaymentLookups() {
  const operatorSelect = qs("mobileOperator");
  if (operatorSelect) {
    operatorSelect.innerHTML = "";
    state.operators.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      operatorSelect.appendChild(option);
    });
  }

  const providerSelect = qs("vendorProvider");
  if (providerSelect) {
    providerSelect.innerHTML = "";
    state.providers.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = `${item.name} (${item.accountLength})`;
      option.dataset.accountLength = String(item.accountLength);
      providerSelect.appendChild(option);
    });
  }
}

async function loadProfile() {
  const data = await api("/profile");
  state.profile = data;
  renderProfile();
}

async function loadAccounts() {
  try {
    const data = await api("/accounts");
    if (Array.isArray(data)) {
      state.accounts = data;
      renderBalances();
      renderAccounts();
      fillAccountSelects();
    }
  } catch (_) {
    // не перезаписываем state.accounts при ошибке — данные на экране остаются
  }
}

async function loadTransfersInfo() {
  state.transfersInfo = null;
  renderRules();
}

async function loadTransfersDailyUsage() {
  try {
    const data = await api("/transfers/daily-usage");
    state.transfersInfo = data;
  } catch (_) {
    state.transfersInfo = null;
  }
}

async function loadTransactions() {
  const data = await api("/transactions");
  state.transactions = data;
  renderTransactions();
  recentLimit = 5;
  renderRecentTransactionsHome();
}

async function loadPaymentsLookups() {
  // Заглушка: справочники платежей пока не используются на UI
  state.operators = [];
  state.providers = [];
}

async function loadExchangeRates() {
  try {
    const data = await api("/transfers/rates");
    state.exchangeRates = data;
  } catch (_) {
    state.exchangeRates = null;
  }
  renderExchangeRates();
}

function loadSettings() {
  state.settings = DEFAULT_SETTINGS;
  renderSettings();
}

async function loadData() {
  const results = await Promise.allSettled([
    loadProfile(),
    loadAccounts(),
    loadTransfersInfo(),
    loadTransactions(),
    loadPaymentsLookups(),
    loadExchangeRates(),
    loadSettings(),
  ]);

  const hasError = results.some((r) => r.status === "rejected");
  if (hasError) {
    showToast("Некоторые данные не удалось загрузить. Проверьте сервер.", true);
  }
}

function wireTabs() {
  const tabs = document.querySelectorAll("[data-op-target]");
  const views = document.querySelectorAll("[data-op-view]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.opTarget;
      tabs.forEach((x) => x.classList.remove("active"));
      tab.classList.add("active");
      views.forEach((view) => view.classList.toggle("op-view-active", view.dataset.opView === target));
    });
  });
}

const PAY_TARGET_TO_VIEW = {
  mobile: "mobile",
  internet: "vendor",
  utilities: "vendor",
  education: "vendor",
  charity: "vendor",
};

/** Поставщики по категориям (только для vendor): Интернет/ТВ, ЖКХ, Образование, Благотворительность */
const PROVIDERS_BY_CATEGORY = {
  internet: ["RostelCom+", "TV360", "FiberNet"],
  utilities: ["ZhKH-Service", "UO-Gorod", "DomComfort", "GasEnergy", "CityWater"],
  education: ["UniEdu", "EduCenter+"],
  charity: ["GoodHands", "KindKids"],
};

const VENDOR_HINTS_BY_CATEGORY = {
  internet: "Укажите лицевой счёт по договору (12–15 цифр в зависимости от поставщика).",
  utilities: "Лицевой счёт из квитанции ЖКХ (18–22 цифры).",
  education: "Номер договора на обучение (16 цифр).",
  charity: "Код получателя помощи (10 цифр).",
};

/** Шаблон подсказки: {prefix} — префикс поставщика, {length} — длина номера, {lengthWord} — «цифр»/«цифры»/«цифра». */
const VENDOR_HINT_TEMPLATE_WITH_PREFIX = {
  internet: "Лицевой счёт должен начинаться с {prefix}. Укажите лицевой счёт по договору ({length} {lengthWord}).",
  utilities: "Лицевой счёт должен начинаться с {prefix}. Лицевой счёт из квитанции ЖКХ ({length} {lengthWord}).",
  education:
    "Номер договора обязательно должен начинаться с {prefix}.\nНомер договора на обучение ({length} {lengthWord}).",
  charity: "Код получателя должен начинаться с {prefix}. Код получателя помощи ({length} {lengthWord}).",
};

function lengthWordRu(n) {
  const last = n % 10;
  const last2 = n % 100;
  if (last2 >= 11 && last2 <= 14) return "цифр";
  if (last === 1) return "цифра";
  if (last >= 2 && last <= 4) return "цифры";
  return "цифр";
}

const VENDOR_ACCOUNT_LABEL_BY_CATEGORY = {
  internet: "Лицевой счёт",
  utilities: "Лицевой счёт",
  education: "Номер договора",
  charity: "Код получателя",
};

const PROVIDER_PREFIX_RULES = {
  "RostelCom+": { prefix: "RC" },
  TV360: { prefix: "TV" },
  FiberNet: { prefix: "FN" },
  "ZhKH-Service": { prefix: "UO" },
  "UO-Gorod": { prefix: "UO" },
  DomComfort: { prefix: "DC" },
  GasEnergy: { prefix: "GE" },
  CityWater: { prefix: "CW" },
  UniEdu: { prefix: "EDU" },
  "EduCenter+": { prefix: "EDC" },
  GoodHands: { prefix: "GH" },
  KindKids: { prefix: "KK" },
};

/** Обновляет подсказку под полем «Лицевой счёт» в зависимости от выбранного поставщика (префикс и длина номера). */
function updateVendorHintFromProvider(category) {
  const hintEl = qs("vendorHint");
  const providerSelect = qs("vendorProvider");
  if (!hintEl || !providerSelect) return;
  const opt = providerSelect.options[providerSelect.selectedIndex];
  const providerName = opt ? opt.value : "";
  const prefixRule = providerName ? PROVIDER_PREFIX_RULES[providerName] : null;
  const prefix = prefixRule && prefixRule.prefix ? prefixRule.prefix : "";
  const lengthRaw = opt && opt.dataset.accountLength ? parseInt(opt.dataset.accountLength, 10) : 0;
  const length = isNaN(lengthRaw) || lengthRaw <= 0 ? "" : String(lengthRaw);
  const lengthWord = length ? lengthWordRu(lengthRaw) : "цифр";
  const template = category && VENDOR_HINT_TEMPLATE_WITH_PREFIX[category];
  if (template && prefix && length) {
    hintEl.textContent = template
      .replace("{prefix}", prefix)
      .replace(/\{length\}/g, length)
      .replace("{lengthWord}", lengthWord);
  } else if (template && prefix) {
    hintEl.textContent = template.replace("{prefix}", prefix).replace(/\{length\}/g, "—").replace("{lengthWord}", "цифр");
  } else {
    hintEl.textContent = VENDOR_HINTS_BY_CATEGORY[category] || "";
  }
}

function fillVendorProvidersByCategory(category) {
  const providerSelect = qs("vendorProvider");
  const hintEl = qs("vendorHint");
  const labelEl = qs("vendorAccountNumberLabel");
  const inputEl = qs("vendorAccountNumber");
  if (!providerSelect || !state.providers) return;

  const names = PROVIDERS_BY_CATEGORY[category] || null;
  const list = names
    ? state.providers.filter((p) => names.includes(p.name))
    : state.providers.slice();

  providerSelect.innerHTML = "";
  list.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = `${item.name} (${item.accountLength})`;
    option.dataset.accountLength = String(item.accountLength);
    providerSelect.appendChild(option);
  });

  updateVendorHintFromProvider(category);
  if (labelEl) {
    labelEl.textContent = VENDOR_ACCOUNT_LABEL_BY_CATEGORY[category] || "Лицевой счёт";
  }
  if (inputEl) {
    const sel = qs("vendorProvider");
    const opt = sel && sel.options[sel.selectedIndex];
    const len = opt && opt.dataset.accountLength ? Math.min(22, parseInt(opt.dataset.accountLength, 10)) : 22;
    inputEl.maxLength = isNaN(len) ? 22 : len;
    inputEl.placeholder = len ? `${len} символов` : "";
    const providerName = opt ? opt.value : "";
    const prefixRule = providerName ? PROVIDER_PREFIX_RULES[providerName] : null;
    inputEl.value = prefixRule && prefixRule.prefix ? prefixRule.prefix : "";
    setAmountError("vendorAccountNumber", "");
  }
}

function wirePaymentCategories() {
  const buttons = document.querySelectorAll(".payments-category-btn[data-pay-target]");
  const views = document.querySelectorAll(".payments-view[data-pay-view]");
buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.payTarget;
        const viewId = PAY_TARGET_TO_VIEW[target] || "mobile";
        state.currentPaymentCategory = target;
        buttons.forEach((b) => b.classList.toggle("payments-category-active", b.dataset.payTarget === target));
        views.forEach((v) => v.classList.toggle("payments-view-active", v.dataset.payView === viewId));
        if (viewId === "vendor") {
          fillVendorProvidersByCategory(target);
        } else if (viewId === "mobile") {
          const phoneInput = qs("mobilePhone");
          if (phoneInput && (!phoneInput.value || getRawPhone(phoneInput.value).length < 12))
            phoneInput.value = "+7";
        }
        if (window.__updatePaymentsLimitBars) window.__updatePaymentsLimitBars();
      });
    });
  if (state.currentPaymentCategory && PAY_TARGET_TO_VIEW[state.currentPaymentCategory] === "vendor") {
    fillVendorProvidersByCategory(state.currentPaymentCategory);
  }
  const mobileView = document.querySelector(".payments-view[data-pay-view='mobile'].payments-view-active");
  if (mobileView) {
    const phoneInput = qs("mobilePhone");
    if (phoneInput && !phoneInput.value) phoneInput.value = "+7";
  }
}

const VALID_PAGE_IDS = ["home", "payments", "chat", "more"];
const PAGE_TO_PATH = {
  home: "/dashboard",
  payments: "/payments",
  chat: "/chat",
  more: "/profile",
};
const PATH_TO_PAGE = {
  "/": "home",
  "/dashboard": "home",
  "/payments": "payments",
  "/chat": "chat",
  "/profile": "more",
};

function getPageFromPath() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  return PATH_TO_PAGE[path] || "home";
}

function wirePages() {
  const pageButtons = document.querySelectorAll("[data-page-target]");
  const views = document.querySelectorAll("[data-page-view]");

  const applyPage = (target, skipPushState = false) => {
    const normalized = (target || "home").toLowerCase();
    const pageId = VALID_PAGE_IDS.includes(normalized) ? normalized : "home";
    localStorage.setItem("sb_last_page", pageId);

    pageButtons.forEach((btn) =>
      btn.classList.toggle("topnav-tab-active", btn.dataset.pageTarget === pageId)
    );
    const bottomButtons = document.querySelectorAll(".nav-item");
    bottomButtons.forEach((btn) =>
      btn.classList.toggle("nav-item-active", btn.dataset.pageTarget === pageId)
    );

    let activated = false;
    views.forEach((view) => {
      const isActive = view.dataset.pageView === pageId;
      view.classList.toggle("page-view-active", isActive);
      if (isActive) activated = true;
    });

    if (pageId === "payments") {
      updateAmountHint("mobileAmount", AMOUNT_CONFIGS.mobileAmount);
      updateAmountHint("vendorAmount", AMOUNT_CONFIGS.vendorAmount);
      if (window.__updatePaymentsLimitBars) window.__updatePaymentsLimitBars();
      loadTransfersDailyUsage().then(() => {
        if (window.__updatePaymentsLimitBars) window.__updatePaymentsLimitBars();
      });
    }

    if (!activated) {
      views.forEach((view) =>
        view.classList.toggle("page-view-active", view.dataset.pageView === "home")
      );
      pageButtons.forEach((btn) =>
        btn.classList.toggle("topnav-tab-active", btn.dataset.pageTarget === "home")
      );
      localStorage.setItem("sb_last_page", "home");
    }

    if (!skipPushState && PAGE_TO_PATH[pageId]) {
      const path = PAGE_TO_PATH[pageId];
      if (window.location.pathname !== path) {
        window.history.pushState({ page: pageId }, "", path);
      }
    }

  };

  window.__applyPage = applyPage;
  pageButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyPage(btn.dataset.pageTarget));
  });

  const bottomButtons = document.querySelectorAll(".nav-item");
  bottomButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyPage(btn.dataset.pageTarget));
  });

  const pathPage = getPageFromPath();
  if (pathPage === "home" || VALID_PAGE_IDS.includes(pathPage)) {
    applyPage(pathPage, true);
  } else {
    applyPage("home", true);
  }

  window.addEventListener("popstate", (e) => {
    const page = e.state?.page || getPageFromPath();
    applyPage(page, true);
  });
}

async function loadData() {
  const results = await Promise.allSettled([
    api("/profile"),
    api("/accounts"),
    api("/transactions"),
    api("/payments/mobile/operators"),
    api("/payments/vendor/providers"),
    api("/transfers/rates"),
  ]);

  const hasAuthError = results.some(
    (r) => r.status === "rejected" && (r.reason?.code === "invalid_token" || r.reason?.status === 401)
  );
  if (hasAuthError) {
    return;
  }

  // Если профиль не загрузился — пробрасываем ошибку для retry
  if (results[0].status === "rejected") {
    throw results[0].reason || new Error("Не удалось загрузить данные");
  }

  const map = (index, fallback) => (results[index].status === "fulfilled" ? results[index].value : fallback);
  state.profile = map(0, null);
  state.accounts = results[1].status === "fulfilled" && Array.isArray(results[1].value) ? results[1].value : (state.accounts ?? []);
  state.transactions = results[2].status === "fulfilled" && Array.isArray(results[2].value) ? results[2].value : (state.transactions ?? []);
  state.operators = map(3, { operators: [] }).operators || [];
  state.providers = map(4, { providers: [] }).providers || [];
  state.settings = DEFAULT_SETTINGS;
  state.exchangeRates = map(5, null);

  renderProfile();
  if (isUserBlocked() && typeof window.__applyPage === "function") window.__applyPage("more", true);
  renderBalances();
  renderAccounts();
  fillAccountSelects();
  renderRules();
  renderSettings();
  renderTransactions();
  recentLimit = 5;
  renderRecentTransactionsHome();
  fillPaymentLookups();
  renderExchangeRates();
}

function wireActions() {
  qs("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("sb_access_token");
    localStorage.removeItem("sb_role");
    window.location.href = "/login";
  });

  const superClearBtn = qs("superClearBtn");
  if (superClearBtn) {
    superClearBtn.addEventListener("click", async () => {
      try {
        await api("/helper/clear-browser", { method: "POST" });
      } catch (_) {
        /* при ошибке всё равно выполняем очистку */
      }
      localStorage.clear();
      sessionStorage.clear();
      showToast("Данные браузера очищены. Перезагрузка…");
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    });
  }

  const amountConfigs = AMOUNT_CONFIGS;

  const OUR_BANK_CODE = "shlapabank";
  function getAmountHintOpts(inputId) {
    if (inputId === "homeByAccountAmount" && state.byAccountIsExternal) {
      const input = qs("homeByAccountAmount");
      const val = input && parseFloat(String(input.value).replace(/\s/g, ""));
      const totalWithFee = Number.isFinite(val) && val > 0 ? Math.round(val * 1.05 * 100) / 100 : null;
      let suffix = " с учётом комиссии 5% за перевод";
      if (totalWithFee != null && totalWithFee > 0) {
        suffix += ". Будет списано: " + formatAmountLimit(totalWithFee) + " ₽";
      }
      return { amountHintMaxSuffix: suffix };
    }
    if (inputId === "homeByPhoneAmount" && state.byPhoneIsExternal) {
      const input = qs("homeByPhoneAmount");
      const val = input && parseFloat(String(input.value).replace(/\s/g, ""));
      const totalWithFee = Number.isFinite(val) && val > 0 ? Math.round(val * 1.02 * 100) / 100 : null;
      let suffix = " с учётом комиссии 2% за перевод";
      if (totalWithFee != null && totalWithFee > 0) {
        suffix += ". Будет списано: " + formatAmountLimit(totalWithFee) + " ₽";
      }
      return { amountHintMaxSuffix: suffix };
    }
    return {};
  }

  Object.entries(amountConfigs).forEach(([id, config]) => {
    const input = qs(id);
    if (!input) return;
    input.addEventListener("input", () => updateAmountHint(id, config, getAmountHintOpts(id)));
    input.addEventListener("blur", () => updateAmountHint(id, config, getAmountHintOpts(id)));
  });

  // Ограничение суммы и предупреждение при превышении лимита (перевод по телефону)
  const homeByAccountAmountInput = qs("homeByAccountAmount");
  if (homeByAccountAmountInput && amountConfigs.homeByAccountAmount?.max) {
    const maxAmount = amountConfigs.homeByAccountAmount.max;
    homeByAccountAmountInput.addEventListener("input", () => {
      const raw = homeByAccountAmountInput.value;
      if (!raw) return;
      const value = Number(raw);
      if (Number.isFinite(value) && value > maxAmount) {
        homeByAccountAmountInput.value = String(maxAmount);
        const unit = getUnitForAmountField("homeByAccountAmount");
        showToast(`Максимальная сумма перевода — ${formatAmountLimit(maxAmount)} ${unit}. Введённая сумма ограничена.`, true);
        updateAmountHint("homeByAccountAmount", amountConfigs.homeByAccountAmount, getAmountHintOpts("homeByAccountAmount"));
      }
    });
  }

  const homeByPhoneAmountInput = qs("homeByPhoneAmount");
  if (homeByPhoneAmountInput && amountConfigs.homeByPhoneAmount?.max) {
    const maxAmount = amountConfigs.homeByPhoneAmount.max;
    homeByPhoneAmountInput.addEventListener("input", () => {
      const raw = homeByPhoneAmountInput.value;
      if (!raw) return;
      const value = Number(raw);
      if (Number.isFinite(value) && value > maxAmount) {
        homeByPhoneAmountInput.value = String(maxAmount);
        const unit = getUnitForAmountField("homeByPhoneAmount");
        showToast(`Максимальная сумма перевода — ${formatAmountLimit(maxAmount)} ${unit}. Введённая сумма ограничена.`, true);
        updateAmountHint("homeByPhoneAmount", amountConfigs.homeByPhoneAmount, getAmountHintOpts("homeByPhoneAmount"));
      }
    });
  }

  const notificationsBtn = qs("notificationsBtn");
  const notificationsPanel = qs("notificationsPanel");
  if (notificationsBtn && notificationsPanel) {
    notificationsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notificationsPanel.hidden = !notificationsPanel.hidden;
    });
    document.addEventListener("click", (e) => {
      if (
        !notificationsBtn.contains(e.target) &&
        !notificationsPanel.contains(e.target)
      ) {
        notificationsPanel.hidden = true;
      }
    });
  }

  const avatar = qs("userAvatar");
  if (avatar) {
    avatar.addEventListener("click", () => {
      const target = "more";
      const fakeEventButton = document.querySelector(
        '.topnav-tab[data-page-target="more"]'
      );
      if (fakeEventButton) {
        fakeEventButton.click();
      }
    });
  }

  const moreBtn = qs("showMoreTxBtn");
  if (moreBtn) {
    moreBtn.addEventListener("click", () => {
      recentLimit += 10;
      renderRecentTransactionsHome();
    });
  }

  const recentContainer = qs("recentTransactions");
  if (recentContainer) {
    recentContainer.addEventListener("click", (e) => {
      const row = e.target.closest(".recent-item");
      if (!row?.dataset.txId) return;
      const tx = state.transactions.find((t) => String(t.id) === row.dataset.txId);
      if (tx) openTransactionDetailModal(tx);
    });
    recentContainer.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const row = e.target.closest(".recent-item");
      if (!row?.dataset.txId) return;
      e.preventDefault();
      const tx = state.transactions.find((t) => String(t.id) === row.dataset.txId);
      if (tx) openTransactionDetailModal(tx);
    });
  }

  const txDetailClose = qs("txDetailClose");
  if (txDetailClose) txDetailClose.addEventListener("click", hideTransactionDetailModal);
  const txDetailDownloadReceipt = qs("txDetailDownloadReceipt");
  if (txDetailDownloadReceipt) {
    txDetailDownloadReceipt.addEventListener("click", () => {
      if (selectedTransactionForDetail) downloadReceipt(selectedTransactionForDetail);
    });
  }

  const txDetailModal = qs("transactionDetailModal");
  if (txDetailModal) {
    txDetailModal.addEventListener("click", (e) => {
      if (e.target === txDetailModal) hideTransactionDetailModal();
    });
  }

  const goToPage = (target) => {
    const btn = document.querySelector(`.topnav-tab[data-page-target="${target}"]`);
    if (btn) {
      btn.click();
    }
  };

  const activateOpTab = (target) => {
    const tab = document.querySelector(`.op-tab[data-op-target="${target}"]`);
    if (tab) {
      tab.click();
    }
  };

  const homeTransferOwnBtn = qs("homeTransferOwnBtn");
  if (homeTransferOwnBtn) {
    homeTransferOwnBtn.addEventListener("click", async () => {
      const modal = qs("homeTransferModal");
      if (!modal) return;
      await loadTransfersDailyUsage();
      fillHomeTransferToSelect();
      modal.hidden = false;
      modal.classList.add("show");
      setTimeout(() => {
        updateAmountHint("homeTransferAmount", amountConfigs.homeTransferAmount);
      }, 0);
    });
  }

  const homeTransferByAccountBtn = qs("homeTransferByAccountBtn");
  if (homeTransferByAccountBtn) {
    homeTransferByAccountBtn.addEventListener("click", async () => {
      const modal = qs("homeByAccountModal");
      if (!modal) return;
      state.byAccountIsExternal = false;
      await loadTransfersDailyUsage();
      modal.hidden = false;
      modal.classList.add("show");
      setTimeout(() => {
        updateLimitProgressForSelect("homeByAccountFrom", "homeByAccountLimitLabel", "homeByAccountLimitFill");
        updateAmountHint("homeByAccountAmount", amountConfigs.homeByAccountAmount);
      }, 0);
    });
  }

  const homeTransferByPhoneBtn = qs("homeTransferByPhoneBtn");
  if (homeTransferByPhoneBtn) {
    homeTransferByPhoneBtn.addEventListener("click", async () => {
      const modal = qs("homeByPhoneModal");
      if (!modal) return;
      state.byPhoneIsExternal = false;
      await loadTransfersDailyUsage();
      fillHomeByPhoneBankSelect("");
      modal.hidden = false;
      modal.classList.add("show");
      setTimeout(() => {
        updateLimitProgressForSelect("homeByPhoneFrom", "homeByPhoneLimitLabel", "homeByPhoneLimitFill");
        updateHomeByPhoneAmountHint();
      }, 0);
      const phoneInput = qs("homeByPhoneNumber");
      if (phoneInput && !phoneInput.value) {
        phoneInput.value = "+7";
      }
    });
  }

  const homeExchangeBtn = qs("homeExchangeBtn");
  if (homeExchangeBtn) {
    homeExchangeBtn.addEventListener("click", async () => {
      const modal = qs("homeExchangeModal");
      if (!modal) return;

      try {
        if (!state.exchangeRates) {
          await loadExchangeRates();
        }
      } catch (error) {
        showToast(`Не удалось загрузить курс: ${error.message}`, true);
      }

      modal.hidden = false;
      modal.classList.add("show");
      updateLimitProgressForSelect("homeExchangeFrom", "homeExchangeLimitLabel", "homeExchangeLimitFill");
      updateExchangeRateInfo();
      updateAmountHint("homeExchangeAmount", amountConfigs.homeExchangeAmount);
    });
  }

  const homePayMobileBtn = qs("homePayMobileBtn");
  if (homePayMobileBtn) {
    homePayMobileBtn.addEventListener("click", () => {
      goToPage("payments");
      activateOpTab("mobile");
    });
  }

  const homePayVendorBtn = qs("homePayVendorBtn");
  if (homePayVendorBtn) {
    homePayVendorBtn.addEventListener("click", () => {
      goToPage("payments");
      activateOpTab("vendor");
    });
  }

  const profilePhoneInput = qs("phone");
  if (profilePhoneInput) {
    profilePhoneInput.addEventListener("input", () => applyPhoneMask(profilePhoneInput));
  }

  const transferPhoneInput = qs("homeByPhoneNumber");
  if (transferPhoneInput) {
    transferPhoneInput.addEventListener("input", () => {
      applyPhoneMask(transferPhoneInput);
      setAmountError("homeByPhoneNumber", "", { showToast: false });
      if (window._homeByPhoneBankDebounce) clearTimeout(window._homeByPhoneBankDebounce);
      window._homeByPhoneBankDebounce = setTimeout(async () => {
        await fillHomeByPhoneBankSelect(transferPhoneInput.value);
        const bankSelect = qs("homeByPhoneBank");
        if (bankSelect && bankSelect.value) {
          state.byPhoneIsExternal = bankSelect.value !== OUR_BANK_CODE;
          updateHomeByPhoneAmountHint();
        }
      }, 400);
    });
    transferPhoneInput.addEventListener("blur", () => fillHomeByPhoneBankSelect(transferPhoneInput.value));
  }

  const firstNameInput = qs("firstName");
  if (firstNameInput) {
    firstNameInput.addEventListener("input", () => stripEdgeSpacesInput(firstNameInput));
  }

  const lastNameInput = qs("lastName");
  if (lastNameInput) {
    lastNameInput.addEventListener("input", () => stripEdgeSpacesInput(lastNameInput));
  }

  const emailInput = qs("email");
  if (emailInput) {
    emailInput.addEventListener("input", () => stripAllSpacesInput(emailInput));
    emailInput.addEventListener("keydown", preventSpaceKey);
  }

  const newPasswordInput = qs("newPassword");
  const newPasswordErrorEl = qs("newPasswordError");
  if (newPasswordInput) {
    newPasswordInput.addEventListener("input", () => {
      stripAllSpacesInput(newPasswordInput);
      if (newPasswordErrorEl) newPasswordErrorEl.textContent = "";
    });
    newPasswordInput.addEventListener("keydown", preventSpaceKey);
  }

  const toggleNewPasswordBtn = qs("toggleNewPassword");
  if (toggleNewPasswordBtn && newPasswordInput) {
    toggleNewPasswordBtn.addEventListener("click", () => {
      const isPassword = newPasswordInput.type === "password";
      newPasswordInput.type = isPassword ? "text" : "password";
      toggleNewPasswordBtn.setAttribute("aria-label", isPassword ? "Скрыть пароль" : "Показать пароль");
      toggleNewPasswordBtn.classList.toggle("eye-btn--visible", isPassword);
    });
  }

  const homeByAccountNumberInput = qs("homeByAccountNumber");
  if (homeByAccountNumberInput) {
    homeByAccountNumberInput.addEventListener("input", () => {
      const formatted = formatAccountNumberWithSpaces(homeByAccountNumberInput.value);
      if (homeByAccountNumberInput.value !== formatted) homeByAccountNumberInput.value = formatted;
      setAmountError("homeByAccountNumber", "", { showToast: false });
    });
    homeByAccountNumberInput.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData("text");
      homeByAccountNumberInput.value = formatAccountNumberWithSpaces(pasted);
    });
  }

  const vendorAccountNumberInput = qs("vendorAccountNumber");
  if (vendorAccountNumberInput) {
    vendorAccountNumberInput.addEventListener("input", () => {
      const max = vendorAccountNumberInput.maxLength || 22;
      const v = vendorAccountNumberInput.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, max);
      if (vendorAccountNumberInput.value !== v) vendorAccountNumberInput.value = v;
      validateVendorAccountNumber({ showToast: false });
    });
    vendorAccountNumberInput.addEventListener("keydown", preventSpaceKey);
  }

  const vendorProviderSelect = qs("vendorProvider");
  if (vendorProviderSelect && vendorAccountNumberInput) {
    vendorProviderSelect.addEventListener("change", () => {
      const opt = vendorProviderSelect.options[vendorProviderSelect.selectedIndex];
      const len = opt && opt.dataset.accountLength ? Math.min(22, parseInt(opt.dataset.accountLength, 10)) : 22;
      vendorAccountNumberInput.maxLength = isNaN(len) ? 22 : len;
      vendorAccountNumberInput.placeholder = len ? `${len} символов` : "";
      const providerName = opt ? opt.value : "";
      const prefixRule = providerName ? PROVIDER_PREFIX_RULES[providerName] : null;
      vendorAccountNumberInput.value = prefixRule && prefixRule.prefix ? prefixRule.prefix : "";
      setAmountError("vendorAccountNumber", "");
      validateVendorAccountNumber();
      updateVendorHintFromProvider(state.currentPaymentCategory || "internet");
    });
  }

  const mobilePhoneInput = qs("mobilePhone");
  if (mobilePhoneInput) {
    mobilePhoneInput.addEventListener("input", () => {
      applyPhoneMask(mobilePhoneInput);
      setAmountError("mobilePhone", "", { showToast: false });
    });
  }

  const mobileAmountInput = qs("mobileAmount");
  if (mobileAmountInput) {
    mobileAmountInput.addEventListener("input", () => {
      const v = mobileAmountInput.value.replace(/\D/g, "").slice(0, 5);
      if (mobileAmountInput.value !== v) mobileAmountInput.value = v;
    });
  }

  const vendorAmountInput = qs("vendorAmount");
  if (vendorAmountInput) {
    vendorAmountInput.addEventListener("input", () => {
      const v = vendorAmountInput.value.replace(/\D/g, "").slice(0, 6);
      if (vendorAmountInput.value !== v) vendorAmountInput.value = v;
    });
  }

  const otpInputs = document.querySelectorAll(".otp-input");
  otpInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
      if (input.value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
      const code = collectOtpCode();
      if (code.length === 4) {
        handleOtpSubmit();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    });
  });

  const openModal = qs("openAccountModal");
  const openOk = qs("openAccountOk");
  const openCancel = qs("openAccountCancel");
  const hideOpenModal = () => {
    if (!openModal) return;
    openModal.classList.remove("show");
    openModal.hidden = true;
  };

  qs("createAccountForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!openModal) return;
    openModal.hidden = false;
    openModal.classList.add("show");
  });

  if (openCancel) {
    openCancel.addEventListener("click", hideOpenModal);
  }

  if (openOk) {
    openOk.addEventListener("click", async () => {
      try {
        const typeSelect = qs("openAccountType");
        const currencySelect = qs("openAccountCurrency");
        const newAccount = await api("/accounts", {
          method: "POST",
          body: JSON.stringify({
            account_type: typeSelect ? typeSelect.value : "DEBIT",
            currency: currencySelect ? currencySelect.value : "RUB",
          }),
        });
        showToast("Счет Открыт");
        hideOpenModal();
        if (newAccount && typeof newAccount.id !== "undefined") {
          state.accounts = [...(state.accounts || []), newAccount];
          renderBalances();
          renderAccounts();
          fillAccountSelects();
        }
        await loadAccounts();
      } catch (error) {
        hideOpenModal();
        showToast(`Не удалось открыть счет: ${error.message}`, true);
      }
    });
  }

  const homeTransferModal = qs("homeTransferModal");
  const homeTransferForm = qs("homeTransferForm");
  const homeTransferCancel = qs("homeTransferCancel");
  const hideHomeTransferModal = () => {
    if (!homeTransferModal) return;
    homeTransferModal.classList.remove("show");
    homeTransferModal.hidden = true;
  };

  if (homeTransferCancel) {
    homeTransferCancel.addEventListener("click", hideHomeTransferModal);
  }

  if (homeTransferForm) {
    homeTransferForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fromId = qs("homeTransferFrom")?.value;
      const toId = qs("homeTransferTo")?.value;
      const submitBtn = homeTransferForm.querySelector('button[type="submit"]');
      if (submitBtn?.disabled || !toId) {
        showToast("Для перевода нужны минимум два счёта в одной валюте.", true);
        return;
      }
      if (fromId && toId && fromId === toId) {
        showToast("Нельзя переводить на тот же счёт.", true);
        return;
      }
      if (!validateAmountField("homeTransferAmount", amountConfigs.homeTransferAmount, { showEmptyError: true })) {
        return;
      }
      const payload = {
        from_account_id: Number(fromId),
        to_account_id: Number(toId),
        amount: qs("homeTransferAmount").value,
      };
      const submitBtnEl = homeTransferForm.querySelector('button[type="submit"]');
      if (submitBtnEl) submitBtnEl.disabled = true;
      try {
        await api("/transfers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("Перевод выполнен");
        homeTransferForm.reset();
        hideHomeTransferModal();
        await Promise.all([loadAccounts(), loadTransactions()]);
      } catch (err) {
        showToast(`Ошибка перевода: ${err.message || "неизвестная ошибка"}`, true);
      } finally {
        if (submitBtnEl) submitBtnEl.disabled = false;
      }
    });
  }

  const mobileForm = qs("mobileForm");
  if (mobileForm) {
    mobileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const accountId = Number(qs("mobileAccount").value);
      const operator = qs("mobileOperator").value.trim();
      const phone = getRawPhone(qs("mobilePhone").value);
      const amountRaw = qs("mobileAmount").value;
      const amount = Number(amountRaw);
      if (!phone || !/^\+7\d{10}$/.test(phone)) {
        setAmountError("mobilePhone", VALIDATION_MESSAGES.phone, { showToast: false });
        return;
      }
      setAmountError("mobilePhone", "", { showToast: false });
      if (!validateAmountField("mobileAmount", amountConfigs.mobileAmount, { showEmptyError: true })) {
        return;
      }
      openOtpModal({
        kind: "mobile",
        payload: { account_id: accountId, operator, phone, amount },
        async onSuccess() {
          mobileForm.reset();
          await Promise.all([loadAccounts(), loadTransactions()]);
        },
        errorPrefix: "Ошибка оплаты мобильной связи",
        successMessage: "Оплата мобильной связи выполнена",
      });
    });
  }

  const vendorForm = qs("vendorForm");
  if (vendorForm) {
    vendorForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const accountId = Number(qs("vendorAccount").value);
      const provider = qs("vendorProvider").value.trim();
      const accountNumber = qs("vendorAccountNumber").value.replace(/\s/g, "");
      const amountRaw = qs("vendorAmount").value;
      const amount = Number(amountRaw);
      const inlineOnly = { showToast: false };
      const vendorAccountInput = qs("vendorAccountNumber");
      if (!accountNumber) {
        setAmountError("vendorAccountNumber", VALIDATION_MESSAGES.personalAccountEmpty, inlineOnly);
        vendorAccountInput?.focus();
        return;
      }
      if (!validateVendorAccountNumber({ showEmptyError: true, showToast: false })) {
        return;
      }
      if (!validateAmountField("vendorAmount", amountConfigs.vendorAmount, { showEmptyError: true })) {
        return;
      }
      const category = state.currentPaymentCategory || "internet";
      openOtpModal({
        kind: ["internet", "utilities", "education", "charity"].includes(category) ? category : "vendor",
        payload: { account_id: accountId, provider, account_number: accountNumber, amount },
        async onSuccess() {
          vendorForm.reset();
          fillVendorProvidersByCategory(category);
          await Promise.all([loadAccounts(), loadTransactions()]);
        },
        errorPrefix: "Ошибка оплаты услуги",
        successMessage: "Оплата выполнена",
      });
    });
  }

  const updateLimitProgressForSelect = (selectId, labelId, fillId) => {
    const select = qs(selectId);
    const label = qs(labelId);
    const fill = qs(fillId);
    if (!select || !label || !fill) return;
    if (!state.transfersInfo?.limits?.perCurrency?.length) {
      label.textContent = "";
      fill.style.width = "0%";
      return;
    }

    const accountId = Number(select.value);
    const account = state.accounts?.find((a) => a.id === accountId);
    const currency = account?.currency || "RUB";
    const info = state.transfersInfo.limits.perCurrency.find((x) => x.currency === currency);

    const used = info ? Number(info.usedToday) : 0;
    const limit = info ? Number(info.dailyLimit) : 0;
    const remaining = info ? Number(info.remaining) : 0;

    if (!limit || limit <= 0) {
      label.textContent = "";
      fill.style.width = "0%";
      return;
    }

    const unit = CURRENCY_UNITS[currency] ?? "денег";
    const percent = Math.min(100, Math.max(0, (used / limit) * 100));
    fill.classList.remove("limit-warn", "limit-danger");
    const fmt = (v) =>
      Number.isFinite(Number(v))
        ? `${Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${unit}`
        : `— ${unit}`;
    if (percent >= 90) {
      fill.classList.add("limit-danger");
      label.textContent = `Почти весь лимит израсходован. Осталось: ${fmt(remaining)}`;
    } else if (percent >= 70) {
      fill.classList.add("limit-warn");
      label.textContent = `Лимит близок к исчерпанию. Осталось: ${fmt(remaining)}`;
    } else {
      label.textContent = `Дневной лимит по валюте ${currency}. Осталось: ${fmt(remaining)}`;
    }
    fill.style.width = `${percent}%`;
  };

  window.__updatePaymentsLimitBars = () => {};

  const homeTransferFromSelect = qs("homeTransferFrom");
  if (homeTransferFromSelect) {
    homeTransferFromSelect.addEventListener("change", () => {
      fillHomeTransferToSelect();
      updateAmountHint("homeTransferAmount", amountConfigs.homeTransferAmount);
    });
  }

  const homeByAccountModal = qs("homeByAccountModal");
  const homeByAccountForm = qs("homeByAccountForm");
  const homeByAccountCancel = qs("homeByAccountCancel");
  const hideHomeByAccountModal = () => {
    if (!homeByAccountModal) return;
    state.byAccountIsExternal = false;
    homeByAccountModal.classList.remove("show");
    homeByAccountModal.hidden = true;
  };

  if (homeByAccountCancel) {
    homeByAccountCancel.addEventListener("click", hideHomeByAccountModal);
  }

  function updateHomeByAccountAmountHint() {
    try {
      if (typeof state.byAccountIsExternal === "undefined") state.byAccountIsExternal = false;
      const opts = state.byAccountIsExternal
        ? { amountHintMaxSuffix: " с учётом комиссии 5% за перевод" }
        : {};
      updateAmountHint("homeByAccountAmount", amountConfigs.homeByAccountAmount, opts);
    } catch (e) {
      updateAmountHint("homeByAccountAmount", amountConfigs.homeByAccountAmount);
    }
  }

  let byAccountCheckTimeout = null;
  let byAccountLastDigits = "";
  if (homeByAccountNumberInput) {
    homeByAccountNumberInput.addEventListener("input", () => {
      const digits = getAccountNumberDigits(homeByAccountNumberInput.value);
      if (digits !== byAccountLastDigits) {
        byAccountLastDigits = digits;
        state.byAccountIsExternal = false;
      }
      updateHomeByAccountAmountHint();
      if (byAccountCheckTimeout) clearTimeout(byAccountCheckTimeout);
      if (digits.length === ACCOUNT_NUMBER_LENGTH) {
        byAccountCheckTimeout = setTimeout(async () => {
          byAccountCheckTimeout = null;
          try {
            const check = await api(
              `/transfers/by-account/check?target_account_number=${encodeURIComponent(digits)}`
            );
            state.byAccountIsExternal = !check.found;
            updateHomeByAccountAmountHint();
          } catch {
            state.byAccountIsExternal = false;
            updateHomeByAccountAmountHint();
          }
        }, 400);
      }
    });
  }

  if (homeByAccountForm) {
    homeByAccountForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const accountNumberEl = qs("homeByAccountNumber");
      const accountNumberDigits = accountNumberEl ? getAccountNumberDigits(accountNumberEl.value) : "";
      const len = accountNumberDigits.length;
      if (len !== ACCOUNT_NUMBER_LENGTH) {
        setAmountError("homeByAccountNumber", VALIDATION_MESSAGES.accountNumber, { showToast: false });
        accountNumberEl?.focus();
        return;
      }
      setAmountError("homeByAccountNumber", "", { showToast: false });
      if (
        !validateAmountField("homeByAccountAmount", amountConfigs.homeByAccountAmount, { showEmptyError: true })
      ) {
        return;
      }
      const payload = {
        from_account_id: Number(qs("homeByAccountFrom").value),
        target_account_number: accountNumberDigits,
        amount: qs("homeByAccountAmount").value,
      };
      const submitBtn = homeByAccountForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const check = await api(
          `/transfers/by-account/check?target_account_number=${encodeURIComponent(accountNumberDigits)}`
        );
        const isExternal = !check.found;
        openOtpModal({
          kind: isExternal ? "transfer-external-by-account" : "transfer-by-account",
          payload,
          async onSuccess() {
            homeByAccountForm.reset();
            state.byAccountIsExternal = false;
            hideHomeByAccountModal();
            await Promise.all([loadAccounts(), loadTransactions()]);
          },
          onClose: isExternal ? () => updateHomeByAccountAmountHint() : undefined,
          errorPrefix: isExternal ? "Ошибка перевода в другой банк" : "Ошибка перевода по номеру счёта",
          successMessage: isExternal ? "Перевод в другой банк выполнен" : "Перевод по номеру счёта выполнен",
        });
      } catch (err) {
        showToast(`Ошибка проверки счёта: ${err.message || "неизвестная ошибка"}`, true);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  const homeByAccountFromSelect = qs("homeByAccountFrom");
  if (homeByAccountFromSelect) {
    homeByAccountFromSelect.addEventListener("change", () => {
      updateLimitProgressForSelect("homeByAccountFrom", "homeByAccountLimitLabel", "homeByAccountLimitFill");
      updateHomeByAccountAmountHint();
    });
  }

  const homeByPhoneModal = qs("homeByPhoneModal");
  const homeByPhoneForm = qs("homeByPhoneForm");
  const homeByPhoneCancel = qs("homeByPhoneCancel");
  const hideHomeByPhoneModal = () => {
    if (!homeByPhoneModal) return;
    homeByPhoneModal.classList.remove("show");
    homeByPhoneModal.hidden = true;
  };

  if (homeByPhoneCancel) {
    homeByPhoneCancel.addEventListener("click", hideHomeByPhoneModal);
  }

  if (homeByPhoneForm) {
    homeByPhoneForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const phoneInput = qs("homeByPhoneNumber");
      const rawPhone = phoneInput ? getRawPhone(phoneInput.value) : "";
      if (!rawPhone || !/^\+7\d{10}$/.test(rawPhone)) {
        setAmountError("homeByPhoneNumber", VALIDATION_MESSAGES.phone, { showToast: false });
        return;
      }
      setAmountError("homeByPhoneNumber", "", { showToast: false });
      const bankSelect = qs("homeByPhoneBank");
      const recipientBankId = bankSelect ? bankSelect.value : "";
      if (!recipientBankId) {
        setAmountError("homeByPhoneBank", VALIDATION_MESSAGES.bank, { showToast: false });
        bankSelect?.focus();
        return;
      }
      setAmountError("homeByPhoneBank", "", { showToast: false });
      if (
        !validateAmountField("homeByPhoneAmount", amountConfigs.homeByPhoneAmount, {
          showEmptyError: true,
        })
      ) {
        return;
      }
      const payload = {
        from_account_id: Number(qs("homeByPhoneFrom").value),
        phone: rawPhone,
        amount: qs("homeByPhoneAmount").value,
        recipient_bank_id: recipientBankId,
      };
      const isExternalPhone = recipientBankId !== "shlapabank";
      openOtpModal({
        kind: "transfer-by-phone",
        payload,
        async onSuccess() {
          homeByPhoneForm.reset();
          hideHomeByPhoneModal();
          await Promise.all([loadAccounts(), loadTransactions()]);
        },
        onClose: isExternalPhone ? () => updateHomeByPhoneAmountHint() : undefined,
        errorPrefix: "Ошибка перевода по номеру телефона",
        successMessage: "Перевод по номеру телефона выполнен",
      });
    });
  }

  function updateHomeByPhoneAmountHint() {
    try {
      if (typeof state.byPhoneIsExternal === "undefined") state.byPhoneIsExternal = false;
      updateAmountHint("homeByPhoneAmount", amountConfigs.homeByPhoneAmount, getAmountHintOpts("homeByPhoneAmount"));
    } catch (e) {
      updateAmountHint("homeByPhoneAmount", amountConfigs.homeByPhoneAmount);
    }
  }

  const homeByPhoneBankSelect = qs("homeByPhoneBank");
  if (homeByPhoneBankSelect) {
    homeByPhoneBankSelect.addEventListener("change", () => {
      setAmountError("homeByPhoneBank", "", { showToast: false });
      state.byPhoneIsExternal = homeByPhoneBankSelect.value !== OUR_BANK_CODE;
      updateHomeByPhoneAmountHint();
    });
  }

  const homeByPhoneFromSelect = qs("homeByPhoneFrom");
  if (homeByPhoneFromSelect) {
    homeByPhoneFromSelect.addEventListener("change", () => {
      updateLimitProgressForSelect("homeByPhoneFrom", "homeByPhoneLimitLabel", "homeByPhoneLimitFill");
      updateHomeByPhoneAmountHint();
    });
  }

  const homeExchangeModal = qs("homeExchangeModal");
  const homeExchangeForm = qs("homeExchangeForm");
  const homeExchangeCancel = qs("homeExchangeCancel");
  const homeExchangeRateInfo = qs("homeExchangeRateInfo");
  const homeExchangeRateWrap = qs("homeExchangeRateWrap");
  const hideHomeExchangeModal = () => {
    if (!homeExchangeModal) return;
    homeExchangeModal.classList.remove("show");
    homeExchangeModal.hidden = true;
  };

  if (homeExchangeCancel) {
    homeExchangeCancel.addEventListener("click", hideHomeExchangeModal);
  }

  const updateExchangeRateInfo = () => {
    if (!homeExchangeRateInfo || !state.exchangeRates) return;
    const fromSel = qs("homeExchangeFrom");
    const toSel = qs("homeExchangeTo");
    if (!fromSel || !toSel) return;

    const fromAcc = state.accounts.find((a) => a.id === Number(fromSel.value));
    const toAcc = state.accounts.find((a) => a.id === Number(toSel.value));
    if (!fromAcc || !toAcc) {
      if (homeExchangeRateWrap) homeExchangeRateWrap.hidden = true;
      homeExchangeRateInfo.textContent = "";
      return;
    }

    // Если валюты совпадают — курс не показываем (обмен не имеет смысла)
    if (fromAcc.currency === toAcc.currency) {
      if (homeExchangeRateWrap) homeExchangeRateWrap.hidden = true;
      homeExchangeRateInfo.textContent = "";
      return;
    }

    if (!state.exchangeRates.toRub) {
      if (homeExchangeRateWrap) homeExchangeRateWrap.hidden = true;
      homeExchangeRateInfo.textContent = "";
      return;
    }

    const base = state.exchangeRates.base || "RUB";
    const rates = state.exchangeRates.toRub;
    const fromRate = Number(rates[fromAcc.currency]) || 1;
    const toRate = Number(rates[toAcc.currency]) || 1;
    const fx = fromRate / toRate;

    const amountInput = qs("homeExchangeAmount");
    const rawAmount = amountInput ? Number(amountInput.value || 0) : 0;

    if (homeExchangeRateWrap) homeExchangeRateWrap.hidden = false;
    if (rawAmount > 0 && Number.isFinite(rawAmount)) {
      const targetAmount = rawAmount * fx;
      const formatted = targetAmount.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      homeExchangeRateInfo.innerHTML = `Курс: 1 ${fromAcc.currency} ≈ ${fx.toFixed(
        2
      )} ${toAcc.currency}<br />Вы получите ≈ ${formatted} ${toAcc.currency}`;
    } else {
      homeExchangeRateInfo.textContent = `Курс: 1 ${fromAcc.currency} ≈ ${fx.toFixed(
        2
      )} ${toAcc.currency}`;
    }
  };

  if (homeExchangeForm) {
    homeExchangeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
       if (
        !validateAmountField("homeExchangeAmount", amountConfigs.homeExchangeAmount, { showEmptyError: true })
      ) {
        return;
      }
      const fromId = Number(qs("homeExchangeFrom").value);
      const toId = Number(qs("homeExchangeTo").value);
      const amount = qs("homeExchangeAmount").value;

      openOtpModal({
        kind: "exchange",
        payload: {
          from_account_id: fromId,
          to_account_id: toId,
          amount,
        },
        async onSuccess() {
          homeExchangeForm.reset();
          hideHomeExchangeModal();
          await Promise.all([loadAccounts(), loadTransactions()]);
        },
        errorPrefix: "Ошибка обмена валюты",
        successMessage: "Обмен выполнен",
      });
    });

    const exchangeFrom = qs("homeExchangeFrom");
    const exchangeTo = qs("homeExchangeTo");
    if (exchangeFrom) {
      exchangeFrom.addEventListener("change", () => {
        fillExchangeToSelect();
        updateExchangeRateInfo();
        updateAmountHint("homeExchangeAmount", amountConfigs.homeExchangeAmount);
        updateLimitProgressForSelect("homeExchangeFrom", "homeExchangeLimitLabel", "homeExchangeLimitFill");
      });
    }
    if (exchangeTo) {
      exchangeTo.addEventListener("change", updateExchangeRateInfo);
    }
    const amountInput = qs("homeExchangeAmount");
    if (amountInput) {
      amountInput.addEventListener("input", updateExchangeRateInfo);
    }
  }

  const modal = qs("confirmCloseModal");
  const modalOk = qs("confirmCloseOk");
  const modalCancel = qs("confirmCloseCancel");
  const hideModal = () => {
    if (!modal) return;
    modal.classList.remove("show");
    modal.hidden = true;
    pendingCloseAccountId = null;
  };

  qs("accountsList").addEventListener("click", (event) => {
    const numberSpan = event.target.closest(".account-number-tap");
    if (numberSpan) {
      const item = numberSpan.closest(".account-item");
      if (!item) return;
      const isExpanded = item.dataset.expanded === "true";

      // Сбрасываем предыдущий таймер, если был
      if (item._collapseTimer) {
        clearTimeout(item._collapseTimer);
        item._collapseTimer = null;
      }

      const nextLabel = isExpanded ? item.dataset.maskedLabel : item.dataset.fullLabel;
      numberSpan.textContent = nextLabel || "";
      item.dataset.expanded = isExpanded ? "false" : "true";

      // Если только что раскрыли номер - ставим авто-скрытие через 5 секунд
      if (!isExpanded && item.dataset.fullLabel) {
        item._collapseTimer = setTimeout(() => {
          const span = item.querySelector(".account-number-tap");
          if (!span) return;
          span.textContent = item.dataset.maskedLabel || "";
          item.dataset.expanded = "false";
          item._collapseTimer = null;
        }, 5000);
      }
      return;
    }

    const button = event.target.closest("[data-close-id]");
    if (!button) return;
    pendingCloseAccountId = Number(button.dataset.closeId);
    if (modal) {
      modal.hidden = false;
      modal.classList.add("show");
    }
  });

  if (modalCancel) {
    modalCancel.addEventListener("click", hideModal);
  }

  if (modalOk) {
    modalOk.addEventListener("click", async () => {
      if (!pendingCloseAccountId) {
        hideModal();
        return;
      }
      try {
        await api(`/accounts/${pendingCloseAccountId}`, { method: "DELETE" });
        showToast("Счет Закрыт");
        hideModal();
        await loadAccounts();
      } catch (error) {
        hideModal();
        showToast(`Не удалось закрыть счет: ${error.message}`, true);
      }
    });
  }

  const cheatModal = qs("cheatModal");
  const cheatForm = qs("cheatForm");
  const cheatCancel = qs("cheatCancel");
  const cheatApply = qs("cheatApply");
  const cheatAction = qs("cheatAction");
  const cheatAmountLabel = qs("cheatAmountLabel");
  const cheatAmountInput = qs("cheatAmount");

  const hideCheatModal = () => {
    if (!cheatModal) return;
    cheatModal.classList.remove("show");
    cheatModal.hidden = true;
    if (cheatForm) {
      cheatForm.reset();
    }
  };

  const updateCheatAmountVisibility = () => {
    if (!cheatAmountLabel || !cheatAction) return;
    const needsAmount = cheatAction.value === "increase" || cheatAction.value === "decrease";
    cheatAmountLabel.style.display = needsAmount ? "grid" : "none";
  };

  const otpCancel = qs("otpCancel");
  if (otpCancel) {
    otpCancel.addEventListener("click", () => {
      hideOtpModal();
    });
  }

  const hatLogo = document.querySelector(".topbar-logo");
  if (hatLogo && cheatModal) {
    hatLogo.addEventListener("click", async () => {
      const isAdmin = state.profile?.role === "ADMIN";
      let accounts = state.accounts;
      if (isAdmin) {
        try {
          const data = await api("/helper/accounts");
          accounts = Array.isArray(data) ? data : [];
        } catch (_) {
          accounts = state.accounts;
        }
      }
      if (!accounts.length) {
        showToast(isAdmin ? "Нет счетов в системе" : "Сначала откройте хотя бы один счёт", true);
        return;
      }
      const accountSelect = qs("cheatAccountSelect");
      if (accountSelect) {
        accountSelect.innerHTML = "";
        accounts.forEach((a) => {
          const opt = document.createElement("option");
          opt.value = String(a.id);
          opt.textContent = a.owner_login ? `${a.owner_login} · ${a.currency} · *${String(a.account_number || "").slice(-4)}` : `${a.currency} · *${String(a.account_number || "").slice(-4)}`;
          accountSelect.appendChild(opt);
        });
      }
      const salaryOpt = cheatPurpose?.querySelector('option[value="salary"]');
      if (salaryOpt) salaryOpt.hidden = !isAdmin;
      cheatModal.hidden = false;
      cheatModal.classList.add("show");
      updateCheatAmountVisibility();
      updateCheatPurposeVisibility?.();
      if (cheatAmountInput) cheatAmountInput.value = "";
    });
  }

  if (cheatCancel) {
    cheatCancel.addEventListener("click", hideCheatModal);
  }

  const cheatPurpose = qs("cheatPurpose");
  const cheatPurposeLabel = qs("cheatPurposeLabel");

  const updateCheatPurposeVisibility = () => {
    const needsPurpose = cheatAction?.value === "increase";
    if (cheatPurposeLabel) cheatPurposeLabel.style.display = needsPurpose ? "grid" : "none";
  };

  if (cheatAction) {
    cheatAction.addEventListener("change", () => {
      updateCheatAmountVisibility();
      updateCheatPurposeVisibility?.();
    });
  }

  if (cheatApply) {
    cheatApply.addEventListener("click", async () => {
      const accountSelect = qs("cheatAccountSelect");
      if (!accountSelect || !accountSelect.value) {
        showToast("Выберите счёт", true);
        return;
      }
      const accountId = Number(accountSelect.value);
      const action = cheatAction ? cheatAction.value : "increase";
      const purpose = cheatPurpose?.value?.trim() || "";

      let amount = null;
      if (action === "increase" || action === "decrease") {
        amount = cheatAmountInput ? cheatAmountInput.value : "";
        if (!amount || Number(amount) <= 0) {
          showToast("Укажите положительную сумму", true);
          return;
        }
      }

      try {
        if (action === "increase") {
          let url = `/helper/accounts/${accountId}/increase?amount=${encodeURIComponent(amount)}`;
          if (purpose) url += `&purpose=${encodeURIComponent(purpose)}`;
          await api(url, { method: "POST" });
        } else if (action === "decrease") {
          await api(`/helper/accounts/${accountId}/decrease?amount=${encodeURIComponent(amount)}`, {
            method: "POST",
          });
        } else if (action === "zero") {
          await api(`/helper/accounts/${accountId}/zero`, { method: "POST" });
        }
        showToast("Баланс обновлён");
        hideCheatModal();
        await Promise.all([loadAccounts(), loadTransactions()]);
      } catch (error) {
        showToast(`Не удалось изменить баланс: ${error.message}`, true);
      }
    });
  }

  (function wireChat() {
    const chatMessages = qs("chatMessages");
    const chatMenuContainer = qs("chatMenuContainer");
    const chatInput = qs("chatInput");
    const chatSendBtn = qs("chatSendBtn");
    const chatAttachBtn = qs("chatAttachBtn");
    const chatFileInput = qs("chatFileInput");

    const CHAT_MAIN_MENU = [
      { id: "limits", label: "Лимиты и правила" },
      { id: "limits_left", label: "Сколько осталось по лимиту" },
      { id: "rates", label: "Курс валют" },
      { id: "document", label: "Отправить документ на проверку" },
    ];

    const CHAT_LIMITS_SUBMENU = [
      { id: "back", label: "← К меню", back: true },
      { id: "limits_once", label: "Разовые лимиты (переводы)" },
      { id: "limits_daily", label: "Дневной лимит" },
      { id: "limits_payments", label: "Лимиты по платежам" },
    ];

    function appendChatMessage(text, role, isFile = false) {
      if (!chatMessages) return;
      const div = document.createElement("div");
      div.className = "chat-msg " + role + (isFile ? " file" : "");
      div.setAttribute("role", "listitem");
      div.textContent = text;
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function renderChatMenu(items) {
      if (!chatMenuContainer) return;
      chatMenuContainer.innerHTML = "";
      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chat-option-btn" + (item.back ? " chat-option-btn-back" : "");
        btn.textContent = item.label;
        btn.dataset.chatId = item.id;
        chatMenuContainer.appendChild(btn);
      });
    }

    function showMainMenu() {
      renderChatMenu(CHAT_MAIN_MENU);
    }

    async function getReplyForOption(optionId) {
      if (optionId === "limits" || optionId === "limits_once") {
        return "Разовые лимиты по переводам: от 10 до 300 000 ₽ в рублёвом эквиваленте на одну операцию.";
      }
      if (optionId === "limits_daily") {
        return "Дневной лимит по переводам: не более 1 000 000 ₽ в рублёвом эквиваленте на все операции за день на 1 счёт.";
      }
      if (optionId === "limits_payments") {
        return "Платежи: от 100 до 500 000 ₽ (поставщики, ЖКХ, образование, благотворительность).\nМобильная связь: от 100 до 12 000 ₽.";
      }
      if (optionId === "limits_left") {
        try {
          await loadTransfersDailyUsage();
          const perCurrency = state.transfersInfo?.limits?.perCurrency || [];
          if (!perCurrency.length) {
            return "Загрузите данные о лимитах (перейдите в «Переводы» и откройте модалку перевода) или попробуйте позже.";
          }
          const units = { RUB: "₽", USD: "$", EUR: "€", CNY: "¥" };
          const lines = perCurrency.map((c) => {
            const rem = Number(c.remaining || 0);
            const limit = Number(c.dailyLimit || 0);
            const u = units[c.currency] ?? c.currency;
            return `${c.currency}: осталось ${rem.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${u} из ${limit.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${u}.`;
          });
          return "Остаток дневного лимита по валютам:\n\n" + lines.join("\n");
        } catch (_) {
          return "Не удалось загрузить данные. Попробуйте позже.";
        }
      }
      if (optionId === "rates") {
        try {
          if (!state.exchangeRates) await api("/transfers/rates").then((d) => (state.exchangeRates = d));
          const r = state.exchangeRates?.toRub || {};
          const parts = Object.entries(r).filter(([c]) => c !== "RUB").map(([c, v]) => `1 ${c} = ${Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`);
          return "Курсы к рублю:\n\n" + (parts.length ? parts.join("\n") : "Данные недоступны.");
        } catch (_) {
          return "Курсы валют временно недоступны. Попробуйте позже.";
        }
      }
      if (optionId === "document") {
        return "Нажмите кнопку со скрепкой 📎 рядом с полем ввода и выберите файл (PDF, изображение или текст). Я проверю документ и отвечу.";
      }
      if (optionId === "back") {
        return null;
      }
      return "Выберите один из пунктов меню ниже.";
    }

    function getBotReplyForText(userText, fileName) {
      const t = (userText || "").toLowerCase().trim();
      if (fileName || /документ|файл|отправлен|провер|загруж/.test(t)) {
        const replies = [
          "Всё отлично, документ принят. Реквизиты и сумма указаны верно.",
          "Документ получен. Проверьте реквизиты получателя и сумму — есть расхождения.",
        ];
        return replies[Math.floor(Math.random() * replies.length)];
      }
      return null;
    }

    function textToOptionId(text) {
      const t = (text || "").toLowerCase().trim();
      if (/осталось|сколько.*лимит|лимит.*осталось/.test(t)) return "limits_left";
      if (/курс|валюта|валют/.test(t)) return "rates";
      if (/лимит|правил/.test(t)) return "limits";
      if (/документ|проверк|файл/.test(t)) return "document";
      return null;
    }

    async function onMenuOptionClick(optionId) {
      if (optionId === "back") {
        showMainMenu();
        return;
      }
      if (optionId === "limits") {
        renderChatMenu(CHAT_LIMITS_SUBMENU);
        return;
      }
      const label = [...CHAT_MAIN_MENU, ...CHAT_LIMITS_SUBMENU].find((m) => m.id === optionId)?.label || optionId;
      appendChatMessage(label, "user");
      const reply = await getReplyForOption(optionId);
      if (reply) {
        setTimeout(() => {
          appendChatMessage(reply, "bot");
          showMainMenu();
        }, 300);
      } else {
        showMainMenu();
      }
    }

    function ensureChatInitialized() {
      if (!chatMessages || !chatMenuContainer) return;
      if (!chatMessages.children.length) {
        appendChatMessage("Здравствуйте! Выберите пункт меню или напишите сообщение.", "bot");
        showMainMenu();
      }
    }

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".chat-option-btn");
      if (!btn || !btn.dataset.chatId) return;
      onMenuOptionClick(btn.dataset.chatId);
    });

    async function sendMessage(text, fileName) {
      if (!text && !fileName) return;
      const displayText = fileName ? `Отправлен файл: ${fileName}` : text;
      appendChatMessage(displayText, "user", Boolean(fileName));
      if (chatInput) chatInput.value = "";
      const directReply = getBotReplyForText(text, fileName);
      if (directReply) {
        setTimeout(() => {
          appendChatMessage(directReply, "bot");
          showMainMenu();
        }, 400);
        return;
      }
      const optionId = textToOptionId(text);
      if (optionId) {
        const optionReply = await getReplyForOption(optionId);
        if (optionReply) {
          setTimeout(() => {
            appendChatMessage(optionReply, "bot");
            showMainMenu();
          }, 400);
          return;
        }
      }
      setTimeout(() => {
        appendChatMessage("Выберите, пожалуйста, один из пунктов ниже.", "bot");
        showMainMenu();
      }, 400);
    }

    const chatPage = document.querySelector('.page-view[data-page-view="chat"]');
    if (chatPage) {
      const observer = new MutationObserver(() => {
        if (chatPage.classList.contains("page-view-active")) ensureChatInitialized();
      });
      observer.observe(chatPage, { attributes: true, attributeFilter: ["class"] });
      if (chatPage.classList.contains("page-view-active")) ensureChatInitialized();
    }

    if (chatSendBtn && chatInput) {
      chatSendBtn.addEventListener("click", () => sendMessage(chatInput.value.trim(), null));
      chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage(chatInput.value.trim(), null);
        }
      });
    }
    if (chatAttachBtn && chatFileInput) {
      const allowedExtensions = /\.(pdf|png|jpe?g|gif|webp|txt|text)$/i;
      chatAttachBtn.addEventListener("click", () => chatFileInput.click());
      chatFileInput.addEventListener("change", () => {
        const file = chatFileInput.files && chatFileInput.files[0];
        if (file) {
          const hasValidExt = allowedExtensions.test(file.name || "");
          if (!hasValidExt) {
            showToast("Неизвестный формат. Допустимы: PDF, PNG, JPG, GIF, WEBP, TXT.", true);
            chatFileInput.value = "";
            return;
          }
          sendMessage(null, file.name || "файл");
          chatFileInput.value = "";
        }
      });
    }
  })();

  qs("accountsList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-close-id]");
    if (!button) return;
    pendingCloseAccountId = Number(button.dataset.closeId);
    const modal = qs("confirmCloseModal");
    if (modal) {
      modal.hidden = false;
      modal.classList.add("show");
    }
  });

  let pendingProfilePayload = null;
  const confirmCurrentPasswordModal = qs("confirmCurrentPasswordModal");
  const confirmCurrentPasswordInput = qs("confirmCurrentPasswordInput");
  const confirmCurrentPasswordError = qs("confirmCurrentPasswordError");
  const confirmCurrentPasswordCancel = qs("confirmCurrentPasswordCancel");
  const confirmCurrentPasswordOk = qs("confirmCurrentPasswordOk");

  const hideConfirmCurrentPasswordModal = () => {
    if (!confirmCurrentPasswordModal) return;
    confirmCurrentPasswordModal.classList.remove("show");
    confirmCurrentPasswordModal.hidden = true;
    pendingProfilePayload = null;
    if (confirmCurrentPasswordInput) confirmCurrentPasswordInput.value = "";
    if (confirmCurrentPasswordError) confirmCurrentPasswordError.textContent = "";
  };

  if (confirmCurrentPasswordInput) {
    confirmCurrentPasswordInput.addEventListener("input", () => stripAllSpacesInput(confirmCurrentPasswordInput));
    confirmCurrentPasswordInput.addEventListener("keydown", preventSpaceKey);
  }

  const toggleConfirmCurrentPasswordBtn = qs("toggleConfirmCurrentPassword");
  if (toggleConfirmCurrentPasswordBtn && confirmCurrentPasswordInput) {
    toggleConfirmCurrentPasswordBtn.addEventListener("click", () => {
      const isPassword = confirmCurrentPasswordInput.type === "password";
      confirmCurrentPasswordInput.type = isPassword ? "text" : "password";
      toggleConfirmCurrentPasswordBtn.setAttribute("aria-label", isPassword ? "Скрыть пароль" : "Показать пароль");
      toggleConfirmCurrentPasswordBtn.classList.toggle("eye-btn--visible", isPassword);
    });
  }

  qs("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const getTrimmed = (id) => {
      const el = qs(id);
      if (!el) return null;
      const v = el.value.trim();
      return v === "" ? null : v;
    };

    const firstName = getTrimmed("firstName");
    const lastName = getTrimmed("lastName");
    const namePattern = /^[A-Za-zА-Яа-яЁё]+$/;
    if (firstName && !namePattern.test(firstName)) {
      showToast("Имя может содержать только буквы (A–Z, А–Я).", true);
      return;
    }
    if (lastName && !namePattern.test(lastName)) {
      showToast("Фамилия может содержать только буквы (A–Z, А–Я).", true);
      return;
    }

    const payload = {
      first_name: firstName,
      last_name: lastName,
      phone: getRawPhone(getTrimmed("phone")) || undefined,
      email: getTrimmed("email"),
    };

    const newPasswordEl = qs("newPassword");
    const newPasswordValue = newPasswordEl ? newPasswordEl.value : "";
    if (newPasswordValue) {
      const login = state.profile ? state.profile.login : "";
      const passwordError = validateNewPassword(newPasswordValue, login);
      if (passwordError) {
        showToast(passwordError, true);
        newPasswordEl.focus();
        return;
      }
      payload.new_password = newPasswordValue;
    }
    if (newPasswordErrorEl) newPasswordErrorEl.textContent = "";

    if (payload.new_password) {
      pendingProfilePayload = payload;
      if (confirmCurrentPasswordError) confirmCurrentPasswordError.textContent = "";
      if (confirmCurrentPasswordModal) {
        confirmCurrentPasswordModal.hidden = false;
        confirmCurrentPasswordModal.classList.add("show");
        if (confirmCurrentPasswordInput) {
          confirmCurrentPasswordInput.value = "";
          confirmCurrentPasswordInput.focus();
        }
      }
      return;
    }

    try {
      await api("/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast("Профиль обновлен");
      await loadProfile();
    } catch (error) {
      showToast(`Ошибка обновления профиля: ${error.message}`, true);
    }
  });

  if (confirmCurrentPasswordCancel) {
    confirmCurrentPasswordCancel.addEventListener("click", hideConfirmCurrentPasswordModal);
  }

  if (confirmCurrentPasswordOk && confirmCurrentPasswordInput) {
    confirmCurrentPasswordOk.addEventListener("click", async () => {
      const currentPassword = confirmCurrentPasswordInput.value;
      if (confirmCurrentPasswordError) confirmCurrentPasswordError.textContent = "";
      if (!currentPassword) {
        showToast("Введите текущий пароль.", true);
        return;
      }
      if (!pendingProfilePayload) {
        hideConfirmCurrentPasswordModal();
        return;
      }
      const payload = { ...pendingProfilePayload, current_password: currentPassword };
      try {
        await api("/profile", {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        const newPwdEl = qs("newPassword");
        if (newPwdEl) newPwdEl.value = "";
        hideConfirmCurrentPasswordModal();
        showToast("Профиль обновлен");
        await loadProfile();
      } catch (error) {
        const isWrongCurrentPassword =
          error.code === "invalid_current_password" || error.status === 401;
        const msg = isWrongCurrentPassword
          ? "Неверный текущий пароль."
          : (error.message || "Не удалось выполнить запрос. Попробуйте позже.");
        showToast(msg, true);
      }
    });
  }

  if (confirmCurrentPasswordModal) {
    confirmCurrentPasswordModal.addEventListener("click", (e) => {
      if (e.target === confirmCurrentPasswordModal) hideConfirmCurrentPasswordModal();
    });
  }

  const primaryAccountsModal = qs("primaryAccountsModal");
  const primaryAccountsBtn = qs("primaryAccountsBtn");
  const primaryAccountsCancel = qs("primaryAccountsCancel");
  const primaryAccountsForm = qs("primaryAccountsForm");
  const hidePrimaryAccountsModal = () => {
    if (!primaryAccountsModal) return;
    primaryAccountsModal.classList.remove("show");
    primaryAccountsModal.hidden = true;
  };
  if (primaryAccountsBtn) {
    primaryAccountsBtn.addEventListener("click", () => {
      fillPrimaryAccountsModal();
      if (primaryAccountsModal) {
        primaryAccountsModal.hidden = false;
        primaryAccountsModal.classList.add("show");
      }
    });
  }
  if (primaryAccountsCancel) {
    primaryAccountsCancel.addEventListener("click", hidePrimaryAccountsModal);
  }
  if (primaryAccountsForm) {
    primaryAccountsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const container = qs("primaryAccountsFields");
      const selects = container ? container.querySelectorAll("select") : [];
      if (selects.length === 0) {
        showToast("Нет счетов для настройки", true);
        return;
      }
      const accountIds = [];
      for (const select of selects) {
        const accountId = select.value;
        if (accountId) accountIds.push(Number(accountId));
      }
      try {
        await api("/accounts/primary", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_ids: accountIds }),
        });
        showToast("Приоритетные счета сохранены");
        hidePrimaryAccountsModal();
        await loadAccounts();
      } catch (error) {
        showToast(`Не удалось сохранить: ${error.message}`, true);
      }
    });
  }
}

let reloadOnReturnTimer = null;
let lastLoadTime = 0;
let lastLoadSuccess = false;

function reloadDataOnReturn() {
  const token = localStorage.getItem("sb_access_token");
  if (!token) return;
  const now = Date.now();
  // Если последняя загрузка была успешной и недавно — не перегружаем (защита от спама)
  if (lastLoadSuccess && now - lastLoadTime < 5000) return;
  if (reloadOnReturnTimer) clearTimeout(reloadOnReturnTimer);
  reloadOnReturnTimer = setTimeout(async () => {
    reloadOnReturnTimer = null;
    let retries = 2;
    while (retries >= 0) {
      try {
        await loadData();
        lastLoadTime = Date.now();
        lastLoadSuccess = true;
        return;
      } catch (err) {
        if (err?.code === "invalid_token") return;
        retries--;
        if (retries >= 0) {
          await new Promise((r) => setTimeout(r, 1500));
        } else {
          showToast("Не удалось обновить данные. Нажмите F5 для обновления страницы.", true);
        }
      }
    }
  }, 300);
}

(async function init() {
  try {
    wireTabs();
    wirePages();
    wirePaymentCategories();
    wireActions();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reloadDataOnReturn();
    });
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) reloadDataOnReturn();
    });
    await loadData();
    lastLoadTime = Date.now();
    lastLoadSuccess = true;
    const shell = document.querySelector(".dashboard-shell");
    if (shell) {
      shell.classList.remove("shell-hidden");
    }
  } catch (error) {
    lastLoadSuccess = false;
    showToast(`Ошибка загрузки данных: ${error.message}. Нажмите F5 для обновления.`, true);
    const shell = document.querySelector(".dashboard-shell");
    if (shell) {
      shell.classList.remove("shell-hidden");
    }
  }
})();
