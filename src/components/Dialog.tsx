import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Option = { value: string; label: string };

type DialogField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "select";
  options?: Option[];
  visibleWhen?: (draft: Record<string, unknown>) => boolean;
};

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
};

type FormOptions<T extends Record<string, unknown>> = {
  title: string;
  fields: DialogField[];
  initial: T;
  submitText?: string;
  secondarySubmitText?: string;
  secondarySubmitValue?: string;
};

type DialogApi = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  form: <T extends Record<string, unknown>>(opts: FormOptions<T>) => Promise<T | null>;
};

type ConfirmState = ConfirmOptions & {
  kind: "confirm";
  resolve: (ok: boolean) => void;
};

type FormState = {
  kind: "form";
  title: string;
  fields: DialogField[];
  submitText?: string;
  secondarySubmitText?: string;
  secondarySubmitValue?: string;
  draft: Record<string, unknown>;
  resolve: (value: Record<string, unknown> | null) => void;
};

type DialogState = ConfirmState | FormState | null;

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);

  const api = useMemo<DialogApi>(() => ({
    confirm: (opts) => new Promise<boolean>((resolve) => {
      setState({ kind: "confirm", resolve, ...opts });
    }),
    form: <T extends Record<string, unknown>>(opts: FormOptions<T>) => new Promise<T | null>((resolve) => {
      setState({
        kind: "form",
        title: opts.title,
        fields: opts.fields,
        submitText: opts.submitText,
        secondarySubmitText: opts.secondarySubmitText,
        secondarySubmitValue: opts.secondarySubmitValue,
        draft: { ...opts.initial },
        resolve: (value) => resolve(value as T | null),
      });
    }),
  }), []);

  function closeConfirm(ok: boolean) {
    if (state?.kind !== "confirm") return;
    state.resolve(ok);
    setState(null);
  }

  function closeForm(value: Record<string, unknown> | null) {
    if (state?.kind !== "form") return;
    state.resolve(value);
    setState(null);
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {state && (
        <div className="dlg-backdrop" role="presentation" onClick={() => state.kind === "confirm" ? closeConfirm(false) : closeForm(null)}>
          <div className="dlg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <h3>{state.title}</h3>
            </div>
            {state.kind === "confirm" && (
              <>
                <p className="dlg-text">{state.message}</p>
                <div className="dlg-actions">
                  <button className="btn ghost" onClick={() => closeConfirm(false)}>Abbrechen</button>
                  <button className={`btn ${state.danger ? "danger" : ""}`} onClick={() => closeConfirm(true)}>
                    {state.confirmText ?? "Bestätigen"}
                  </button>
                </div>
              </>
            )}
            {state.kind === "form" && (
              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  closeForm(state.draft);
                }}
              >
                {state.fields.filter((f) => f.visibleWhen ? f.visibleWhen(state.draft) : true).map((f) => (
                  <label className="field" key={f.key}>
                    {f.label}
                    {f.type === "select" ? (
                      <select
                        value={String(state.draft[f.key] ?? "")}
                        onChange={(e) => setState((prev) => prev && prev.kind === "form"
                          ? { ...prev, draft: { ...prev.draft, [f.key]: e.target.value } }
                          : prev)}
                      >
                        {(f.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type ?? "text"}
                        value={String(state.draft[f.key] ?? "")}
                        onChange={(e) => setState((prev) => prev && prev.kind === "form"
                          ? { ...prev, draft: { ...prev.draft, [f.key]: e.target.value } }
                          : prev)}
                      />
                    )}
                  </label>
                ))}
                <div className="dlg-actions">
                  <button type="button" className="btn ghost" onClick={() => closeForm(null)}>Abbrechen</button>
                  {state.secondarySubmitText && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => closeForm({
                        ...state.draft,
                        __dialogAction: state.secondarySubmitValue ?? "secondary",
                      })}
                    >
                      {state.secondarySubmitText}
                    </button>
                  )}
                  <button type="submit" className="btn">{state.submitText ?? "Speichern"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}
