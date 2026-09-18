import { useState } from "react";
import { api } from "../api/client";
import type { FamilyMember } from "../api/types";
import { useDialog } from "../components/Dialog";
import { AgeDistributionChart, FamilyTree, ageFromBirthDate } from "../components/FamilyCharts";
import { Empty, ErrorBar, PageHead, Section, Stat } from "../components/Ui";
import { shortDate } from "../lib/format";
import { useAsync } from "../lib/useAsync";

type PersonMeta = {
  heightCm: string;
  weightKg: string;
  allergies: string;
  medication: string;
  birthPlace: string;
  secondNationality: string;
  taxId: string;
  identificationNo: string;
  pensionNo: string;
  healthInsurance: string;
  healthInsuranceNo: string;
  idCardNo: string;
  passportNo: string;
  passportIssuedOn: string;
  passportExpiresOn: string;
  passportNo2: string;
  passportIssuedOn2: string;
  passportExpiresOn2: string;
  address: string;
  address2: string;
  iban: string;
};

const META_START = "[profile-meta]";
const META_END = "[/profile-meta]";

function parsePersonMeta(notes?: string | null): { meta: PersonMeta } {
  const empty: PersonMeta = {
    heightCm: "",
    weightKg: "",
    allergies: "",
    medication: "",
    birthPlace: "",
    secondNationality: "",
    taxId: "",
    identificationNo: "",
    pensionNo: "",
    healthInsurance: "",
    healthInsuranceNo: "",
    idCardNo: "",
    passportNo: "",
    passportIssuedOn: "",
    passportExpiresOn: "",
    passportNo2: "",
    passportIssuedOn2: "",
    passportExpiresOn2: "",
    address: "",
    address2: "",
    iban: "",
  };
  const text = notes ?? "";
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start < 0 || end < 0 || end <= start) return { meta: empty };

  const raw = text.slice(start + META_START.length, end).trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  const kv = new Map<string, string>();
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    kv.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }

  return {
    meta: {
      heightCm: kv.get("heightCm") ?? "",
      weightKg: kv.get("weightKg") ?? "",
      allergies: kv.get("allergies") ?? "",
      medication: kv.get("medication") ?? "",
      birthPlace: kv.get("birthPlace") ?? "",
      secondNationality: kv.get("secondNationality") ?? "",
      taxId: kv.get("taxId") ?? "",
      identificationNo: kv.get("identificationNo") ?? "",
      pensionNo: kv.get("pensionNo") ?? "",
      healthInsurance: kv.get("healthInsurance") ?? "",
      healthInsuranceNo: kv.get("healthInsuranceNo") ?? "",
      idCardNo: kv.get("idCardNo") ?? "",
      passportNo: kv.get("passportNo") ?? "",
      passportIssuedOn: kv.get("passportIssuedOn") ?? "",
      passportExpiresOn: kv.get("passportExpiresOn") ?? "",
      passportNo2: kv.get("passportNo2") ?? "",
      passportIssuedOn2: kv.get("passportIssuedOn2") ?? "",
      passportExpiresOn2: kv.get("passportExpiresOn2") ?? "",
      address: kv.get("address") ?? "",
      address2: kv.get("address2") ?? "",
      iban: kv.get("iban") ?? "",
    },
  };
}

