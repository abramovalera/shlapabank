import { Dropdown } from "@/shared/ui/Dropdown";

export interface CountryOption {
  code: string; // "+7"
  flag: string; // "🇷🇺"
  name: string; // "Россия"
  length: number; // сколько цифр после кода
  sbpSupported?: boolean; // поддерживается ли нашим СБП
}

export const COUNTRIES: CountryOption[] = [
  { code: "+7", flag: "🇷🇺", name: "Россия", length: 10, sbpSupported: true },
  { code: "+7", flag: "🇰🇿", name: "Казахстан", length: 10 },
  { code: "+375", flag: "🇧🇾", name: "Беларусь", length: 9 },
  { code: "+380", flag: "🇺🇦", name: "Украина", length: 9 },
  { code: "+995", flag: "🇬🇪", name: "Грузия", length: 9 },
  { code: "+996", flag: "🇰🇬", name: "Кыргызстан", length: 9 },
  { code: "+998", flag: "🇺🇿", name: "Узбекистан", length: 9 },
  { code: "+374", flag: "🇦🇲", name: "Армения", length: 8 },
  { code: "+373", flag: "🇲🇩", name: "Молдова", length: 8 },
  { code: "+994", flag: "🇦🇿", name: "Азербайджан", length: 9 },
];

interface Props {
  value: CountryOption;
  onChange: (c: CountryOption) => void;
}

export function CountryCodePicker({ value, onChange }: Props) {
  return (
    <Dropdown
      align="left"
      className="w-[104px] shrink-0"
      testId="country-picker"
      trigger={
        <div className="input h-[42px] flex items-center justify-between gap-1.5 cursor-pointer hover:border-line-strong transition">
          <span className="text-base leading-none">{value.flag}</span>
          <span className="font-mono text-[13px]">{value.code}</span>
          <i className="ti ti-chevron-down text-[13px] text-ink-muted" aria-hidden="true"></i>
        </div>
      }
    >
      {(close) => (
        <>
          {COUNTRIES.map((c, i) => {
            const selected = c.name === value.name;
            return (
              <button
                key={`${c.code}-${c.name}-${i}`}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(c);
                  close();
                }}
                data-testid={`country-${c.name}`}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition text-left ${
                  selected ? "bg-brand-soft text-accent" : "text-ink-primary hover:bg-fill-hover"
                }`}
              >
                <span className="text-base leading-none w-5">{c.flag}</span>
                <span className="font-mono text-[12px] text-ink-secondary w-11">{c.code}</span>
                <span className="flex-1">{c.name}</span>
                {!c.sbpSupported && (
                  <span className="text-[9px] text-ink-muted uppercase">без СБП</span>
                )}
                {selected && <i className="ti ti-check text-accent" aria-hidden="true"></i>}
              </button>
            );
          })}
        </>
      )}
    </Dropdown>
  );
}
