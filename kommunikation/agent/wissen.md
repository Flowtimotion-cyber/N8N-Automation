# Wissensbasis Chat-Assistent HermetikFlow (WhatsApp, später Website, Instagram, LinkedIn)

Stand: 26.10.2026 · Entwurf zur Prüfung durch Timo · Quellen am Ende.
Regel für den Assistenten: Nur was hier steht, darf als Tatsache gesagt werden. Alles andere → „Das klärt [Karsten/Timo] im Gespräch genau.“

## 1. Wer wir sind

**HermetikFlow** ist der gemeinsame Kanal von zwei Partnern:

- **Momentum KI Akademie** – geförderte KI-Weiterbildung für Mitarbeitende in kleinen und mittelständischen Unternehmen. Ein Angebot der Immo-Job GmbH (Bildungsträger, Stuttgart). Kooperationspartner ist die TEMP.Akademie: Kurse 2026 laufen über die TEMP.Akademie, Terminbestätigung und Unterlagen kommen 2026 von dort. Ab Januar 2027 läuft alles direkt über die Momentum KI Akademie.
- **Hermetik Marketing** (Tuttlingen) – Umsetzungspartner: baut KI-Agenten, n8n-Automationen und CRM-Systeme, die im Betrieb dauerhaft weiterlaufen. Positionierung: eigene Systeme statt vieler SaaS-Abos, „lernende Unternehmenssysteme“, Kernversprechen Klarheit. Zielgruppe: inhabergeführte KMU, etwa 10–100 Mitarbeitende.

**Das Besondere (USP):** System und geförderte Schulung aus einer Hand. Das Team lernt in einer zugelassenen Weiterbildung, und am Ende laufen echte Agenten im eigenen Betrieb – keine Theorie, die nach dem Kurs liegen bleibt.

**Team (nur bei Nachfrage nennen):**
- Timo Merz – Geschäftsführer und Dozent, betreibt die Systeme selbst, Strategiecall.
- Karsten – Vertrieb, Fördervorgespräch.
- Lillien Floe Longin – Dozentin, Schwerpunkt KI-Agenten und Automatisierung.
- Kurt – IT-Experte, Physiker und Softwareentwickler, über 25 Jahre Erfahrung.
- Murat – Geschäftsführer der TEMP.Akademie, Mitentwickler des Curriculums.

Regionen: Tuttlingen und Stuttgart, Schulung online oder vor Ort.

## 2. Die zwei Wege (Begrüßung)

1. **Mitarbeiterschulung** (Momentum): geförderte KI-Qualifizierung nach dem Qualifizierungschancengesetz.
2. **Umsetzung** (Hermetik): Agenten und Automationen bauen lassen.

Auf der Website gibt es drei Varianten:
- **Qualifizierung:** Module 1–8, Zertifikat, Lernplattform. Förderfähig nach QCG.
- **Qualifizierung + Umsetzung** (am häufigsten gewählt): alles aus der Qualifizierung, dazu drei laufende Agentensysteme, gemeinsam aufgesetzt. Der Schulungsteil ist gefördert.
- **Nur Umsetzung:** Wir bauen, das Team arbeitet weiter. Nicht gefördert.

Eigenanteil und Preise: **auf Anfrage**. Der Assistent nennt nie Preise oder Eigenanteile. Umsetzungspreise sind individuell und hängen davon ab, welchen Hebel wir im Betrieb ansetzen; das klärt das Gespräch.

## 3. Weiterbildung (Momentum KI Akademie)

- Format: digital, 39 Wochen, 780 Unterrichtseinheiten, höchstens 12 Personen je Gruppe, Abschluss mit Trägerzertifikat.
- Förderfähig nach § 82 SGB III (Qualifizierungschancengesetz). **Frage nach Zertifizierung/Träger:** „Die Weiterbildung ist AZAV-zugelassen und läuft dieses Jahr über unseren zertifizierten Kooperationspartner TEMP.Akademie. Ab Januar 2027 läuft sie direkt über die Momentum KI Akademie.“ Keine Maßnahmennummern nennen; mehr dazu im Vorgespräch.
- Ab 2027 bleibt die Struktur gleich, mit etwas mehr Gewicht auf Claude Code, dem persönlichen Hermes-Agenten und n8n.
- Curriculum, 8 Module, jedes endet mit einem Ergebnis im eigenen Betrieb:
  1. Orientierung: Was KI 2026 wirklich kann
  2. Der eigene Prozess (hier wird festgelegt, welche Agenten entstehen)
  3. Kontext statt Prompt-Kunst
  4. Marketing mit KI
  5. Automatisierung mit n8n
  6. Agentensysteme
  7. Vertrieb & CRM mit KI
  8. Führen mit KI
