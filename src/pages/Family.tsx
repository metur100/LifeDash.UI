import { useState } from "react";
import { api } from "../api/client";
import type { Appointment, FamilyMember, ImportantDate } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section } from "../components/Ui";
import { countdown, dateTime, daysUntil, shortDate, today } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function Family() {
  const members = useAsync<FamilyMember[]>(() => api.get("/api/family-members"), []);
  const appts = useAsync<Appointment[]>(() => api.get("/api/appointments"), []);
  const dates = useAsync<ImportantDate[]>(() => api.get("/api/important-dates"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);

  async function addMember() {
    const values = await dialog.form({
      title: "Person hinzufügen",
      submitText: "Anlegen",
      fields: [
        { key: "fullName", label: "Name" },
        { key: "relation", label: "Rolle", type: "select", options: [
          { value: "self", label: "ich" },
          { value: "spouse", label: "Partner:in" },
          { value: "child", label: "Kind" },
          { value: "other", label: "sonstige" },
        ] },
        { key: "birthDate", label: "Geburtstag", type: "date" },
        { key: "nationality", label: "Staatsangehörigkeit" },
        { key: "notes", label: "Notizen" },
      ],
      initial: {
        fullName: "",
        relation: "self",
        birthDate: "",
        nationality: "",
        notes: "",
      },
    });
    if (!values) return;
    if (!String(values.fullName).trim()) return;

    try {
      await api.post("/api/family-members", {
        fullName: String(values.fullName).trim(),
        relation: String(values.relation).trim() || null,
        birthDate: String(values.birthDate).trim() || null,
        nationality: String(values.nationality).trim() || null,
        notes: String(values.notes).trim() || null,
      });
      members.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function completeAppointment(a: Appointment) {
    try {
      await api.put(`/api/appointments/${a.id}`, { ...a, isDone: true });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function reopenAppointment(a: Appointment) {
    try {
      await api.put(`/api/appointments/${a.id}`, { ...a, isDone: false });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editMember(m: FamilyMember) {
    const values = await dialog.form({
      title: "Person bearbeiten",
      fields: [
        { key: "fullName", label: "Name" },
        { key: "relation", label: "Rolle", type: "select", options: [
          { value: "", label: "-" },
          { value: "self", label: "ich" },
          { value: "spouse", label: "Partner:in" },
          { value: "child", label: "Kind" },
          { value: "other", label: "sonstige" },
        ] },
        { key: "birthDate", label: "Geburtstag", type: "date" },
        { key: "nationality", label: "Staatsangehörigkeit" },
        { key: "notes", label: "Notizen" },
      ],
      initial: {
        fullName: m.fullName,
        relation: m.relation ?? "",
        birthDate: m.birthDate ?? "",
        nationality: m.nationality ?? "",
        notes: m.notes ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/family-members/${m.id}`, {
        ...m,
        fullName: String(values.fullName).trim(),
        relation: String(values.relation).trim() || null,
        birthDate: String(values.birthDate).trim() || null,
        nationality: String(values.nationality).trim() || null,
        notes: String(values.notes).trim() || null,
      });
      members.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeMember(id: number) {
    const ok = await dialog.confirm({ title: "Person löschen", message: "Person wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/family-members/${id}`);
      members.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editAppointment(a: Appointment) {
    const values = await dialog.form({
      title: "Termin bearbeiten",
      fields: [
        { key: "title", label: "Termin" },
        { key: "startsAt", label: "Start", type: "datetime-local" },
        { key: "location", label: "Ort" },
      ],
      initial: {
        title: a.title,
        startsAt: a.startsAt.slice(0, 16),
        location: a.location ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/appointments/${a.id}`, {
        ...a,
        title: String(values.title).trim(),
        startsAt: String(values.startsAt).trim() ? new Date(String(values.startsAt)).toISOString() : a.startsAt,
        location: String(values.location).trim() || null,
      });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeAppointment(id: number) {
    const ok = await dialog.confirm({ title: "Termin löschen", message: "Termin wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/appointments/${id}`);
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editDate(d: ImportantDate) {
    const values = await dialog.form({
      title: "Wichtiges Datum bearbeiten",
      fields: [
        { key: "title", label: "Anlass" },
        { key: "dateValue", label: "Datum", type: "date" },
        {
          key: "repeatsYearly",
          label: "Wiederholung",
          type: "select",
          options: [
            { value: "true", label: "jährlich" },
            { value: "false", label: "einmalig" },
          ],
        },
      ],
      initial: {
        title: d.title,
        dateValue: d.dateValue,
        repeatsYearly: d.repeatsYearly ? "true" : "false",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/important-dates/${d.id}`, {
        ...d,
        title: String(values.title).trim(),
        dateValue: String(values.dateValue),
        repeatsYearly: String(values.repeatsYearly) === "true",
      });
      dates.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeDate(id: number) {
    const ok = await dialog.confirm({ title: "Datum löschen", message: "Wichtiges Datum wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/important-dates/${id}`);
      dates.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function addAppointment() {
    const values = await dialog.form({
      title: "Termin anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Termin" },
        { key: "startsAt", label: "Start", type: "datetime-local" },
        { key: "location", label: "Ort" },
        { key: "category", label: "Kategorie", type: "select", options: [
          { value: "family", label: "family" },
          { value: "authority", label: "authority" },
          { value: "health", label: "health" },
          { value: "home", label: "home" },
        ] },
      ],
      initial: {
        title: "",
        startsAt: "",
        location: "",
        category: "family",
      },
    });
    if (!values) return;
    if (!String(values.title).trim() || !String(values.startsAt).trim()) return;

    try {
      await api.post("/api/appointments", {
        title: String(values.title).trim(),
        startsAt: new Date(String(values.startsAt)).toISOString(),
        location: String(values.location).trim() || null,
        category: String(values.category),
        reminderDays: 3,
        isDone: false,
      });
      appts.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function addDate() {
    const values = await dialog.form({
      title: "Datum anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Anlass" },
        { key: "dateValue", label: "Datum", type: "date" },
        { key: "repeatsYearly", label: "Wiederholung", type: "select", options: [
          { value: "true", label: "jährlich" },
          { value: "false", label: "einmalig" },
        ] },
      ],
      initial: {
        title: "",
        dateValue: today(),
        repeatsYearly: "true",
      },
    });
    if (!values) return;
    if (!String(values.title).trim() || !String(values.dateValue).trim()) return;

    try {
      await api.post("/api/important-dates", {
        title: String(values.title).trim(),
        dateValue: String(values.dateValue),
        repeatsYearly: String(values.repeatsYearly) === "true",
        reminderDays: 14,
      });
      dates.reload();
    } catch (e) { setError((e as Error).message); }
  }

  const upcoming = (appts.data ?? [])
    .filter((a) => !a.isDone)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const doneAppointments = (appts.data ?? [])
    .filter((a) => a.isDone)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return (
    <>
      <PageHead eyebrow="Familie" title="Wer wann was braucht"
        lede="Personen, Termine und wichtige Daten fuer dein Familien- und Erwachsenenleben." />
      <ErrorBar message={error ?? members.error ?? appts.error} />

      <Section title="Personen" action={<button className="btn icon-only" aria-label="Person hinzufügen" title="Person hinzufügen" onClick={addMember}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Person hinzufügen</span></button>}>
        <div className="card">
          <table>
            <thead><tr><th>Name</th><th>Rolle</th><th>Geburtstag</th><th>Staatsangehörigkeit</th><th className="num">Aktion</th></tr></thead>
            <tbody>
              {(members.data ?? []).map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.fullName}</strong></td>
                  <td>{m.relation ?? "—"}</td>
                  <td>{shortDate(m.birthDate)}</td>
                  <td>{m.nationality ?? "—"}</td>
                  <td className="num">
                    <button className="btn ghost small icon-only" aria-label="Person bearbeiten" title="Person bearbeiten" onClick={() => editMember(m)}>
                      <i className="fa-solid fa-pen-to-square" aria-hidden />
                      <span className="sr-only">Bearbeiten</span>
                    </button>{" "}
                    <button className="btn danger small icon-only" aria-label="Person löschen" title="Person löschen" onClick={() => removeMember(m.id)}>
                      <i className="fa-solid fa-trash" aria-hidden />
                      <span className="sr-only">Löschen</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      </Section>

      <div className="grid-2">
        <Section title="Termine" action={<button className="btn icon-only" aria-label="Termin anlegen" title="Termin anlegen" onClick={addAppointment}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Termin anlegen</span></button>}>
          {upcoming.length === 0
            ? <Empty title="Keine offenen Termine." hint="Neue Termine erscheinen hier, sobald du sie anlegst." />
            : <div className="card">
                <table>
                  <tbody>
                    {upcoming.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.title}</strong>
                          <div className="alert-msg">{dateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ""}</div>
                        </td>
                        <td className="num">
                          <span className="badge">{countdown(daysUntil(a.startsAt.slice(0, 10)))}</span>
                        </td>
                        <td className="num">
                          <button className="btn ghost small icon-only" aria-label="Termin als erledigt markieren" title="Termin als erledigt markieren" onClick={() => completeAppointment(a)}>
                            <i className="fa-solid fa-check" aria-hidden />
                            <span className="sr-only">Erledigt</span>
                          </button>
                          <button className="btn ghost small icon-only" aria-label="Termin bearbeiten" title="Termin bearbeiten" onClick={() => editAppointment(a)}>
                            <i className="fa-solid fa-pen-to-square" aria-hidden />
                            <span className="sr-only">Bearbeiten</span>
                          </button>{" "}
                          <button className="btn danger small icon-only" aria-label="Termin löschen" title="Termin löschen" onClick={() => removeAppointment(a.id)}>
                            <i className="fa-solid fa-trash" aria-hidden />
                            <span className="sr-only">Löschen</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          {doneAppointments.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <strong>Erledigte Termine</strong>
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {doneAppointments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.title}</strong>
                        <div className="alert-msg">{dateTime(a.startsAt)}{a.location ? ` · ${a.location}` : ""}</div>
                      </td>
                      <td className="num">
                        <button className="btn ghost small icon-only" aria-label="Termin wieder öffnen" title="Termin wieder öffnen" onClick={() => reopenAppointment(a)}>
                          <i className="fa-solid fa-rotate-left" aria-hidden />
                          <span className="sr-only">Wieder öffnen</span>
                        </button>{" "}
                        <button className="btn danger small icon-only" aria-label="Termin löschen" title="Termin löschen" onClick={() => removeAppointment(a.id)}>
                          <i className="fa-solid fa-trash" aria-hidden />
                          <span className="sr-only">Löschen</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Organisation fuer Erwachsene">
          <div className="card">
            <strong>Sinnvolle Nutzung im Alltag</strong>
            <p className="alert-msg" style={{ marginTop: 10 }}>
              Nutze Termine fuer Arzt, Behoerden, Versicherungen und Fristen. Lege wiederkehrende wichtige Daten
              fuer Ausweise, Fuehrerschein, Aufenthaltsdokumente oder jaehrliche Steuertermine an.
            </p>
            <p className="alert-msg">
              Bei Personen kannst du Rollen wie ich, Partner:in oder sonstige pflegen und damit Dokumente,
              Termine und Fristen besser zuordnen.
            </p>
          </div>
        </Section>
      </div>

      <Section title="Wichtige Daten" action={<button className="btn icon-only" aria-label="Datum anlegen" title="Datum anlegen" onClick={addDate}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Datum anlegen</span></button>}>
        {(dates.data ?? []).length === 0
          ? <Empty title="Noch keine wichtigen Daten." hint="Geburtstage und Jahrestage erinnern dich rechtzeitig." />
          : <div className="card">
              <table>
                <thead><tr><th>Anlass</th><th>Datum</th><th>Wiederholung</th><th className="num">Countdown</th><th className="num">Aktion</th></tr></thead>
                <tbody>
                  {(dates.data ?? []).map((d) => (
                    <tr key={d.id}>
                      <td><strong>{d.title}</strong></td>
                      <td>{shortDate(d.dateValue)}</td>
                      <td>{d.repeatsYearly ? "jährlich" : "einmalig"}</td>
                      <td className="num">{countdown(daysUntil(d.dateValue))}</td>
                      <td className="num">
                        <button className="btn ghost small icon-only" aria-label="Datum bearbeiten" title="Datum bearbeiten" onClick={() => editDate(d)}>
                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                          <span className="sr-only">Bearbeiten</span>
                        </button>{" "}
                        <button className="btn danger small icon-only" aria-label="Datum löschen" title="Datum löschen" onClick={() => removeDate(d.id)}>
                          <i className="fa-solid fa-trash" aria-hidden />
                          <span className="sr-only">Löschen</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
      </Section>
    </>
  );
}
