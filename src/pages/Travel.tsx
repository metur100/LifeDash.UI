import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { PackingItem, Trip } from "../api/types";
import { useDialog } from "../components/Dialog";
import { Empty, ErrorBar, PageHead, Section, Stat } from "../components/Ui";
import { countdown, dateTime, daysUntil, euro, shortDate } from "../lib/format";
import { useAsync } from "../lib/useAsync";

function toLocalDateTimeInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function fromDateTimeInput(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length === 16) return `${raw}:00`;
  return raw;
}

function tripPickerLabel(trip: Trip) {
  return `${trip.title} - ${trip.destination ?? "Ziel offen"} - ${shortDate(trip.startsOn)}`;
}

type NearbyPlace = { name?: string; formatted_address?: string; rating?: number };
type RouteSummary = { distance: string; duration: string };

function googleMaps() {
  return (window as unknown as { google?: { maps?: any } }).google?.maps;
}

let googleMapsScript: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string) {
  if (googleMaps()) return Promise.resolve();
  if (googleMapsScript) return googleMapsScript;

  googleMapsScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=de`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
  return googleMapsScript;
}

function DestinationMap({ startPlace, destination, apiKey }: { startPlace?: string | null; destination: string; apiKey: string }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNearby([]);
    setRoute(null);
    setError(null);

    void (async () => {
      try {
        await loadGoogleMaps(apiKey);
        if (cancelled || !mapElement.current) return;
        const maps = googleMaps();
        if (!maps) throw new Error("Google Maps wurde nicht initialisiert.");

        const geocoder = new maps.Geocoder();
        const response = await geocoder.geocode({ address: destination });
        const result = response.results?.[0];
        if (!result) throw new Error("Das Reiseziel konnte nicht auf der Karte gefunden werden.");

        const map = new maps.Map(mapElement.current, {
          center: result.geometry.location,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        new maps.Marker({ map, position: result.geometry.location, title: destination });

        if (startPlace) {
          const directions = new maps.DirectionsService();
          directions.route({ origin: startPlace, destination, travelMode: maps.TravelMode.DRIVING }, (routeResult: any, status: string) => {
            if (cancelled || status !== maps.DirectionsStatus.OK || !routeResult) return;
            new maps.DirectionsRenderer({ map, suppressMarkers: false }).setDirections(routeResult);
            const leg = routeResult.routes?.[0]?.legs?.[0];
            if (leg?.distance?.text && leg?.duration?.text) setRoute({ distance: leg.distance.text, duration: leg.duration.text });
          });
        }

        const places = new maps.places.PlacesService(map);
        places.textSearch({ query: `Sehenswürdigkeiten in ${destination}` }, (results: NearbyPlace[] | null, status: string) => {
          if (cancelled || status !== maps.places.PlacesServiceStatus.OK) return;
          setNearby((results ?? []).slice(0, 5));
        });
      } catch (exception) {
        if (!cancelled) setError((exception as Error).message);
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, destination, startPlace]);

  return (
    <Section title="Karte und Orte">
      {error ? <ErrorBar message={error} /> : <div ref={mapElement} className="destination-map" aria-label={`Karte von ${destination}`} />}
      {route && <div className="route-summary"><i className="fa-solid fa-route" aria-hidden /><strong>{startPlace} nach {destination}</strong><span>{route.distance} · ca. {route.duration} mit dem Auto</span></div>}
      {nearby.length > 0 && (
        <div className="card-list nearby-places">
          {nearby.map((place, index) => (
            <div key={`${place.name}-${index}`} className="nearby-place">
              <strong>{place.name}</strong>
              <span>{place.formatted_address}{place.rating ? ` · ${place.rating}/5` : ""}</span>
            </div>
          ))}
        </div>
      )}
      <a className="btn ghost small" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`} target="_blank" rel="noreferrer">
        In Google Maps öffnen <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
      </a>
    </Section>
  );
}