- Werkzeuge, die vorkommen: ChatGPT, Claude, Claude Code, Codex, Perplexity, Notion, Obsidian, n8n, Make.com, Zapier, Miro, Whimsical, Gamma, Midjourney, HeyGen, Brevo, lokale Modelle mit Ollama und LM Studio, Agenten wie Hermes.
- Für wen: Fachkräfte aus allen Abteilungen (Fertigung, Vertrieb, Marketing, Einkauf, HR, Verwaltung). Wer schon tiefer drin ist, setzt mit dem Dozenten eigene Praxisprojekte um.
- Typische Anwendungen je Abteilung: Fertigungsunterlagen und Kapazitätsplanung · Angebote, Margenkalkulation, CRM-Automatisierung · Content, Social Media, Marktanalyse · Lieferantenrecherche, Bestellabwicklung · Onboarding, Kompetenzprofile · Dokumentenmanagement, Reporting, E-Mail-Automatisierung.
- Kostenlos zum Reinschnuppern: **Modul 1** (ca. 20 Min., ohne Anmeldung und ohne E-Mail) mit den Grundlagen zu KI-Agenten, Claude Code, n8n, MCP und Datenschutz: https://flowtimotion-cyber.github.io/N8N-Automation/unternehmer/

## 4. Umsetzung (Hermetik Marketing)

- **KI-Agenten für wiederkehrende Arbeit**, zum Beispiel:
  - Anfragen-Wächter: sortiert Anfragen, beantwortet Standardfälle (Beispielwert ca. 4 Std./Woche).
  - Firmen-Gedächtnis: Wissenssystem (RAG) auf Supabase, optional mit Obsidian (Beispielwert ca. 3 Std./Woche).
  - Wochen-Lagebericht: zieht Daten aus CRM, Kalender und Postfach (Beispielwert ca. 2 Std./Woche).
  Die Stundenwerte sind Beispiele der Website, keine Zusage.
- **n8n-Automationen und Agentenarchitektur**, auf eigenem oder gemietetem Server.
- **Unsere Empfehlung für Automationen: n8n auf dem eigenen Server** (z. B. in Deutschland), gesteuert mit KI-Agenten. Gründe: Datenschutz (die Daten bleiben auf dem eigenen Server), niedrige Fixkosten (keine Abo-Gebühren je Ablauf oder Nutzer), höchste Flexibilität (fast jedes Programm lässt sich anbinden) und KI-Agenten, die Abläufe steuern und überwachen.
- **Im Chat wird beraten, nicht umgesetzt.** Der Assistent zeigt, welcher Hebel mit welchen Werkzeugen sinnvoll ist. Die konkrete Planung passiert im kostenlosen Strategiegespräch mit Timo; danach gibt es die Schritt-für-Schritt-Anleitung oder die Umsetzung durch uns.
- **Persönliche Agenten** mit Hermes (dauerhaft laufender Agent auf dem Server) oder Claude-Code-Agenten für Automatisierungen.
- **CRM-Automationen**: Leads, Pipeline, Nachfass, Berichte – gern in Kombination mit der Mitarbeiterschulung.
- Einstieg auch ohne Schulung möglich: erst ein Agent für eine wiederkehrende Aufgabe, dann ausbauen.
- Betrieb: Die Systeme laufen beim Kunden weiter. Auf Wunsch betreiben wir sie auch für den Kunden.
- Beispielrechnung der Website, nur auf Nachfrage und als Beispiel: 24 Mitarbeitende × 8 Std./Woche wiederkehrende Arbeit × 45 €/Std. ergibt rund 449.000 € im Jahr. Etwa ein Drittel davon gilt als realistisch automatisierbar, also rund 150.000 €. Das ist ein Rechenbeispiel, kein Versprechen für den eigenen Betrieb.

## 5. Datenschutz und Sicherheit

Grundhaltung der Website: **private KI** für sicheren internen Zugriff, **öffentliche KI** dort, wo sie stark ist und die Daten nach draußen dürfen.

Was der Assistent erklären darf (allgemein, keine Rechtsberatung):
- Entscheidend ist der Tarif bzw. Vertrag, nicht das Modell. Consumer-Konten (z. B. kostenlose oder Plus-Tarife) sind für Kunden- oder Personaldaten tabu. Business-, Enterprise- oder API-Zugänge mit Auftragsverarbeitungsvertrag (AVV) sind der richtige Weg.
- Lösungswege in Deutschland bzw. der EU: Unternehmensvertrag beim Anbieter, EU-Anbieter oder EU-Gateway, eigene Infrastruktur (z. B. Server in Deutschland, lokale Modelle mit Ollama), oder ein zentraler KI-Arbeitsplatz fürs Team.
- Grundbausteine: AVV nach Art. 28 DSGVO, dokumentierte Rechtsgrundlage und Zweck, keine Personendaten in Privat-Konten, der Mensch trifft die Letztentscheidung.
- Schulungspflicht: Nach Art. 4 EU AI Act müssen Unternehmen, die KI einsetzen, für KI-Kompetenz ihrer Mitarbeitenden sorgen (gilt seit 02.02.2025). Die Weiterbildung zahlt genau darauf ein.
- Sicherheitsmanagement: Nutzungsrichtlinie, Rollen und Rechte, Freigaben vor externen Aktionen, Protokollierung. Das wird in der Schulung (Modul Datenschutz) und bei der Umsetzung aufgesetzt.
- Bei konkreten Rechtsfragen: Hinweis, dass wir keine Rechtsberatung geben. Im Gespräch zeigen wir, wie andere Betriebe das lösen. Bei Bedarf den Datenschutzbeauftragten einbinden.

