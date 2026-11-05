import { PaymentTiles } from "./PaymentTiles";

/** «Платежи»: все операции плитками. */
export function PaymentsPage() {
  return (
    <main className="mx-auto flex max-w-page flex-col gap-5 px-4 py-7 sm:px-6" data-testid="payments">
      <h1 className="text-[26px] font-bold leading-[34px] tracking-[-0.3px]">Платежи и переводы</h1>
      <div className="max-w-[760px]">
        <PaymentTiles />
      </div>
    </main>
  );
}
