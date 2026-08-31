import { useState } from "react";
import { api } from "../api/client";
import type { HomeItem } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section } from "../components/Ui";
import { countdown, daysUntil, euro, shortDate } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function HomeItems() {
  const items = useAsync<HomeItem[]>(() => api.get("/api/home-items"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);

  async function addItem() {
    const values = await dialog.form({
      title: "Eintrag anlegen",
      submitText: "Anlegen",
      fields: [
        {
          key: "kind",
          label: "Art",
          type: "select",
          options: [
            { value: "repair", label: "Reparatur" },
            { value: "purchase", label: "Anschaffung" },
            { value: "warranty", label: "Garantie" },
          ],
        },
        { key: "title", label: "Bezeichnung" },
        { key: "room", label: "Raum" },
        { key: "warrantyUntil", label: "Garantie bis", type: "date" },
      ],
      initial: {
        kind: "repair",
        title: "",
        room: "",
        warrantyUntil: "",
      },
    });
    if (!values) return;
    if (!String(values.title).trim()) return;

    try {
      await api.post("/api/home-items", {
        kind: String(values.kind),
        title: String(values.title).trim(),
        room: String(values.room).trim() || null,
        warrantyUntil: String(values.warrantyUntil).trim() || null,
        currency: "EUR",
        status: "open",
      });
      items.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function complete(item: HomeItem) {
    try {
      await api.put(`/api/home-items/${item.id}`, { ...item, status: "done" });
      items.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function reopen(item: HomeItem) {
    try {
      await api.put(`/api/home-items/${item.id}`, { ...item, status: "open" });
      items.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editItem(item: HomeItem) {
    const values = await dialog.form({
      title: "Zuhause-Eintrag bearbeiten",
      fields: [
        { key: "title", label: "Bezeichnung" },
        {
          key: "kind",
          label: "Art",
          type: "select",
          options: [
            { value: "repair", label: "Reparatur" },
            { value: "purchase", label: "Anschaffung" },
            { value: "warranty", label: "Garantie" },
          ],
        },
        { key: "room", label: "Raum" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "open", label: "open" },
            { value: "scheduled", label: "scheduled" },
            { value: "done", label: "done" },
          ],
        },
        { key: "cost", label: "Kosten", type: "number" },
        { key: "purchasedOn", label: "Kaufdatum", type: "date" },
        { key: "warrantyUntil", label: "Garantie bis", type: "date" },
      ],
      initial: {
        title: item.title,
        kind: item.kind,
        room: item.room ?? "",
        status: item.status,
        cost: item.cost?.toString() ?? "",
        purchasedOn: item.purchasedOn ?? "",
        warrantyUntil: item.warrantyUntil ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/home-items/${item.id}`, {
        ...item,
        title: String(values.title).trim(),
        kind: String(values.kind),
        room: String(values.room).trim() || null,
        status: String(values.status),
        cost: String(values.cost).trim() ? Number(values.cost) : null,
        purchasedOn: String(values.purchasedOn).trim() || null,
        warrantyUntil: String(values.warrantyUntil).trim() || null,
      });
      items.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeItem(id: number) {
    const ok = await dialog.confirm({ title: "Eintrag löschen", message: "Eintrag wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/home-items/${id}`);
      items.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const all = items.data ?? [];
  const repairs = all.filter((i) => i.kind === "repair" && i.status !== "done");
  const purchases = all.filter((i) => i.kind === "purchase");
  const warranties = all.filter((i) => i.kind === "warranty" || i.warrantyUntil);
  const doneItems = all.filter((i) => i.status === "done");

  return (
    <>
      <PageHead eyebrow="Zuhause" title="Reparaturen, Anschaffungen, Garantien"
        lede="Was kaputt ist, was gekauft wurde und wie lange die Garantie noch läuft." />
      <ErrorBar message={error ?? items.error} />

      <Section title="Offene Reparaturen" action={<button className="btn icon-only" aria-label="Eintrag hinzufügen" title="Eintrag hinzufügen" onClick={addItem}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Eintrag hinzufügen</span></button>}>
        <div className="card">
          {repairs.length === 0
            ? <Empty title="Nichts kaputt." hint="Trage eine Reparatur ein, damit sie nicht vergessen wird." />
            : <>
              <div className="table-scroll rtable-desktop">
                <table>
                  <thead><tr><th>Aufgabe</th><th>Raum</th><th>Termin</th><th className="num action-col">Aktion</th></tr></thead>
                  <tbody>
                    {repairs.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.title}</strong>{r.vendor && <div className="alert-msg">{r.vendor}</div>}</td>
                        <td>{r.room ?? "—"}</td>
                        <td>{r.scheduledOn ? `${shortDate(r.scheduledOn)} · ${countdown(daysUntil(r.scheduledOn))}` : "offen"}</td>
                        <td className="num action-cell">
                          <div className="action-stack">
                          <button className="btn ghost small icon-only" aria-label="Als erledigt markieren" title="Als erledigt markieren" onClick={() => complete(r)}>
                            <i className="fa-solid fa-check" aria-hidden />
                            <span className="sr-only">Erledigt</span>
                          </button>{" "}
                          <button className="btn ghost small icon-only" aria-label="Eintrag bearbeiten" title="Eintrag bearbeiten" onClick={() => editItem(r)}>
                            <i className="fa-solid fa-pen-to-square" aria-hidden />
                            <span className="sr-only">Bearbeiten</span>
                          </button>{" "}
                          <button className="btn danger small icon-only" aria-label="Eintrag löschen" title="Eintrag löschen" onClick={() => removeItem(r.id)}>
                            <i className="fa-solid fa-trash" aria-hidden />
                            <span className="sr-only">Löschen</span>
                          </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rtable-cards">
                {repairs.map((r) => (
                  <div key={`m-${r.id}`} className="mobile-card">
                    <div className="mobile-card-head">
                      <strong>{r.title}</strong>
                      <span className="badge">{r.room ?? "—"}</span>
                    </div>
                    {r.vendor && <div className="alert-msg">{r.vendor}</div>}
                    <div className="alert-msg">Termin: {r.scheduledOn ? `${shortDate(r.scheduledOn)} · ${countdown(daysUntil(r.scheduledOn))}` : "offen"}</div>
                    <div className="action-stack mobile-card-actions">
                      <button className="btn ghost small icon-only" aria-label="Als erledigt markieren" title="Als erledigt markieren" onClick={() => complete(r)}>
                        <i className="fa-solid fa-check" aria-hidden />
                        <span className="sr-only">Erledigt</span>
                      </button>
                      <button className="btn ghost small icon-only" aria-label="Eintrag bearbeiten" title="Eintrag bearbeiten" onClick={() => editItem(r)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>
                      <button className="btn danger small icon-only" aria-label="Eintrag löschen" title="Eintrag löschen" onClick={() => removeItem(r.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>}

        </div>
      </Section>

      <div className="grid-2">
        <Section title="Garantien">
          <div className="card">
            {warranties.length === 0
              ? <Empty title="Keine Garantien erfasst." hint="Kaufdatum und Garantieende eintragen lohnt sich." />
              : <>
                <div className="table-scroll rtable-desktop">
                  <table>
                    <thead><tr><th>Garantie</th><th className="num">Status</th><th className="num action-col">Aktion</th></tr></thead>
                    <tbody>
                      {warranties.map((w) => {
                        const d = daysUntil(w.warrantyUntil);
                        return (
                          <tr key={w.id}>
                            <td><strong>{w.title}</strong><div className="alert-msg">{w.vendor ?? w.room ?? ""}</div></td>
                            <td className="num">
                              {w.warrantyUntil
                                ? <span className={`badge ${d !== null && d < 0 ? "red" : d !== null && d <= 60 ? "amber" : "green"}`}>
                                    {d !== null && d < 0 ? "abgelaufen" : countdown(d)}
                                  </span>
                                : <span className="badge">ohne Datum</span>}
                            </td>
                            <td className="num action-cell">
                              <div className="action-stack">
                              <button className="btn ghost small icon-only" aria-label="Garantie bearbeiten" title="Garantie bearbeiten" onClick={() => editItem(w)}>
                                <i className="fa-solid fa-pen-to-square" aria-hidden />
                                <span className="sr-only">Bearbeiten</span>
                              </button>{" "}
                              <button className="btn danger small icon-only" aria-label="Garantie löschen" title="Garantie löschen" onClick={() => removeItem(w.id)}>
                                <i className="fa-solid fa-trash" aria-hidden />
                                <span className="sr-only">Löschen</span>
                              </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rtable-cards">
                  {warranties.map((w) => {
                    const d = daysUntil(w.warrantyUntil);
                    return (
                      <div key={`m-${w.id}`} className="mobile-card">
                        <div className="mobile-card-head">
                          <strong>{w.title}</strong>
                          {w.warrantyUntil
                            ? <span className={`badge ${d !== null && d < 0 ? "red" : d !== null && d <= 60 ? "amber" : "green"}`}>
                                {d !== null && d < 0 ? "abgelaufen" : countdown(d)}
                              </span>
                            : <span className="badge">ohne Datum</span>}
                        </div>
                        <div className="alert-msg">{w.vendor ?? w.room ?? ""}</div>
                        <div className="action-stack mobile-card-actions">
                          <button className="btn ghost small icon-only" aria-label="Garantie bearbeiten" title="Garantie bearbeiten" onClick={() => editItem(w)}>
                            <i className="fa-solid fa-pen-to-square" aria-hidden />
                            <span className="sr-only">Bearbeiten</span>
                          </button>
                          <button className="btn danger small icon-only" aria-label="Garantie löschen" title="Garantie löschen" onClick={() => removeItem(w.id)}>
                            <i className="fa-solid fa-trash" aria-hidden />
                            <span className="sr-only">Löschen</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>}
          </div>
        </Section>

        <Section title="Anschaffungen">
          <div className="card">
            {purchases.length === 0
              ? <Empty title="Noch keine Anschaffungen." hint="Trage größere Käufe ein, um sie im Blick zu behalten." />
              : <>
                <div className="table-scroll rtable-desktop">
                  <table>
                    <thead><tr><th>Anschaffung</th><th className="num">Betrag</th><th className="num action-col">Aktion</th></tr></thead>
                    <tbody>
                      {purchases.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.title}</strong><div className="alert-msg">{shortDate(p.purchasedOn)}</div></td>
                          <td className="num">{p.cost ? euro(p.cost, p.currency) : "—"}</td>
                          <td className="num action-cell">
                            <div className="action-stack">
                            <button className="btn ghost small icon-only" aria-label="Anschaffung bearbeiten" title="Anschaffung bearbeiten" onClick={() => editItem(p)}>
                              <i className="fa-solid fa-pen-to-square" aria-hidden />
                              <span className="sr-only">Bearbeiten</span>
                            </button>{" "}
                            <button className="btn danger small icon-only" aria-label="Anschaffung löschen" title="Anschaffung löschen" onClick={() => removeItem(p.id)}>
                              <i className="fa-solid fa-trash" aria-hidden />
                              <span className="sr-only">Löschen</span>
                            </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rtable-cards">
                  {purchases.map((p) => (
                    <div key={`m-${p.id}`} className="mobile-card">
                      <div className="mobile-card-head">
                        <strong>{p.title}</strong>
                        <span className="badge">{p.cost ? euro(p.cost, p.currency) : "—"}</span>
                      </div>
                      <div className="alert-msg">{shortDate(p.purchasedOn)}</div>
                      <div className="action-stack mobile-card-actions">
                        <button className="btn ghost small icon-only" aria-label="Anschaffung bearbeiten" title="Anschaffung bearbeiten" onClick={() => editItem(p)}>
                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                          <span className="sr-only">Bearbeiten</span>
                        </button>
                        <button className="btn danger small icon-only" aria-label="Anschaffung löschen" title="Anschaffung löschen" onClick={() => removeItem(p.id)}>
                          <i className="fa-solid fa-trash" aria-hidden />
                          <span className="sr-only">Löschen</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>}
          </div>
        </Section>
      </div>

      <Section title="Verlauf erledigt/geschlossen">
        <div className="card">
          {doneItems.length === 0
            ? <Empty title="Noch nichts abgeschlossen." hint="Als erledigt markierte Einträge erscheinen hier." />
            : <>
              <div className="table-scroll rtable-desktop">
                <table>
                  <thead><tr><th>Eintrag</th><th>Art</th><th>Status</th><th className="num action-col">Aktion</th></tr></thead>
                  <tbody>
                    {doneItems.map((d) => (
                      <tr key={d.id}>
                        <td><strong>{d.title}</strong><div className="alert-msg">{d.room ?? d.vendor ?? ""}</div></td>
                        <td>{d.kind}</td>
                        <td><span className="badge green">done</span></td>
                        <td className="num action-cell">
                          <div className="action-stack">
                          <button className="btn ghost small icon-only" aria-label="Wieder öffnen" title="Wieder öffnen" onClick={() => reopen(d)}>
                            <i className="fa-solid fa-rotate-left" aria-hidden />
                            <span className="sr-only">Wieder öffnen</span>
                          </button>{" "}
                          <button className="btn danger small icon-only" aria-label="Eintrag löschen" title="Eintrag löschen" onClick={() => removeItem(d.id)}>
                            <i className="fa-solid fa-trash" aria-hidden />
                            <span className="sr-only">Löschen</span>
                          </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rtable-cards">
                {doneItems.map((d) => (
                  <div key={`m-${d.id}`} className="mobile-card">
                    <div className="mobile-card-head">
                      <strong>{d.title}</strong>
                      <span className="badge green">done</span>
                    </div>
                    <div className="alert-msg">{d.kind}{d.room || d.vendor ? ` · ${d.room ?? d.vendor}` : ""}</div>
                    <div className="action-stack mobile-card-actions">
                      <button className="btn ghost small icon-only" aria-label="Wieder öffnen" title="Wieder öffnen" onClick={() => reopen(d)}>
                        <i className="fa-solid fa-rotate-left" aria-hidden />
                        <span className="sr-only">Wieder öffnen</span>
                      </button>
                      <button className="btn danger small icon-only" aria-label="Eintrag löschen" title="Eintrag löschen" onClick={() => removeItem(d.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>}
        </div>
      </Section>
    </>
  );
}