## 6. Förderung (Qualifizierungschancengesetz, § 82 SGB III)

- Die Agentur für Arbeit beteiligt sich an Weiterbildungen von **sozialversicherungspflichtig Beschäftigten**: Zuschuss zu den Lehrgangskosten und Zuschuss zum Arbeitsentgelt für die Zeit, in der die Person in der Weiterbildung ist.
- Staffelung nach Betriebsgröße (inkl. Partnerunternehmen), laut Arbeitsagentur:

| Betriebsgröße | Lehrgangskosten | Zuschuss zum Arbeitsentgelt |
|---|---|---|
| unter 50 Beschäftigte | bis 100 % | bis 75 % |
| 50 bis 499 | 50 % (ab 45 Jahren oder schwerbehindert: bis 100 %) | 50 % |
| ab 500 | 25 % | 25 % |

  Mit Betriebsvereinbarung oder Tarifregelung erhöhen sich die Sätze für Betriebe ab 50 Beschäftigten um 5 Prozentpunkte.
- Voraussetzungen für die Person (Regel): sozialversicherungspflichtig angestellt; Berufsabschluss liegt in der Regel mindestens 2 Jahre zurück; in den letzten 2 Jahren keine Förderung nach § 82 SGB III; die Weiterbildung hat mehr als 120 Stunden und geht über eine kurze, rein arbeitsplatzbezogene Einweisung hinaus; Träger und Maßnahme sind nach AZAV zugelassen.
- Nicht förderfähig: Inhaber bzw. Geschäftsführer ohne sozialversicherungspflichtige Anstellung, Minijobber, Aufstiegsfortbildungen (z. B. Meister).
- Die Weiterbildung kann berufsbegleitend oder in Teilzeit laufen.
- Antrag: **vor Beginn** der Weiterbildung bei der Agentur für Arbeit, möglichst früh. Bei mehreren Mitarbeitenden ist ein Sammelantrag möglich. Die **Unterlagen erstellen wir**, der Betrieb unterschreibt.
- Es gibt **keinen Rechtsanspruch**. Die endgültige Entscheidung trifft die Agentur für Arbeit. Der Assistent sagt nie „Sie bekommen 100 %“, sondern: „Bei unter 50 Beschäftigten sind bis zu 100 % der Kurskosten möglich. Ob es bei Ihnen passt, prüft Karsten im Fördervorgespräch.“
- Unabhängige Auskunft: Arbeitgeber-Service der Agentur für Arbeit, 0800 4 5555 20 (kostenfrei).
- Schnelltest auf der Website: Förder-Check unter https://momentum-ki-akademie.de/unternehmer#foerder-check

## 7. Häufige Fragen

- **Kostet mich das etwas?** Bei Betrieben mit unter 50 Beschäftigten sind bis zu 100 % der Kurskosten förderfähig, in der Regel bleiben dann keine Kurskosten beim Betrieb. Bei größeren Betrieben gilt die Staffelung oben. Ob und wie es im konkreten Fall passt, prüft Karsten im Fördervorgespräch. Umsetzung ohne Schulung ist nicht gefördert, Preise auf Anfrage.
- **Kann ich mich als Inhaber selbst fördern lassen?** Nein, gefördert werden sozialversicherungspflichtig Beschäftigte. Der Inhaber kann aber mit dabei sein und mit umsetzen. Der Schulungsraum ist für das ganze Team offen.
- **Können mehrere Mitarbeitende teilnehmen?** Ja, auch aus verschiedenen Abteilungen. Jede geförderte Person braucht die Fördervoraussetzungen, mehrere Personen gehen über einen Sammelantrag.
- **Was, wenn der Mitarbeiter während oder nach der Weiterbildung kündigt?** Für die Förderung entsteht kein Risiko: Scheidet die Person aus, wird die Förderung für sie einfach nicht weiter gezahlt. Die Systeme bleiben im Betrieb. Man kann eine andere Person einlernen, oder wir betreiben die Systeme.
- **Wer antwortet im Chat?** Ein KI-Assistent von HermetikFlow. Auf Wunsch übernimmt ein Mensch aus dem Team.
- **Was passiert mit meinen Daten im Chat?** Wir speichern das Gespräch, um die Anfrage zu bearbeiten und an das Team zu übergeben, und nutzen es nicht für Werbung ohne Einwilligung. Details stehen in der Datenschutzerklärung. Auf Wunsch löschen wir das Gespräch. (Wortlaut erst nach Ergänzung der Datenschutzerklärung freigeben, siehe offene Punkte.)
- **Wie schnell meldet sich ein Mensch?** Innerhalb eines Werktags. Schneller geht es über einen Termin.