function buildPersonNotes(meta: PersonMeta): string | null {
  const lines = [
    `heightCm:${meta.heightCm.trim()}`,
    `weightKg:${meta.weightKg.trim()}`,
    `allergies:${meta.allergies.trim()}`,
    `medication:${meta.medication.trim()}`,
    `birthPlace:${meta.birthPlace.trim()}`,
    `secondNationality:${meta.secondNationality.trim()}`,
    `taxId:${meta.taxId.trim()}`,
    `identificationNo:${meta.identificationNo.trim()}`,
    `pensionNo:${meta.pensionNo.trim()}`,
    `healthInsurance:${meta.healthInsurance.trim()}`,
    `healthInsuranceNo:${meta.healthInsuranceNo.trim()}`,
    `idCardNo:${meta.idCardNo.trim()}`,
    `passportNo:${meta.passportNo.trim()}`,
    `passportIssuedOn:${meta.passportIssuedOn.trim()}`,
    `passportExpiresOn:${meta.passportExpiresOn.trim()}`,
    `passportNo2:${meta.passportNo2.trim()}`,
    `passportIssuedOn2:${meta.passportIssuedOn2.trim()}`,
    `passportExpiresOn2:${meta.passportExpiresOn2.trim()}`,
    `address:${meta.address.trim()}`,
    `address2:${meta.address2.trim()}`,
    `iban:${meta.iban.trim()}`,
  ];
  const hasAnyMeta = lines.some((x) => x.split(":")[1]?.trim());
  if (!hasAnyMeta) return null;
  return `${META_START}\n${lines.join("\n")}\n${META_END}`;
}

const PERSON_ROLE_OPTIONS = [
  { value: "", label: "-" },
  { value: "Ich", label: "Ich" },
  { value: "Mutter", label: "Mutter" },
  { value: "Vater", label: "Vater" },
  { value: "Schwester", label: "Schwester" },
  { value: "Bruder", label: "Bruder" },
  { value: "Ehepartner", label: "Ehepartner" },
  { value: "Sohn", label: "Sohn" },
  { value: "Tochter", label: "Tochter" },
  { value: "Sonstige", label: "Sonstige" },
];

