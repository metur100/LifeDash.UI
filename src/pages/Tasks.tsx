import { useState } from "react";
import { api } from "../api/client";
import type { TaskItem } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead } from "../components/Ui";
import { countdown, daysUntil, shortDate } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const modules = ["general", "family", "authority", "finance", "home", "travel"];
const moduleLabels: Record<string, string> = {
  general: "Allgemein", family: "Familie", authority: "Behörden",
  finance: "Finanzen", home: "Zuhause", travel: "Reisen",
};

export default function Tasks() {
  const tasks = useAsync<TaskItem[]>(() => api.get("/api/tasks"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  async function addTask() {
    const values = await dialog.form({
      title: "Aufgabe anlegen",
      fields: [
        { key: "title", label: "Aufgabe" },
        { key: "module", label: "Bereich", type: "select", options: modules.map((m) => ({ value: m, label: moduleLabels[m] })) },
        { key: "dueOn", label: "Fällig am", type: "date" },
        {
          key: "priority",
          label: "Priorität",
          type: "select",
          options: [
            { value: "low", label: "niedrig" },
            { value: "normal", label: "normal" },
            { value: "high", label: "hoch" },
          ],
        },
      ],
      initial: {
        title: "",
        module: "general",
        dueOn: "",
        priority: "normal",
      },
      submitText: "Anlegen",
    });
    if (!values) return;
    const title = String(values.title).trim();
    if (!title) return;

    try {
      await api.post("/api/tasks", {
        title,
        module: String(values.module),
        dueOn: String(values.dueOn).trim() || null,
        priority: String(values.priority),
        isDone: false,
      });
      tasks.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function toggle(t: TaskItem) {
    try { await api.put(`/api/tasks/${t.id}`, { ...t, isDone: !t.isDone }); tasks.reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function editTask(t: TaskItem) {
    const values = await dialog.form({
      title: "Aufgabe bearbeiten",
      fields: [
        { key: "title", label: "Aufgabe" },
        { key: "module", label: "Bereich", type: "select", options: modules.map((m) => ({ value: m, label: moduleLabels[m] ?? m })) },
        { key: "dueOn", label: "Fällig am", type: "date" },
        {
          key: "priority",
          label: "Priorität",
          type: "select",
          options: [
            { value: "low", label: "niedrig" },
            { value: "normal", label: "normal" },
            { value: "high", label: "hoch" },
          ],
        },
      ],
      initial: {
        title: t.title,
        module: t.module,
        dueOn: t.dueOn ?? "",
        priority: t.priority,
      },
    });
    if (!values) return;
    try {
      await api.put(`/api/tasks/${t.id}`, {
        ...t,
        title: String(values.title).trim(),
        module: String(values.module),
        dueOn: String(values.dueOn).trim() || null,
        priority: String(values.priority),
      });
      tasks.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeTask(id: number) {
    const ok = await dialog.confirm({ title: "Aufgabe löschen", message: "Aufgabe wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/tasks/${id}`);
      tasks.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const list = (tasks.data ?? [])
    .filter((t) => showDone || !t.isDone)
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));

  return (
    <>
      <PageHead eyebrow="Aufgaben" title="Was du selbst erledigen musst"
        lede="Kleine Schritte, die zwischen den großen Fristen hängen bleiben."
        action={<>
          <button className="btn icon-only" aria-label="Aufgabe anlegen" title="Aufgabe anlegen" onClick={addTask}>
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Aufgabe anlegen</span>
          </button>{" "}
          <button className="btn ghost icon-only" aria-label={showDone ? "Erledigte ausblenden" : "Erledigte anzeigen"} title={showDone ? "Erledigte ausblenden" : "Erledigte anzeigen"} onClick={() => setShowDone(!showDone)}>
            <i className={`fa-solid ${showDone ? "fa-eye-slash" : "fa-eye"}`} aria-hidden />
            <span className="sr-only">{showDone ? "Erledigte ausblenden" : "Erledigte anzeigen"}</span>
          </button>
        </>} />
      <ErrorBar message={error ?? tasks.error} />

      <div className="card">
        {list.length === 0
          ? <Empty title="Nichts offen." hint="Lege eine Aufgabe über das Plus an." />
          : <ul className="checklist">
              {list.map((t) => {
                const d = daysUntil(t.dueOn);
                return (
                  <li key={t.id} className={!t.isDone && d !== null && d < 0 ? "missing" : ""}>
                    <input type="checkbox" checked={t.isDone} style={{ width: 16 }}
                           aria-label={`${t.title} erledigt`} onChange={() => toggle(t)} />
                    <span style={{ textDecoration: t.isDone ? "line-through" : "none" }}>{t.title}</span>
                    <span className="badge" style={{ marginLeft: 6 }}>{moduleLabels[t.module] ?? t.module}</span>
                    {t.priority === "high" && <span className="badge red">wichtig</span>}
                    <div className="spacer" />
                    <button className="btn ghost small icon-only" aria-label="Aufgabe bearbeiten" title="Aufgabe bearbeiten" onClick={() => editTask(t)}>
                      <i className="fa-solid fa-pen-to-square" aria-hidden />
                      <span className="sr-only">Bearbeiten</span>
                    </button>
                    <button className="btn danger small icon-only" aria-label="Aufgabe löschen" title="Aufgabe löschen" onClick={() => removeTask(t.id)}>
                      <i className="fa-solid fa-trash" aria-hidden />
                      <span className="sr-only">Löschen</span>
                    </button>
                    {t.dueOn && <span className={`badge ${d !== null && d < 0 ? "red" : ""}`}>
                      {shortDate(t.dueOn)} · {countdown(d)}
                    </span>}
                  </li>
                );
              })}
            </ul>}

      </div>
    </>
  );
}
