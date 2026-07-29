import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/shared/ui/Modal";
import { api } from "@/shared/api/client";
import { apiErrorMessage } from "@/shared/api/errors";
import { useAuthStore } from "@/shared/stores/auth";
import { resetUserCache } from "@/shared/lib/authCache";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CONFIRM_WORD = "УДАЛИТЬ";

/**
 * Self-destruct. Требует ввести «УДАЛИТЬ» капсом — защита от промаха.
 * После удаления юзер логаутится и попадает на /login.
 */
export function DeleteAccountModal({ open, onClose }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);

  const del = useMutation({
    mutationFn: async () => api.delete("/profile"),
    onSuccess: () => {
      logout();
      resetUserCache(qc);
      navigate("/login", { replace: true });
    },
    onError: (e: any) => setError(apiErrorMessage(e)),
  });

  const canDelete = text === CONFIRM_WORD;

  function reset() {
    setText("");
    setError(null);
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Удалить аккаунт"
      maxWidth={420}
      testId="delete-account-modal"
    >
      <div className="rounded-control bg-danger-soft border border-danger/30 px-3 py-2.5 mb-4 flex items-start gap-3">
        <i className="ti ti-alert-triangle text-danger text-xl mt-0.5" aria-hidden="true"></i>
        <div>
          <div className="text-[13px] font-medium text-danger">Действие необратимо</div>
          <div className="text-[11px] text-ink-secondary mt-0.5">
            Удаляются: профиль, все счета, карты, транзакции, контакты и настройки. После
            удаления войти под этим логином будет нельзя.
          </div>
        </div>
      </div>

      <div className="text-[12px] text-ink-secondary mb-2">
        Введите <span className="font-mono text-ink-primary">{CONFIRM_WORD}</span> капсом, чтобы
        подтвердить
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={CONFIRM_WORD}
        className="input font-mono uppercase tracking-widest text-center mb-4"
        autoComplete="off"
        autoFocus
        data-testid="delete-account-confirm-input"
      />

      {error && (
        <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="btn flex-1"
          onClick={() => {
            reset();
            onClose();
          }}
          data-testid="delete-account-cancel-btn"
        >
          Отмена
        </button>
        <button
          disabled={!canDelete || del.isPending}
          onClick={() => del.mutate()}
          className={`flex-[1.4] py-2.5 rounded-control font-medium transition ${
            canDelete && !del.isPending
              ? ""
              : "bg-fill-control text-ink-muted cursor-not-allowed border border-line-strong"
          }`}
          style={
            canDelete && !del.isPending
              ? {
                  background: "linear-gradient(180deg, #FF5A75 0%, #FF3A5C 100%)",
                  color: "#F5F7FF",
                  border: "none",
                }
              : undefined
          }
          data-testid="delete-account-confirm-btn"
        >
          {del.isPending ? "Удаляем…" : "Удалить навсегда"}
        </button>
      </div>
    </Modal>
  );
}