export default function Family() {
  const members = useAsync<FamilyMember[]>(() => api.get("/api/family-members"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [detailsMember, setDetailsMember] = useState<FamilyMember | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [closeDetailsOnBackdropClick, setCloseDetailsOnBackdropClick] = useState(false);

  async function addMember() {
    const values = await dialog.form({
      title: "Person hinzufügen",
      submitText: "Anlegen",
      fields: [
        { key: "sec-basic", label: "Basis", type: "section" },
        { key: "fullName", label: "Name" },
        { key: "relation", label: "Rolle", type: "select", options: PERSON_ROLE_OPTIONS },
        { key: "birthDate", label: "Geburtstag", type: "date" },
        { key: "nationality", label: "Staatsangehörigkeit" },
        { key: "secondNationality", label: "Zweite Staatsangehörigkeit" },
        { key: "birthPlace", label: "Geburtsort" },

        { key: "sec-docs", label: "Dokumente und Nummern", type: "section" },
        { key: "taxId", label: "Steuernummer" },
        { key: "identificationNo", label: "Identifikationsnummer" },
        { key: "pensionNo", label: "Rentenversicherungsnummer" },
        { key: "healthInsurance", label: "Krankenversicherung" },
        { key: "idCardNo", label: "Ausweisnummer" },
        { key: "jmbg", label: "JMBG" },
        { key: "passportNo", label: "Passnummer 1" },
        { key: "passportIssuedOn", label: "Pass 1 ausgestellt am", type: "date" },
        { key: "passportExpiresOn", label: "Pass 1 gültig bis", type: "date" },
        { key: "passportNo2", label: "Passnummer 2" },
        { key: "passportIssuedOn2", label: "Pass 2 ausgestellt am", type: "date" },
        { key: "passportExpiresOn2", label: "Pass 2 gültig bis", type: "date" },
        { key: "address", label: "Anschrift 1" },
        { key: "address2", label: "Anschrift 2" },
        { key: "iban", label: "IBAN" },

        { key: "sec-health", label: "Gesundheit", type: "section" },
        { key: "heightCm", label: "Größe (cm)", type: "number" },
        { key: "weightKg", label: "Gewicht (kg)", type: "number" },
        { key: "allergies", label: "Allergien" },
        { key: "medication", label: "Medikamente" },
      ],
      initial: {
        fullName: "",
        relation: "",
        birthDate: "",
        nationality: "",
        secondNationality: "",
        birthPlace: "",
        taxId: "",
        identificationNo: "",
        pensionNo: "",
        healthInsurance: "",
        healthInsuranceNo: "",
        idCardNo: "",
        jmbg: "",
        passportNo: "",
        passportIssuedOn: "",
        passportExpiresOn: "",
        passportNo2: "",
        passportIssuedOn2: "",
        passportExpiresOn2: "",
        address: "",
        address2: "",
        iban: "",
        heightCm: "",
        weightKg: "",
        allergies: "",
        medication: "",
      },
    });
    if (!values) return;
    if (!String(values.fullName).trim()) return;

    try {
      const notes = buildPersonNotes({
        heightCm: String(values.heightCm ?? ""),
        weightKg: String(values.weightKg ?? ""),
        allergies: String(values.allergies ?? ""),
        medication: String(values.medication ?? ""),
        birthPlace: String(values.birthPlace ?? ""),
        secondNationality: String(values.secondNationality ?? ""),
        taxId: String(values.taxId ?? ""),
        identificationNo: String(values.identificationNo ?? ""),
        pensionNo: String(values.pensionNo ?? ""),
        healthInsurance: String(values.healthInsurance ?? ""),
        healthInsuranceNo: String(values.healthInsuranceNo ?? ""),
        idCardNo: String(values.idCardNo ?? ""),
        passportNo: String(values.passportNo ?? ""),
        passportIssuedOn: String(values.passportIssuedOn ?? ""),
        passportExpiresOn: String(values.passportExpiresOn ?? ""),
        passportNo2: String(values.passportNo2 ?? ""),
        passportIssuedOn2: String(values.passportIssuedOn2 ?? ""),
        passportExpiresOn2: String(values.passportExpiresOn2 ?? ""),
        address: String(values.address ?? ""),
        address2: String(values.address2 ?? ""),
        iban: String(values.iban ?? ""),
      });

      await api.post("/api/family-members", {
        fullName: String(values.fullName).trim(),
        relation: String(values.relation).trim() || null,
        birthDate: String(values.birthDate).trim() || null,
        nationality: String(values.nationality).trim() || null,
        jmbg: String(values.jmbg ?? "").trim() || null,
        notes,
      });
      members.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editMember(m: FamilyMember) {
    const parsed = parsePersonMeta(m.notes);
    const values = await dialog.form({
      title: "Person bearbeiten",
      fields: [
        { key: "sec-basic", label: "Basis", type: "section" },
        { key: "fullName", label: "Name" },
        { key: "relation", label: "Rolle", type: "select", options: PERSON_ROLE_OPTIONS },
        { key: "birthDate", label: "Geburtstag", type: "date" },
        { key: "nationality", label: "Staatsangehörigkeit" },
        { key: "secondNationality", label: "Zweite Staatsangehörigkeit" },
        { key: "birthPlace", label: "Geburtsort" },

        { key: "sec-docs", label: "Dokumente und Nummern", type: "section" },
        { key: "taxId", label: "Steuernummer" },
        { key: "identificationNo", label: "Identifikationsnummer" },
        { key: "pensionNo", label: "Rentenversicherungsnummer" },
        { key: "healthInsurance", label: "Krankenversicherung" },
        { key: "idCardNo", label: "Ausweisnummer" },
        { key: "jmbg", label: "JMBG" },
        { key: "passportNo", label: "Passnummer 1" },
        { key: "passportIssuedOn", label: "Pass 1 ausgestellt am", type: "date" },
        { key: "passportExpiresOn", label: "Pass 1 gültig bis", type: "date" },
        { key: "passportNo2", label: "Passnummer 2" },
        { key: "passportIssuedOn2", label: "Pass 2 ausgestellt am", type: "date" },
        { key: "passportExpiresOn2", label: "Pass 2 gültig bis", type: "date" },
        { key: "address", label: "Anschrift 1" },
        { key: "address2", label: "Anschrift 2" },
        { key: "iban", label: "IBAN" },

        { key: "sec-health", label: "Gesundheit", type: "section" },
        { key: "heightCm", label: "Größe (cm)", type: "number" },
        { key: "weightKg", label: "Gewicht (kg)", type: "number" },
        { key: "allergies", label: "Allergien" },
        { key: "medication", label: "Medikamente" },
      ],
      initial: {
        fullName: m.fullName,
        relation: m.relation ?? "",
        birthDate: m.birthDate ?? "",
        nationality: m.nationality ?? "",
        secondNationality: parsed.meta.secondNationality,
        birthPlace: parsed.meta.birthPlace,
        taxId: parsed.meta.taxId,
        identificationNo: parsed.meta.identificationNo,
        pensionNo: parsed.meta.pensionNo,
        healthInsurance: parsed.meta.healthInsurance,
        healthInsuranceNo: parsed.meta.healthInsuranceNo,
        idCardNo: parsed.meta.idCardNo,
        jmbg: m.jmbg ?? "",
        passportNo: parsed.meta.passportNo,
        passportIssuedOn: parsed.meta.passportIssuedOn,
        passportExpiresOn: parsed.meta.passportExpiresOn,
        passportNo2: parsed.meta.passportNo2,
        passportIssuedOn2: parsed.meta.passportIssuedOn2,
        passportExpiresOn2: parsed.meta.passportExpiresOn2,
        address: parsed.meta.address,
        address2: parsed.meta.address2,
        iban: parsed.meta.iban,
        heightCm: parsed.meta.heightCm,
        weightKg: parsed.meta.weightKg,
        allergies: parsed.meta.allergies,
        medication: parsed.meta.medication,
      },
    });
    if (!values) return;

    try {
      const notes = buildPersonNotes({
        heightCm: String(values.heightCm ?? ""),
        weightKg: String(values.weightKg ?? ""),
        allergies: String(values.allergies ?? ""),
        medication: String(values.medication ?? ""),
        birthPlace: String(values.birthPlace ?? ""),
        secondNationality: String(values.secondNationality ?? ""),
        taxId: String(values.taxId ?? ""),
        identificationNo: String(values.identificationNo ?? ""),
        pensionNo: String(values.pensionNo ?? ""),
        healthInsurance: String(values.healthInsurance ?? ""),
        healthInsuranceNo: String(values.healthInsuranceNo ?? ""),
        idCardNo: String(values.idCardNo ?? ""),
        passportNo: String(values.passportNo ?? ""),
        passportIssuedOn: String(values.passportIssuedOn ?? ""),
        passportExpiresOn: String(values.passportExpiresOn ?? ""),
        passportNo2: String(values.passportNo2 ?? ""),
        passportIssuedOn2: String(values.passportIssuedOn2 ?? ""),
        passportExpiresOn2: String(values.passportExpiresOn2 ?? ""),
        address: String(values.address ?? ""),
        address2: String(values.address2 ?? ""),
        iban: String(values.iban ?? ""),
      });

      await api.put(`/api/family-members/${m.id}`, {
        ...m,
        fullName: String(values.fullName).trim(),
        relation: String(values.relation).trim() || null,
        birthDate: String(values.birthDate).trim() || null,
        nationality: String(values.nationality).trim() || null,
        jmbg: String(values.jmbg ?? "").trim() || null,
        notes,
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

  async function copyValue(field: string, value: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 1400);
    } catch {
      setError("Kopieren nicht möglich.");
    }
  }

  const membersWithAge = (members.data ?? [])
    .map((m) => ({ member: m, age: ageFromBirthDate(m.birthDate) }))
    .filter((x): x is { member: FamilyMember; age: number } => x.age !== null);
  const avgAge = membersWithAge.length > 0
    ? Math.round(membersWithAge.reduce((sum, x) => sum + x.age, 0) / membersWithAge.length)
    : null;
  const youngest = membersWithAge.length > 0
    ? membersWithAge.reduce((a, b) => (b.age < a.age ? b : a))
    : null;
  const oldest = membersWithAge.length > 0
    ? membersWithAge.reduce((a, b) => (b.age > a.age ? b : a))
    : null;

  return (
    <>
      <PageHead eyebrow="Familie" title="Wer zu wem gehört"
        lede="Personen, Familienstruktur und Altersverteilung deiner Familie." />
      <ErrorBar message={error ?? members.error} />

      <div className="chart-row">
        <FamilyTree members={members.data ?? []} />
        <AgeDistributionChart members={members.data ?? []} />
      </div>

      <div className="stats">
        <Stat label="Personen" value={String((members.data ?? []).length)} />
        <Stat label="Durchschnittsalter" value={avgAge !== null ? `${avgAge} Jahre` : "—"} />
        <Stat label="Jüngstes Mitglied" value={youngest?.member.fullName ?? "—"} note={youngest ? `${youngest.age} Jahre` : undefined} />
        <Stat label="Ältestes Mitglied" value={oldest?.member.fullName ?? "—"} note={oldest ? `${oldest.age} Jahre` : undefined} />
      </div>

      <Section title="Personen" action={<button className="btn icon-only" aria-label="Person hinzufügen" title="Person hinzufügen" onClick={addMember}><i className="fa-solid fa-plus" aria-hidden /><span className="sr-only">Person hinzufügen</span></button>}>
        {(members.data ?? []).length === 0
          ? <Empty title="Noch keine Personen." hint="Lege Familienmitglieder an, um Termine und Dokumente zuzuordnen." />
          : <div className="card">
              <div className="table-scroll rtable-desktop">
                <table>
                  <thead><tr><th>Name</th><th>Rolle</th><th>Geburtstag</th><th className="num action-col">Aktion</th></tr></thead>
                  <tbody>
                    {(members.data ?? []).map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.fullName}</strong></td>
                        <td>{m.relation ?? "—"}</td>
                        <td>{shortDate(m.birthDate)}</td>
                        <td className="num action-cell">
                          <div className="action-stack">
                          <button
                            className="btn ghost small icon-only"
                            aria-label="Personendetails"
                            title="Personendetails"
                            onClick={() => {
                              setCopiedField(null);
                              setDetailsMember(m);
                            }}
                          >
                            <i className="fa-solid fa-circle-info" aria-hidden />
                            <span className="sr-only">Personendetails</span>
                          </button>{" "}
                          <button className="btn ghost small icon-only" aria-label="Person bearbeiten" title="Person bearbeiten" onClick={() => editMember(m)}>
                            <i className="fa-solid fa-pen-to-square" aria-hidden />
                            <span className="sr-only">Bearbeiten</span>
                          </button>{" "}
                          <button className="btn danger small icon-only" aria-label="Person löschen" title="Person löschen" onClick={() => removeMember(m.id)}>
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
                {(members.data ?? []).map((m) => (
                  <div key={`m-${m.id}`} className="mobile-card">
                    <div className="mobile-card-head">
                      <strong>{m.fullName}</strong>
                      <span className="badge">{m.relation ?? "—"}</span>
                    </div>
                    <div className="alert-msg">Geburtstag: {shortDate(m.birthDate)}</div>
                    <div className="action-stack mobile-card-actions">
                      <button
                        className="btn ghost small icon-only"
                        aria-label="Personendetails"
                        title="Personendetails"
                        onClick={() => {
                          setCopiedField(null);
                          setDetailsMember(m);
                        }}
                      >
                        <i className="fa-solid fa-circle-info" aria-hidden />
                        <span className="sr-only">Personendetails</span>
                      </button>
                      <button className="btn ghost small icon-only" aria-label="Person bearbeiten" title="Person bearbeiten" onClick={() => editMember(m)}>
                        <i className="fa-solid fa-pen-to-square" aria-hidden />
                        <span className="sr-only">Bearbeiten</span>
                      </button>
                      <button className="btn danger small icon-only" aria-label="Person löschen" title="Person löschen" onClick={() => removeMember(m.id)}>
                        <i className="fa-solid fa-trash" aria-hidden />
                        <span className="sr-only">Löschen</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>}
      </Section>

      {detailsMember && (
        <div
          className="dlg-backdrop"
          role="presentation"
          onMouseDown={(e) => setCloseDetailsOnBackdropClick(e.target === e.currentTarget)}
          onClick={(e) => {
            if (e.target === e.currentTarget && closeDetailsOnBackdropClick) {
              setDetailsMember(null);
            }
            setCloseDetailsOnBackdropClick(false);
          }}
        >
          <div className="dlg person-details-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <h3>Personendetails</h3>
            </div>
            {copiedField && <div className="badge green" style={{ marginBottom: 8 }}>{copiedField} kopiert</div>}
            <div className="form-grid person-details-grid" style={{ marginBottom: 10 }}>
              {(() => {
                const meta = parsePersonMeta(detailsMember.notes).meta;
                const groups = [
                  {
                    title: "Basis",
                    rows: [
                      ["Name", detailsMember.fullName],
                      ["Rolle", detailsMember.relation ?? ""],
                      ["Geburtsdatum", shortDate(detailsMember.birthDate)],
                      ["Geburtsort", meta.birthPlace],
                      ["Staatsangehörigkeit", detailsMember.nationality ?? ""],
                      ["Zweite Staatsangehörigkeit", meta.secondNationality],
                    ],
                  },
                  {
                    title: "Dokumente und Nummern",
                    rows: [
                      ["Steuernummer", meta.taxId],
                      ["Identifikationsnummer", meta.identificationNo],
                      ["Rentenversicherungsnummer", meta.pensionNo],
                      ["Ausweisnummer", meta.idCardNo],
                      ["JMBG", detailsMember.jmbg ?? ""],
                      ["Passnummer 1", meta.passportNo],
                      ["Pass 1 ausgestellt am", shortDate(meta.passportIssuedOn || null)],
                      ["Pass 1 gültig bis", shortDate(meta.passportExpiresOn || null)],
                      ["Passnummer 2", meta.passportNo2],
                      ["Pass 2 ausgestellt am", shortDate(meta.passportIssuedOn2 || null)],
                      ["Pass 2 gültig bis", shortDate(meta.passportExpiresOn2 || null)],
                      ["Krankenversicherung", meta.healthInsurance],
                      ["Anschrift 1", meta.address],
                      ["Anschrift 2", meta.address2],
                      ["IBAN", meta.iban],
                    ],
                  },
                  {
                    title: "Gesundheit",
                    rows: [
                      ["Größe (cm)", meta.heightCm],
                      ["Gewicht (kg)", meta.weightKg],
                      ["Allergien", meta.allergies],
                      ["Medikamente", meta.medication],
                    ],
                  },
                ] as Array<{ title: string; rows: Array<[string, string]> }>;

                return groups.flatMap((group) => [
                  <div key={`group-${group.title}`} className="dlg-section-title">{group.title}</div>,
                  ...group.rows.map(([label, value]) => {
                    const copied = copiedField === label;
                    const isCodeLikeField = [
                      "Steuernummer",
                      "Identifikationsnummer",
                      "Rentenversicherungsnummer",
                      "Ausweisnummer",
                      "JMBG",
                      "Passnummer 1",
                      "Passnummer 2",
                      "IBAN",
                    ].includes(label);
                    return (
                      <div key={label} className="person-detail-row">
                        <div className="person-detail-label">{label}</div>
                        <div className={`person-detail-value${isCodeLikeField ? " is-code" : ""}`} title={value || ""}>{value || "—"}</div>
                        <button
                          className="btn ghost small icon-only"
                          onClick={() => { void copyValue(label, value); }}
                          disabled={!value}
                          aria-label={copied ? `${label} kopiert` : `${label} kopieren`}
                          title={copied ? "Kopiert" : "Kopieren"}
                        >
                          <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} aria-hidden />
                          <span className="sr-only">{copied ? "Kopiert" : "Kopieren"}</span>
                        </button>
                      </div>
                    );
                  }),
                ]);
              })()}
            </div>
            <div className="dlg-actions">
              <button className="btn" onClick={() => setDetailsMember(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
