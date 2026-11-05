import { ButtonLink } from "../ui/Button";

export function NotFoundPage() {
  return (
    <main className="mx-auto flex max-w-page justify-center px-4 py-16 sm:px-6">
      <section
        data-testid="not-found"
        className="flex w-full max-w-[440px] flex-col items-center gap-3 rounded-dialog bg-white px-6 py-10 text-center"
      >
        <div className="text-[44px] font-bold leading-none tracking-[-1px] text-ink-faint">404</div>
        <h1 className="text-[22px] font-bold leading-[30px]">Страница не найдена</h1>
        <p className="text-ink-muted">Возможно, ссылка устарела или в адресе опечатка.</p>
        <ButtonLink to="/" className="mt-2" data-testid="not-found-home">
          На главную
        </ButtonLink>
      </section>
    </main>
  );
}
