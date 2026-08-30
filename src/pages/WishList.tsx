import { useMemo, useState } from "react";
import { api } from "../api/client";
import type { HomeItem } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section } from "../components/Ui";
import { euro, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

function toNum(value: unknown): number {
  return Number(String(value ?? "0").replace(",", "."));
}

export default function WishList() {
  const items = useAsync<HomeItem[]>(() => api.get("/api/home-items"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);

  const wishes = useMemo(() => (items.data ?? [])
    .filter((i) => i.kind === "wishlist")
    .sort((a, b) => a.title.localeCompare(b.title)), [items.data]);

  const open = wishes.filter((w) => w.status !== "done");
  const done = wishes.filter((w) => w.status === "done");

  async function addWish() {
    const values = await dialog.form({
      title: "Wunsch anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Name" },
        { key: "category", label: "Kategorie" },
        { key: "targetPrice", label: "Preis", type: "number" },
      ],
      initial: {
        title: "",
        category: "",
        targetPrice: "",
      },
    });
    if (!values) return;

    const title = String(values.title).trim();
    const targetPrice = toNum(values.targetPrice);
    if (!title || !Number.isFinite(targetPrice) || targetPrice <= 0) return;

    try {
      await api.post("/api/home-items", {
        kind: "wishlist",
        title,
        room: String(values.category).trim() || null,
        cost: targetPrice,
        currency: "EUR",
        status: "open",
      });
      items.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function editWish(w: HomeItem) {
    const values = await dialog.form({
      title: "Wunsch bearbeiten",
      submitText: "Speichern",
      fields: [
        { key: "title", label: "Name" },
        { key: "category", label: "Kategorie" },
        { key: "targetPrice", label: "Preis", type: "number" },
      ],
      initial: {
        title: w.title,
        category: w.room ?? "",
        targetPrice: w.cost?.toString() ?? "",
      },
    });
    if (!values) return;

    const targetPrice = toNum(values.targetPrice);
    if (!String(values.title).trim() || !Number.isFinite(targetPrice) || targetPrice <= 0) return;

    try {
      await api.put(`/api/home-items/${w.id}`, {
        ...w,
        kind: "wishlist",
        title: String(values.title).trim(),
        room: String(values.category).trim() || null,
        cost: targetPrice,
      });
      items.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function markBought(w: HomeItem) {
    try {
      await api.put(`/api/home-items/${w.id}`, {
        ...w,
        status: "done",
        purchasedOn: today(),
      });
      items.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeWish(id: number) {
    const ok = await dialog.confirm({
      title: "Eintrag löschen",
      message: "Wunsch/Anschaffung wirklich löschen?",
      confirmText: "Löschen",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.del(`/api/home-items/${id}`);
      items.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Wunschliste"
        title="Wünsche"
        lede="Erfasse Name, Kategorie und Preis deiner Wünsche."
      />
      <ErrorBar message={error ?? items.error} />

      <Section
        title="Geplant"
        action={<button className="btn icon-only" aria-label="Wunsch anlegen" title="Wunsch anlegen" onClick={addWish}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Wunsch anlegen</span></button>}
      >
        <div className="card">
          {open.length === 0 ? (
            <Empty title="Noch nichts geplant." hint="Lege einen Wunsch oder eine große Anschaffung an." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Eintrag</th>
                  <th className="num">Preis</th>
                  <th className="num action-col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {open.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.title}</strong>
                      <div className="alert-msg">{w.room || "-"}</div>
                    </td>
                    <td className="num">{w.cost ? euro(w.cost, w.currency) : "-"}</td>
                    <td className="num action-cell">
                      <div className="action-stack">
                        <button className="btn ghost small icon-only" aria-label="Als gekauft markieren" title="Als gekauft markieren" onClick={() => markBought(w)}>
                          <i className="fa-solid fa-circle-check" aria-hidden />
                          <span className="sr-only">Gekauft</span>
                        </button>
                        <button className="btn ghost small icon-only" aria-label="Eintrag bearbeiten" title="Eintrag bearbeiten" onClick={() => editWish(w)}>
                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                          <span className="sr-only">Bearbeiten</span>
                        </button>
                        <button className="btn danger small icon-only" aria-label="Eintrag löschen" title="Eintrag löschen" onClick={() => removeWish(w.id)}>
                          <i className="fa-solid fa-trash" aria-hidden />
                          <span className="sr-only">Löschen</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      <Section title="Gekauft">
        <div className="card">
          {done.length === 0 ? (
            <Empty title="Noch nichts gekauft." hint="Als gekauft markierte Einträge erscheinen hier." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Eintrag</th>
                  <th className="num">Preis</th>
                  <th className="num action-col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {done.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.title}</strong>
                      <div className="alert-msg">{w.purchasedOn ? `gekauft am ${shortDate(w.purchasedOn)}` : "gekauft"}</div>
                    </td>
                    <td className="num">{w.cost ? euro(w.cost, w.currency) : "-"}</td>
                    <td className="num action-cell">
                      <div className="action-stack">
                        <button className="btn ghost small icon-only" aria-label="Eintrag bearbeiten" title="Eintrag bearbeiten" onClick={() => editWish(w)}>
                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                          <span className="sr-only">Bearbeiten</span>
                        </button>
                        <button className="btn danger small icon-only" aria-label="Eintrag löschen" title="Eintrag löschen" onClick={() => removeWish(w.id)}>
                          <i className="fa-solid fa-trash" aria-hidden />
                          <span className="sr-only">Löschen</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>
    </>
  );
}
