import { Link } from "react-router-dom";

const updatedAt = "27.08.2026";

export default function TermsOfService() {
  return (
    <div className="legal-page">
      <div className="legal-card card">
        <p className="eyebrow">Rechtliches</p>
        <h1>Nutzungsbedingungen</h1>
        <p className="lede">Stand: {updatedAt}</p>

        <section>
          <h2>1. Geltungsbereich</h2>
          <p>
            Diese Nutzungsbedingungen gelten für die Nutzung von Life Dashboard durch registrierte Nutzerinnen
            und Nutzer.
          </p>
        </section>

        <section>
          <h2>2. Leistungen</h2>
          <p>
            Life Dashboard stellt Funktionen für Organisation, Fristenverwaltung und persönliche Planung bereit.
          </p>
        </section>

        <section>
          <h2>3. Pflichten der Nutzer</h2>
          <p>
            Nutzer sind verantwortlich für die Richtigkeit ihrer Eingaben und dafür, keine rechtswidrigen Inhalte
            hochzuladen oder zu verbreiten.
          </p>
        </section>

        <section>
          <h2>4. Verfügbarkeit</h2>
          <p>
            Es besteht kein Anspruch auf unterbrechungsfreie Verfügbarkeit. Wartung, Updates und Störungen sind
            möglich.
          </p>
        </section>

        <section>
          <h2>5. Haftung</h2>
          <p>
            Die Nutzung erfolgt auf eigenes Risiko. Der Betreiber haftet nur im gesetzlich zulässigen Umfang.
          </p>
        </section>

        <section>
          <h2>6. Änderungen</h2>
          <p>
            Der Betreiber kann diese Bedingungen anpassen. Die jeweils aktuelle Version wird unter dieser URL
            veröffentlicht.
          </p>
        </section>

        <section>
          <h2>7. Kontakt</h2>
          <p>
            Ergänze hier Name/Firma und Kontakt-E-Mail des Betreibers.
          </p>
        </section>

        <div className="legal-links">
          <Link to="/privacy">Zur Datenschutzerklärung</Link>
          <Link to="/">Zur App</Link>
        </div>
      </div>
    </div>
  );
}