export default function Travel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const trips = useAsync<Trip[]>(() => api.get("/api/trips"), []);
  const dialog = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [tripSearch, setTripSearch] = useState("");
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const googleMapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();

  const list = trips.data ?? [];
  const trip = id
    ? list.find((t) => t.id === Number(id))
    : (selectedTripId ? list.find((t) => t.id === selectedTripId) : undefined)
      ?? list.find((t) => daysUntil(t.startsOn)! >= 0)
      ?? list[0];

  useEffect(() => {
    if (trip) setTripSearch(tripPickerLabel(trip));
  }, [trip?.id]);

  function selectTrip(value: string) {
    setTripSearch(value);
    const selectedTrip = list.find((item) => tripPickerLabel(item) === value);
    if (!selectedTrip) return;
    setSelectedTripId(selectedTrip.id);
    setTripPickerOpen(false);
    navigate(`/travel/${selectedTrip.id}`);
  }

  const matchingTrips = list.filter((item) => tripPickerLabel(item).toLocaleLowerCase().includes(tripSearch.toLocaleLowerCase()));

  async function createTrip() {
    const values = await dialog.form({
      title: "Reise anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Reisetitel" },
        { key: "startPlace", label: "Startort" },
        { key: "destination", label: "Ziel" },
        { key: "startsOn", label: "Start", type: "date" },
        { key: "endsOn", label: "Ende", type: "date" },
        { key: "budget", label: "Budget", type: "number" },
      ],
      initial: {
        title: "",
        startPlace: "",
        destination: "",
        startsOn: "",
        endsOn: "",
        budget: "",
      },
    });
    if (!values) return;

    const title = String(values.title).trim();
    const startsOn = String(values.startsOn).trim();
    if (!title || !startsOn) return;

    try {
      const created = await api.post<Trip>("/api/trips", {
        title,
        startPlace: String(values.startPlace).trim() || null,
        destination: String(values.destination).trim() || null,
        startsOn,
        endsOn: String(values.endsOn).trim() || null,
        status: "planned",
        budget: String(values.budget).trim() ? Number(values.budget) : null,
        bookings: [],
        packingItems: [],
      });
      await trips.reload();
      setSelectedTripId(created.id);
      navigate(`/travel/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function togglePacked(t: Trip, item: PackingItem) {
    try {
      await api.put(`/api/trips/${t.id}/packing/${item.id}`, { ...item, isPacked: !item.isPacked });
      trips.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function addItem(t: Trip) {
    const values = await dialog.form({
      title: "Packlisten-Eintrag anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "name", label: "Eintrag" },
        { key: "quantity", label: "Anzahl", type: "number" },
        { key: "category", label: "Kategorie" },
      ],
      initial: {
        name: "",
        quantity: "1",
        category: "",
      },
    });
    if (!values) return;
    if (!String(values.name).trim()) return;

    try {
      await api.post(`/api/trips/${t.id}/packing`, {
        name: String(values.name).trim(),
        quantity: Number(values.quantity || 1),
        category: String(values.category).trim() || null,
        isPacked: false,
      });
      trips.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editTrip(t: Trip) {
    const values = await dialog.form({
      title: "Reise bearbeiten",
      fields: [
        { key: "title", label: "Reisetitel" },
        { key: "startPlace", label: "Startort" },
        { key: "destination", label: "Ziel" },
        { key: "startsOn", label: "Start", type: "date" },
        { key: "endsOn", label: "Ende", type: "date" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "planned", label: "planned" },
            { value: "booked", label: "booked" },
            { value: "done", label: "done" },
          ],
        },
      ],
      initial: {
        title: t.title,
        startPlace: t.startPlace ?? "",
        destination: t.destination ?? "",
        startsOn: t.startsOn,
        endsOn: t.endsOn ?? "",
        status: t.status,
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/trips/${t.id}`, {
        ...t,
        title: String(values.title).trim(),
        startPlace: String(values.startPlace).trim() || null,
        destination: String(values.destination).trim() || null,
        startsOn: String(values.startsOn),
        endsOn: String(values.endsOn).trim() || null,
        status: String(values.status),
      });
      trips.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeTrip(id: number) {
    const ok = await dialog.confirm({ title: "Reise löschen", message: "Reise wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/trips/${id}`);
      const remainingTrips = list.filter((trip) => trip.id !== id);
      const nextTrip = remainingTrips[0];
      setSelectedTripId(nextTrip?.id ?? null);
      setTripSearch(nextTrip ? tripPickerLabel(nextTrip) : "");
      await trips.reload();
      navigate(nextTrip ? `/travel/${nextTrip.id}` : "/travel", { replace: true });
    } catch (e) { setError((e as Error).message); }
  }

  async function editBooking(t: Trip, id: number) {
    const b = t.bookings.find((x) => x.id === id);
    if (!b) return;
    const values = await dialog.form({
      title: "Buchung bearbeiten",
      fields: [
        { key: "title", label: "Buchungstitel" },
        {
          key: "kind",
          label: "Art",
          type: "select",
          options: [
            { value: "flight", label: "flight" },
            { value: "hotel", label: "hotel" },
            { value: "train", label: "train" },
            { value: "car", label: "car" },
            { value: "activity", label: "activity" },
          ],
        },
        { key: "startsAt", label: "Start", type: "datetime-local" },
        { key: "amount", label: "Betrag", type: "number" },
      ],
      initial: {
        title: b.title,
        kind: b.kind,
        startsAt: toLocalDateTimeInput(b.startsAt),
        amount: b.amount?.toString() ?? "",
      },
    });
    if (!values) return;

    try {
      await api.put(`/api/trips/${t.id}/bookings/${b.id}`, {
        ...b,
        title: String(values.title).trim(),
        kind: String(values.kind),
        startsAt: fromDateTimeInput(values.startsAt),
        amount: String(values.amount).trim() ? Number(values.amount) : null,
      });
      trips.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeBooking(t: Trip, bookingId: number) {
    const ok = await dialog.confirm({ title: "Buchung löschen", message: "Buchung wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/trips/${t.id}/bookings/${bookingId}`);
      trips.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function addBooking(t: Trip) {
    const values = await dialog.form({
      title: "Buchung anlegen",
      submitText: "Anlegen",
      fields: [
        { key: "title", label: "Buchungstitel" },
        {
          key: "kind",
          label: "Art",
          type: "select",
          options: [
            { value: "flight", label: "flight" },
            { value: "hotel", label: "hotel" },
            { value: "train", label: "train" },
            { value: "car", label: "car" },
            { value: "activity", label: "activity" },
          ],
        },
        { key: "startsAt", label: "Start", type: "datetime-local" },
        { key: "amount", label: "Betrag", type: "number" },
      ],
      initial: {
        title: "",
        kind: "flight",
        startsAt: "",
        amount: "",
      },
    });
    if (!values) return;

    const title = String(values.title).trim();
    if (!title) return;
    try {
      await api.post(`/api/trips/${t.id}/bookings`, {
        title,
        kind: String(values.kind),
        startsAt: fromDateTimeInput(values.startsAt),
        amount: String(values.amount).trim() ? Number(values.amount) : null,
        currency: "EUR",
      });
      trips.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function editPacking(t: Trip, p: PackingItem) {
    const values = await dialog.form({
      title: "Packlisten-Eintrag bearbeiten",
      fields: [
        { key: "name", label: "Eintrag" },
        { key: "quantity", label: "Anzahl", type: "number" },
        { key: "category", label: "Kategorie" },
      ],
      initial: {
        name: p.name,
        quantity: String(p.quantity),
        category: p.category ?? "",
      },
    });
    if (!values) return;
    try {
      await api.put(`/api/trips/${t.id}/packing/${p.id}`, {
        ...p,
        name: String(values.name).trim(),
        quantity: Number(values.quantity),
        category: String(values.category).trim() || null,
      });
      trips.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removePacking(t: Trip, packingId: number) {
    const ok = await dialog.confirm({ title: "Packlisten-Eintrag löschen", message: "Packlisten-Eintrag wirklich löschen?", confirmText: "Löschen", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/trips/${t.id}/packing/${packingId}`);
      trips.reload();
    } catch (e) { setError((e as Error).message); }
  }

  if (trips.loading) return <p className="lede">Wird geladen …</p>;

  if (!trip) {
    return (
      <>
        <PageHead eyebrow="Reisen" title="Noch keine Reise geplant"
          action={<button className="btn icon-only" aria-label="Reise anlegen" title="Reise anlegen" onClick={createTrip}>
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Reise anlegen</span>
          </button>} />
        <ErrorBar message={error ?? trips.error} />
        <Empty title="Keine Reise angelegt." hint="Sobald eine Reise existiert, erscheinen hier Buchungen und Packliste." />
      </>
    );
  }

  const days = daysUntil(trip.startsOn);
  const packed = trip.packingItems.filter((p) => p.isPacked).length;
  const spend = trip.bookings.reduce((s, b) => s + (b.amount ?? 0), 0);

  return (
    <>
      {list.length > 0 && <div className="trip-picker">
        <label htmlFor="trip-picker">Reise auswählen</label>
        <div><i className="fa-solid fa-magnifying-glass" aria-hidden /><input id="trip-picker" value={tripSearch} onFocus={() => setTripPickerOpen(true)} onChange={(event) => { setTripSearch(event.target.value); setTripPickerOpen(true); }} onBlur={() => window.setTimeout(() => setTripPickerOpen(false), 150)} placeholder="Reise suchen" autoComplete="off" />{tripSearch && <button className="trip-picker-clear" type="button" aria-label="Reisesuche löschen" title="Reisesuche löschen" onMouseDown={(event) => event.preventDefault()} onClick={() => { setTripSearch(""); setTripPickerOpen(true); }}><i className="fa-solid fa-xmark" aria-hidden /></button>}</div>
        {tripPickerOpen && <div className="trip-picker-results" role="listbox" aria-label="Reise-Ergebnisse">
          {matchingTrips.length === 0 ? <span>Keine Reise gefunden.</span> : matchingTrips.map((item) => <button key={item.id} type="button" role="option" aria-selected={item.id === trip.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectTrip(tripPickerLabel(item))}><strong>{item.title}</strong><span>{item.destination ?? "Ziel offen"} · {shortDate(item.startsOn)}</span></button>)}
        </div>}
      </div>}
      <PageHead eyebrow="Reisen" title={trip.title}
        lede={`${trip.destination ?? "Ziel offen"} · ${shortDate(trip.startsOn)} – ${shortDate(trip.endsOn)}`}
        action={<>
          <button className="btn icon-only" aria-label="Reise anlegen" title="Reise anlegen" onClick={createTrip}>
            <i className="fa-solid fa-plus" aria-hidden />
            <span className="sr-only">Reise anlegen</span>
          </button>{" "}
          <button className="btn ghost icon-only" aria-label="Reise bearbeiten" title="Reise bearbeiten" onClick={() => editTrip(trip)}>
            <i className="fa-solid fa-pen-to-square" aria-hidden />
            <span className="sr-only">Reise bearbeiten</span>
          </button>{" "}
          <button className="btn danger icon-only" aria-label="Reise löschen" title="Reise löschen" onClick={() => removeTrip(trip.id)}>
            <i className="fa-solid fa-trash" aria-hidden />
            <span className="sr-only">Reise löschen</span>
          </button>
        </>} />
      <ErrorBar message={error ?? trips.error} />

      <div className="stats">
        <Stat label="Abreise" value={countdown(days)} note={shortDate(trip.startsOn)} />
        <Stat label="Gepackt" value={`${packed}/${trip.packingItems.length}`}
              note={packed === trip.packingItems.length ? "vollständig" : "noch offen"} />
        <Stat label="Gebucht" value={euro(spend)} note={`${trip.bookings.length} Buchungen`} />
        {trip.budget && <Stat label="Budget" value={euro(trip.budget)}
              tone={spend > trip.budget ? "neg" : "pos"} note={`${euro(trip.budget - spend)} übrig`} />}
      </div>

        {trip.destination && googleMapsApiKey && <DestinationMap startPlace={trip.startPlace} destination={trip.destination} apiKey={googleMapsApiKey} />}
        {trip.destination && !googleMapsApiKey && (
          <Section title="Karte und Orte">
            <div className="map-setup">
              <i className="fa-solid fa-map-location-dot" aria-hidden />
              <div><strong>Karte für {trip.destination}</strong><span>Füge `VITE_GOOGLE_MAPS_API_KEY` in der Frontend-Umgebung hinzu, damit die Karte und Orte geladen werden.</span></div>
            </div>
          </Section>
        )}

      <div className="grid-2">
        <Section title="Buchungen">
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              <div className="spacer" />
              <button className="btn ghost small icon-only" aria-label="Buchung anlegen" title="Buchung anlegen" onClick={() => addBooking(trip)}>
                <i className="fa-solid fa-plus" aria-hidden />
                <span className="sr-only">Buchung anlegen</span>
              </button>
            </div>
            {trip.bookings.length === 0
              ? <Empty title="Noch nichts gebucht." hint="Flüge, Hotels und Mietwagen landen hier." />
              : <>
                <div className="table-scroll rtable-desktop">
                  <table>
                    <thead><tr><th>Buchung</th><th className="num">Betrag</th><th className="num action-col">Aktion</th></tr></thead>
                    <tbody>
                      {trip.bookings.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.title}</strong>
                            <div className="alert-msg">
                              <span className="badge">{b.kind}</span>{" "}
                              {b.referenceNo ? `Nr. ${b.referenceNo} · ` : ""}{dateTime(b.startsAt)}
                            </div>
                          </td>
                          <td className="num">{b.amount ? euro(b.amount, b.currency) : "—"}</td>
                          <td className="num action-cell">
                            <div className="action-stack">
                            <button className="btn ghost small icon-only" aria-label="Buchung bearbeiten" title="Buchung bearbeiten" onClick={() => editBooking(trip, b.id)}>
                              <i className="fa-solid fa-pen-to-square" aria-hidden />
                              <span className="sr-only">Bearbeiten</span>
                            </button>{" "}
                            <button className="btn danger small icon-only" aria-label="Buchung löschen" title="Buchung löschen" onClick={() => removeBooking(trip, b.id)}>
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
                  {trip.bookings.map((b) => (
                    <div key={`m-${b.id}`} className="mobile-card">
                      <div className="mobile-card-head">
                        <strong>{b.title}</strong>
                        <span className="badge">{b.amount ? euro(b.amount, b.currency) : "—"}</span>
                      </div>
                      <div className="alert-msg">
                        <span className="badge">{b.kind}</span>{" "}
                        {b.referenceNo ? `Nr. ${b.referenceNo} · ` : ""}{dateTime(b.startsAt)}
                      </div>
                      <div className="action-stack mobile-card-actions">
                        <button className="btn ghost small icon-only" aria-label="Buchung bearbeiten" title="Buchung bearbeiten" onClick={() => editBooking(trip, b.id)}>
                          <i className="fa-solid fa-pen-to-square" aria-hidden />
                          <span className="sr-only">Bearbeiten</span>
                        </button>
                        <button className="btn danger small icon-only" aria-label="Buchung löschen" title="Buchung löschen" onClick={() => removeBooking(trip, b.id)}>
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

        <Section title="Packliste">
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              <div className="spacer" />
              <button className="btn ghost small icon-only" aria-label="Packlisten-Eintrag anlegen" title="Packlisten-Eintrag anlegen" onClick={() => addItem(trip)}>
                <i className="fa-solid fa-plus" aria-hidden />
                <span className="sr-only">Packlisten-Eintrag anlegen</span>
              </button>
            </div>
            <ul className="checklist">
              {trip.packingItems.map((p) => (
                <li key={p.id} className={p.isPacked ? "" : "missing"}>
                  <input type="checkbox" checked={p.isPacked} style={{ width: 16 }}
                         aria-label={`${p.name} gepackt`}
                         onChange={() => togglePacked(trip, p)} />
                  <span style={{ textDecoration: p.isPacked ? "line-through" : "none" }}>
                    {p.name}{p.quantity > 1 ? ` ×${p.quantity}` : ""}
                  </span>
                  <button className="btn ghost small icon-only" aria-label="Packlisten-Eintrag bearbeiten" title="Packlisten-Eintrag bearbeiten" onClick={() => editPacking(trip, p)}>
                    <i className="fa-solid fa-pen-to-square" aria-hidden />
                    <span className="sr-only">Bearbeiten</span>
                  </button>
                  <button className="btn danger small icon-only" aria-label="Packlisten-Eintrag löschen" title="Packlisten-Eintrag löschen" onClick={() => removePacking(trip, p.id)}>
                    <i className="fa-solid fa-trash" aria-hidden />
                    <span className="sr-only">Löschen</span>
                  </button>
                  {p.category && <><div className="spacer" /><span className="badge">{p.category}</span></>}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      </div>

    </>
  );
}
