"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

type PromptOptions = {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
};

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type DialogAPI = {
  prompt: (options: PromptOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

type ActiveDialog =
  | ({ kind: "prompt"; resolve: (value: string | null) => void } & PromptOptions)
  | ({ kind: "confirm"; resolve: (value: boolean) => void } & ConfirmOptions);

const DialogContext = createContext<DialogAPI | null>(null);

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setActive({ kind: "prompt", resolve, ...options });
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setActive({ kind: "confirm", resolve, ...options });
    });
  }, []);

  const api = useMemo(() => ({ prompt, confirm }), [prompt, confirm]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {active && (
        <DialogSurface
          key={active.title}
          active={active}
          onClosePrompt={(value) => {
            if (active.kind === "prompt") active.resolve(value);
            setActive(null);
          }}
          onCloseConfirm={(value) => {
            if (active.kind === "confirm") active.resolve(value);
            setActive(null);
          }}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useAppDialog(): DialogAPI {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    return {
      prompt: async (options) =>
        window.prompt(options.message ?? options.title, options.defaultValue ?? ""),
      confirm: async (options) =>
        window.confirm(options.message ?? options.title),
    };
  }
  return ctx;
}

function DialogSurface({
  active,
  onClosePrompt,
  onCloseConfirm,
}: {
  active: ActiveDialog;
  onClosePrompt: (value: string | null) => void;
  onCloseConfirm: (value: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const [value, setValue] = useState(
    active.kind === "prompt" ? (active.defaultValue ?? "") : ""
  );

  useEffect(() => {
    if (active.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [active.kind]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (active.kind === "prompt") onClosePrompt(null);
        else onCloseConfirm(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active.kind, onClosePrompt, onCloseConfirm]);

  return (
    <div className="app-dialog-overlay" role="presentation">
      <button
        type="button"
        className="app-dialog-backdrop"
        aria-label="Dismiss dialog"
        onClick={() =>
          active.kind === "prompt" ? onClosePrompt(null) : onCloseConfirm(false)
        }
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="app-dialog"
      >
        <h2 id={titleId} className="app-dialog-title">
          {active.title}
        </h2>
        {active.message && (
          <p className="app-dialog-message">{active.message}</p>
        )}

        {active.kind === "prompt" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onClosePrompt(value.trim() ? value.trim() : null);
            }}
          >
            <input
              ref={inputRef}
              value={value}
              placeholder={active.placeholder}
              onChange={(event) => setValue(event.target.value)}
              className="app-dialog-input"
            />
            <div className="app-dialog-actions">
              <button
                type="button"
                className="app-dialog-btn"
                onClick={() => onClosePrompt(null)}
              >
                {active.cancelLabel ?? "Cancel"}
              </button>
              <button type="submit" className="app-dialog-btn is-primary">
                {active.confirmLabel ?? "OK"}
              </button>
            </div>
          </form>
        )}

        {active.kind === "confirm" && (
          <div className="app-dialog-actions">
            <button
              type="button"
              className="app-dialog-btn"
              onClick={() => onCloseConfirm(false)}
            >
              {active.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              className={`app-dialog-btn is-primary ${
                active.danger ? "is-danger" : ""
              }`}
              onClick={() => onCloseConfirm(true)}
            >
              {active.confirmLabel ?? "OK"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