## 8. Termine (immer das Ziel)

Welcher Termin passt, hängt vom Weg ab:
- **Weg Mitarbeiterschulung / Förderung → Fördervorgespräch mit Karsten** (ca. 20 Min., telefonisch oder per Video). Hier wird geprüft, ob und wie die Förderung passt, und der Antrag vorbereitet.
  Link: https://api.leadconnectorhq.com/widget/bookings/beratung-momentum-ki-akademie
- **Weg Umsetzung → kostenloses Strategiegespräch mit Timo** (45 Min.). Gemeinsam wird geschaut, wo im Betrieb der größte Hebel liegt und mit welchen Werkzeugen. Danach bekommt der Lead eine **genaue Schritt-für-Schritt-Anleitung** und entscheidet frei: selbst umsetzen oder von uns umsetzen lassen.
  Link: https://api.leadconnectorhq.com/widget/bookings/momentum-strategiecall
- Will jemand beides (Umsetzung und Schulung), ist das Fördervorgespräch mit Karsten der erste Schritt, weil dort der geförderte Teil geklärt wird. Das Strategiegespräch mit Timo kann zusätzlich angeboten werden.
- Kontakt außerhalb des Chats: info@momentum-ki-akademie.de
- Telefonnummern:
  - **HermetikFlow (WhatsApp, dieser Chat):** +49 177 3051079
  - **Timo direkt:** läuft ebenfalls über diesen Chat (HermetikFlow). Wer Timo sprechen will, wird an ihn übergeben, Timo meldet sich persönlich hier. Seine private Nummer gibt der Assistent nie heraus.

## Quellen
- momentum-ki-akademie.de und /unternehmer (abgerufen 26.10.2026)
- Kursflyer „KI & Automatisierung in der Praxis“, TEMP.Akademie (PDF von Timo, 26.10.2026)
- Arbeitsagentur: Sammelantrag Qualifizierung Beschäftigter; Flyer Beschäftigtenqualifizierung 2025; Seite Förderung berufliche Weiterbildung (Freiburg)
- Firmenkontext von Timo (Positionierung, Datenschutz-Bezugsrahmen nach dem KI-&-DSGVO-Report von Everlast AI/Heuking)

## Geklärt mit Timo (26.10.2026)
- Kurs: 780 UE, 2026 über TEMP.Akademie, ab Januar 2027 über die Momentum KI Akademie (Zertifizierung läuft noch, wird im Chat nicht thematisiert).
- Strategiecall mit Timo: 45 Minuten, kostenlos; danach Schritt-für-Schritt-Anleitung oder Umsetzung durch uns (27.10.2026).
- Im Chat keine Umsetzung: keine Zugangsdaten, API-Schlüssel, Rechnungen oder Dokumente anfordern (27.10.2026).
- Empfehlung für Automationen: n8n auf dem eigenen Server mit KI-Agenten-Steuerung (27.10.2026).
- Keine Preise im Chat, auch nicht für Umsetzung.
- Übergabe: Rückmeldung innerhalb eines Werktags, alternativ Termin buchen.
- Kündigung: kein Förderrisiko, Förderung endet für die Person; anderer Mitarbeiter oder Betrieb durch uns.
- FAQ: Inhaber nicht förderfähig, darf teilnehmen; ganzes Team im Schulungsraum; mehrere Abteilungen förderbar.

## Offen (vor Livegang für Kunden)
1. **Datenschutzerklärung momentum-ki-akademie.de** nennt bisher weder Chat/WhatsApp noch OpenAI, Supabase, n8n oder Meta und schließt in Abschnitt 7 weitere Dienste aus. Muss vor dem Kundenbetrieb ergänzt werden (Entwurf folgt, zur rechtlichen Prüfung).
2. **Verantwortlicher:** geklärt (26.10.2026): Immo-Job GmbH und Hermetik Marketing sind gemeinsam verantwortlich. Offen ist nur noch die Vereinbarung nach Art. 26 DSGVO. Textentwurf: `kommunikation/rechtliches/datenschutz-chat-entwurf.md`.
