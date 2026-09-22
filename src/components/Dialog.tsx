import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Option = { value: string; label: string };

const ADD_OPTION_VALUE = "__add_new_option__";

export type DialogField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "select" | "multiselect" | "section";
  options?: Option[];
  visibleWhen?: (draft: Record<string, unknown>) => boolean;
  // When set, the select shows a "+ Neue Kategorie hinzufügen" entry that switches the field into
  // an inline add-mode instead of committing a draft value; confirming calls onAdd and selects the
  // returned option.
  allowCustomOption?: { onAdd: (label: string) => Promise<Option> };
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
  const [closeOnBackdropClick, setCloseOnBackdropClick] = useState(false);
  const [addingFieldKey, setAddingFieldKey] = useState<string | null>(null);
  const [addingFieldText, setAddingFieldText] = useState("");
  const [addingFieldBusy, setAddingFieldBusy] = useState(false);
  const [extraOptionsByKey, setExtraOptionsByKey] = useState<Record<string, Option[]>>({});

  const api = useMemo<DialogApi>(() => ({
    confirm: (opts) => new Promise<boolean>((resolve) => {
      setState({ kind: "confirm", resolve, ...opts });
    }),
    form: <T extends Record<string, unknown>>(opts: FormOptions<T>) => new Promise<T | null>((resolve) => {
      setAddingFieldKey(null);
      setAddingFieldText("");
      setExtraOptionsByKey({});
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

  async function confirmAddOption(field: DialogField) {
    if (!field.allowCustomOption || !addingFieldText.trim()) return;
    setAddingFieldBusy(true);
    try {
      const option = await field.allowCustomOption.onAdd(addingFieldText.trim());
      setExtraOptionsByKey((prev) => ({ ...prev, [field.key]: [...(prev[field.key] ?? []), option] }));
      setState((prev) => prev && prev.kind === "form"
        ? { ...prev, draft: { ...prev.draft, [field.key]: option.value } }
        : prev);
      setAddingFieldKey(null);
      setAddingFieldText("");
    } finally {
      setAddingFieldBusy(false);
    }
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
        <div
          className="dlg-backdrop"
          role="presentation"
          onMouseDown={(e) => setCloseOnBackdropClick(e.target === e.currentTarget)}
          onClick={(e) => {
            if (e.target === e.currentTarget && closeOnBackdropClick) {
              if (state.kind === "confirm") closeConfirm(false);
              else closeForm(null);
            }
            setCloseOnBackdropClick(false);
          }}
        >
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
                {state.fields.filter((f) => f.visibleWhen ? f.visibleWhen(state.draft) : true).map((f) => {
                  if (f.type === "section") {
                    return <div className="dlg-section-title" key={f.key}>{f.label}</div>;
                  }

                  if (f.type === "multiselect") {
                    const selected = new Set(String(state.draft[f.key] ?? "").split(",").map((v) => v.trim()).filter(Boolean));
                    return (
                      <div className="field" key={f.key}>
                        {f.label}
                        <div className="multiselect-box">
                          {(f.options ?? []).map((o) => (
                            <label key={o.value} className="multiselect-option">
                              <input
                                type="checkbox"
                                checked={selected.has(o.value)}
                                onChange={(e) => {
                                  const next = new Set(selected);
                                  if (e.target.checked) next.add(o.value); else next.delete(o.value);
                                  const value = Array.from(next).join(",");
                                  setState((prev) => prev && prev.kind === "form"
                                    ? { ...prev, draft: { ...prev.draft, [f.key]: value } }
                                    : prev);
                                }}
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  if (f.type === "select" && f.allowCustomOption) {
                    const mergedOptions = [...(f.options ?? []), ...(extraOptionsByKey[f.key] ?? [])];
                    return (
                      <label className="field" key={f.key}>
                        {f.label}
                        <select
                          value={String(state.draft[f.key] ?? "")}
                          onChange={(e) => {
                            if (e.target.value === ADD_OPTION_VALUE) {
                              setAddingFieldKey(f.key);
                              setAddingFieldText("");
                              return;
                            }
                            setState((prev) => prev && prev.kind === "form"
                              ? { ...prev, draft: { ...prev.draft, [f.key]: e.target.value } }
                              : prev);
                          }}
                        >
                          {mergedOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                          <option value={ADD_OPTION_VALUE}>+ Neue Kategorie hinzufügen…</option>
                        </select>
                        {addingFieldKey === f.key && (
                          <div className="dlg-add-option">
                            <input
                              type="text"
                              autoFocus
                              placeholder="Name der neuen Kategorie"
                              value={addingFieldText}
                              onChange={(e) => setAddingFieldText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); void confirmAddOption(f); }
                                if (e.key === "Escape") { e.preventDefault(); setAddingFieldKey(null); }
                              }}
                            />
                            <button type="button" className="btn small" disabled={addingFieldBusy || !addingFieldText.trim()} onClick={() => void confirmAddOption(f)}>
                              Hinzufügen
                            </button>
                            <button type="button" className="btn ghost small" onClick={() => setAddingFieldKey(null)}>
                              Abbrechen
                            </button>
                          </div>
                        )}
                      </label>
                    );
                  }

                  return (
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
                  );
                })}
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
