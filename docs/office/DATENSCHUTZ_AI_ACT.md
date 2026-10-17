# Datenschutz und EU AI Act: Prüfung für Team-Portal und KI Office

Prüfdatum: 17.10.2026 · Verantwortliche Stelle: Momentum KI Akademie / Hermetikmarketing (Timo Merz) · Prüfer: Entwicklung (Claude Code), **keine Rechtsberatung**.
Grundlagen: DSGVO (https://eur-lex.europa.eu/eli/reg/2016/679/oj), AI Act (https://eur-lex.europa.eu/eli/reg/2024/1689/oj), Kommissionsseite (https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai).

**Wichtige Einschränkung:** In der Prüfumgebung konnten die Primärtexte (EUR-Lex, BGBl., Anbieter-DPAs) nicht direkt geöffnet werden; die Aussagen stützen sich auf Suchauszüge und Sekundärquellen der verlinkten Seiten. Vor Abnahme der Prüftabelle bitte die Primärquellen selbst öffnen. Dieses Dokument behauptet nirgends „DSGVO-konform“ oder „AI-Act-zertifiziert“: Es ist eine dokumentierte Prüfung mit offenen Punkten.

## 1. Rechtsstand zum Prüfdatum

### 1.1 AI Act: Zeitplan (Art. 113) und Digital Omnibus

| Datum | Was gilt | Quelle |
|---|---|---|
| 02.02.2025 | Verbote (Art. 5), KI-Kompetenz (Art. 4) | Art. 113 lit. a |
| 02.08.2025 | GPAI-Pflichten (Kap. V), Governance, Sanktionen | Art. 113 lit. b |
| 02.08.2026 | Großteil der Verordnung, insbesondere Transparenz (Art. 50) | Art. 113 |
| **02.12.2027** (statt 02.08.2026) | Hochrisiko nach Anhang III | „Digital Omnibus on AI“, Verordnung (EU) 2026/1744, ABl. 24.07.2026, in Kraft 27.07.2026 (https://eur-lex.europa.eu/eli/reg/2026/1744/oj) |
| **02.08.2028** (statt 02.08.2027) | Hochrisiko nach Anhang I | ebd. |

Stand laut Recherche: Der Omnibus ist beschlossen und in Kraft (vorläufige Einigung 07.05.2026, EP 16.06.2026, Rat 29.06.2026). Art. 50 wurde **nicht** verschoben und gilt seit 02.08.2026; nur für Systeme, die vor dem 02.08.2026 in Verkehr waren, gibt es für die maschinenlesbare Markierung (Art. 50 Abs. 2) eine Übergangsfrist bis 02.12.2026. Art. 4 wurde zu einer Pflicht, **Maßnahmen zur Förderung** der KI-Kompetenz zu ergreifen (Bemühens- statt Erfolgspflicht). Sekundärquellen: https://www.twobirds.com/en/insights/2026/digital-omnibus-on-ai-provisional-agreement-reached-at-the-may-trilogue, https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/, https://lawandtechnology.eu/en/ai-literacy-digital-omnibus-article-4-ai-act/. **Nicht verifiziert am 17.10.2026:** exakter Wortlaut der geänderten Artikel (Volltext nicht geöffnet).

Leitlinien: Code of Practice zur Markierung KI-generierter Inhalte (final 10.06.2026, https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content); Kommissions-Leitlinien zu Art. 50 (C(2026) 5054, https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems); FAQ (https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act). GPAI-Leitlinien (Juli 2025): Wer ein Modell nur per API nutzt, wird nicht zum GPAI-Anbieter.

Deutschland: KI-MIG (in Kraft 29.07.2026), Bundesnetzagentur als Marktüberwachung (Sekundärquellen, Gesetzestext nicht geprüft).

### 1.2 DSGVO und nationales Recht

- § 26 BDSG formal in Kraft, als Generalklausel nach EuGH C-34/21 (30.03.2023) nicht tragfähig; Beschäftigtendaten direkt auf Art. 6 Abs. 1 lit. b/f stützen. Ein Beschäftigtendatengesetz ist laut Recherche **nicht erlassen** (Stand ca. August 2026, nicht verifiziert für Oktober).
- EU-US Data Privacy Framework: EuG T-553/23 (Latombe) hat die Klage am 03.09.2025 abgewiesen; Rechtsmittel C-703/25 P anhängig; EDPB-Schreiben vom 31.07.2026 nach *Trump v. Slaughter*; die Kommission hat den Beschluss bisher weder geändert noch ausgesetzt. Folge: DPF nutzbar, SCC + Transfer Impact Assessment als Fallback dokumentieren.
- DSK-Orientierungshilfen: KI und Datenschutz (06.05.2024), TOM bei KI-Systemen (Juni 2025), RAG-Systeme (Oktober 2025). EDPB-Stellungnahme 28/2024 zu KI-Modellen.

## 2. Verarbeitungsübersicht (Ist und Soll)

| Verarbeitung | Daten | Personenbezug | Systeme / Empfänger | Ort |
|---|---|---|---|---|
| Team-Portal (bestehend) | Name, E-Mail, Telefon, WhatsApp-Einwilligung, Aufgaben, Notizen, Arbeitszeiten, Vertragsstunden | Beschäftigte, Auftragnehmer | Supabase (DB), n8n (self-hosted Hetzner), GitHub Pages (statisches Hosting), Meta/WhatsApp (Benachrichtigung) | Supabase-Region prüfen; Hetzner DE |
| KI Office (neu) | Runs (Auftragstext, Zusammenfassung, Fehler), Ereignisse (Schritte, Tool-Namen, Quellen-Referenzen), Artefakte (Titel, Ablageort, Hash), Freigaben (Vorschau, Hash, Entscheider), Idempotenzschlüssel, Rückmelde-Schlüssel | Beschäftigte (als Auftraggeber/Entscheider), mittelbar Kunden, falls Auftragstexte Kundendaten enthalten | Supabase, n8n | wie oben |
| Modellaufrufe durch Agenten (geplant) | Auftragstexte, Aufgabeninhalte, Dokumentauszüge | je nach Inhalt | Anthropic API (Claude Haiku/Sonnet/Opus 5.5), Ausführung in Claude Code, Codex, Hermes, n8n | USA (Anthropic; EU-Residenz nur über Bedrock/Vertex) |
| Chat-Assistent Kurs (bestehend, nicht geändert) | Fragen der Teilnehmenden, Screenshots, Sitzungs-ID | Kursteilnehmende | OpenAI (gpt-5-mini) über n8n; n8n Data Table `Kurs_Chatfragen` | USA/EU-Projekt prüfen |
| Kurs-Wissensbasis (bestehend) | Kurstexte als Embeddings (`kurs_wissen`) | nur falls Quelltexte Namen/Beispiele enthalten | Supabase (pgvector), Embedding-Modell | prüfen |
| Logs und Backups | n8n-Executions (Fehlerfälle gespeichert: `saveDataErrorExecution: all`), Supabase-Backups, GitHub-Pages-Zugriffslogs (IP) | ja | n8n, Supabase, GitHub | – |
| Support-/Admin-Zugriffe | Supabase-Dashboard, n8n-Editor, GitHub | Admin (Timo) | – | – |

## 3. Einordnung der KI-Anwendungsfälle nach AI Act

| Anwendungsfall | Rolle (Art. 3) | Risikokategorie | Transparenz | Menschliche Aufsicht | KI-Kompetenz | Bewertung |
|---|---|---|---|---|---|---|
| A. Agenten erledigen Aufgaben im internen Portal (Texte, Code, Recherche, Status-Zusammenfassungen) | Betreiber der Modelle; für den selbst gebauten Agenten-Workflow zugleich Anbieter im Eigengebrauch (Inbetriebnahme) | Minimalrisiko, solange keine Bewertung von Personen (siehe D) | Art. 50 Abs. 1 greift nicht (Interaktion nur mit dem Team, KI-Natur offensichtlich und im UI gekennzeichnet: Chip „KI-Agent“, Register „KI Office“) | Jede externe Aktion nur mit Freigabe durch einen Menschen; „Erledigt“ und fachliche Abnahme setzt nur ein Mensch; Abbruch jederzeit | Team-Schulung (Richtlinie, Nachweisliste) | aktiv, dokumentiert |
| B. Klassifikation/Routing von Aufgaben durch ein Modell (Haiku) | Betreiber | Minimalrisiko: klassifiziert Aufgaben nach Thema/Priorität/Raum, nicht Personen. Anhang III Nr. 4 lit. b (Aufgabenzuweisung aufgrund individuellen Verhaltens oder persönlicher Merkmale) **nicht** erfüllt | intern | Routing ist Vorschlag; Zuweisung bestätigt ein Mensch | wie A | geplant; Kriterienkatalog in `office/agenten.json` (Feld `faehigkeiten`, Raum) |
| C. Chat-Assistent für Kursteilnehmende (gpt-5-mini) | voraussichtlich Anbieter des Systems „Chat-Assistent“ unter eigenem Namen und Betreiber (Lesart, nicht verifiziert) | Transparenzrisiko (Art. 50 Abs. 1); kein Hochrisiko, solange keine Zulassungs-/Bewertungsentscheidung | Hinweis „KI-Assistent“ bei Gesprächsbeginn: **prüfen, ob im Kurs-Chat sichtbar** (offener Punkt) | Kursleitung sieht Fragen im Portal | Kursleitung | bestehend, nicht geändert |
| D. Personal-, Mitarbeiterbewertungs- und Bildungsentscheidungen (Anhang III Nr. 3 und Nr. 4) | – | **Nicht aktiviert.** Das KI Office zählt nur Aufgaben und Runs; es gibt keine Leistungs- oder Verhaltensbewertung von Beschäftigten, keine Bewerberauswahl, keine Prüfungs-, Zulassungs- oder Benotungsentscheidungen im Kurs. Arbeitszeitdaten des Portals werden von keinem Modell verarbeitet (Agenten-Antwort der Portal-API enthält keine Zeiten). | – | – | – | ausdrücklich ausgeschlossen; bei Änderung neue Prüfung (Pflichten ab 02.12.2027) |
| E. GPAI-Anbieter-Status | – | nicht anwendbar (reine API-Nutzung, kein Fine-Tuning) | – | – | – | – |
| F. Verbotene Praktiken (Art. 5) | – | Negativprüfung: keine Emotionserkennung am Arbeitsplatz, kein Social Scoring, keine Manipulation | – | – | – | ausgeschlossen |

## 4. Prüftabelle

Spalten: Anforderung | Quelle/Artikel | Anwendbarkeit | Umsetzung | Nachweis | Offener Punkt | Verantwortlich. Umsetzungsstatus: ✅ umgesetzt (im Code/Repo nachweisbar), 🔶 teilweise, ⬜ offen.

### 4.1 Technisch zu bewerten

| Anforderung | Quelle/Artikel | Anwendbarkeit | Umsetzung | Nachweis | Offener Punkt | Verantwortlich |
|---|---|---|---|---|---|---|
| Datenminimierung in Agenten-Logs | DSGVO Art. 5 Abs. 1 lit. c; DSK-OH TOM KI | ja | ✅ Ereignisse speichern Titel, Tool-Name, Quellen-Referenz (URL/ID), Details ≤ 2000 Zeichen; keine Prompts, keine Gedankengänge; Freitext wird von Schlüsselmustern bereinigt (`bereinige()`) | `office/lib/verarbeitung.js`, Test `office/test/verarbeitung.test.mjs` | Hinweis an Agenten in `.claude/agents/*.md`, keine Personendaten in Ereignisse zu schreiben | Entwicklung |
| Speicherbegrenzung / Löschung inkl. abgeleiteter Daten | DSGVO Art. 5 Abs. 1 lit. e, Art. 17; DIN 66398 | ja | ✅ Löschaktion `loeschen` (Run, Ereignisse, Artefakte, Freigaben, Idempotenz, Schlüssel, gespiegelte Verlaufseinträge), Wartung löscht Idempotenzschlüssel > 30 Tage; Fristen in `LOESCHKONZEPT.md` | Test „Löschregeln erfassen abgeleitete Daten“ | Externe Ablageorte (Artefakt-Dateien) muss ein Mensch löschen; Supabase-Backups folgen der Anbieterfrist | Admin |
| Zugriffskontrolle serverseitig, geringste Rechte | DSGVO Art. 25, 32 | ja | ✅ Rechteprüfung im Workflow-Code (Rollen admin/team/agent, Projektgrenzen, Agenten ohne Freigabe-/Lösch-/Registry-Rechte) | `office/lib/rechte.js`, Tests | n8n-Workflow ist erst nach Import durch Timo produktiv | Entwicklung / Admin |
| Keine Schlüssel im Browser oder Repo | DSGVO Art. 32 | ja | ✅ Supabase-Zugang nur als n8n-Credential; Rückmelde-Schlüssel nur in Tabelle `office_run_schluessel` (service_role), nie in `laden`-Antworten; Secret-Scan über Git-Historie | `SICHERHEIT.md` Abschnitt Secret-Scan | – | Entwicklung |
| Integrität von Webhooks (Signatur, Zeitfenster, Nonce) | DSGVO Art. 32 | ja | ✅ HMAC-SHA256, 300 s Fenster, Nonce einmalig | `office/lib/signatur.js`, Tests | Executor-Seite (n8n-Agenten-Workflow) noch nicht gebaut | Entwicklung |
| Mandanten-/Projekttrennung | DSGVO Art. 5 Abs. 1 lit. f, Art. 32 | ja | ✅ Agenten sehen nur Projekte ihrer Registry-Zuordnung; Runs/Artefakte/Freigaben nur sichtbarer Projekte | Pflichtprüfung 1 im Testbericht | Menschen sehen (wie im Portal) alle Projekte; Kundenrolle noch nicht aktiviert | Admin |
| Verschlüsselung Transport | Art. 32 | ja | ✅ HTTPS (GitHub Pages, n8n, Supabase) | – | TLS-Konfiguration des Hetzner-Reverse-Proxys nicht geprüft | Admin |
| Protokollierung von Admin-Aktionen | Art. 5 Abs. 2 (Rechenschaft) | ja | 🔶 Freigaben, Abnahmen, Abbrüche, Löschungen werden als Ereignis mit Autor festgehalten; Löschung selbst hinterlässt keinen Eintrag im Office (Supabase-Logs) | `verarbeitung.js` | Lösch-Protokoll (wer hat wann was gelöscht) ohne Inhalte ergänzen | Entwicklung |
| Embeddings als personenbezogene Daten behandeln | DSK-OH RAG; EDPB 28/2024; BayLDA | ja (kurs_wissen) | ⬜ nicht Teil dieses PR; Quelltexte auf Namen/Beispiele screenen, Löschung Chunk + Vektor | – | Screening der Kursquellen | Kursleitung |
| n8n-Execution-Logs begrenzen | Art. 5 Abs. 1 lit. e | ja | 🔶 Portal-API speichert nur Fehlerausführungen; Office-API-Workflow ist gleich konfiguriert (`saveDataSuccessExecution: none`) | `office/n8n/office-api.workflow.json` | Aufbewahrungsfrist für Fehler-Executions in n8n setzen (EXECUTIONS_DATA_MAX_AGE) | Admin |
| Prompt Injection aus Dokumenten/Tool-Ergebnissen | Art. 32; DSK-OH TOM KI | ja | 🔶 Externe Aktionen nur mit Freigabe; Werkzeuge pro Agent allowlisted; Hinweise in Stubs und Subagenten | `office/adapter/*.stub.js`, `.claude/agents/` | Inhaltliche Filter auf Executor-Seite | Entwicklung |
| Backup und Wiederherstellung | Art. 32 Abs. 1 lit. c | ja | 🔶 Supabase-Backups (Anbieter), Repo in Git; Konzept in `BETRIEB.md` | – | Wiederherstellungstest nie durchgeführt | Admin |

### 4.2 Organisatorisch zu bewerten

| Anforderung | Quelle/Artikel | Anwendbarkeit | Umsetzung | Nachweis | Offener Punkt | Verantwortlich |
|---|---|---|---|---|---|---|
| KI-Kompetenz: Maßnahmen zur Förderung, rollenbezogen, dokumentiert | AI Act Art. 4 (Omnibus-Fassung) | ja (Betreiber) | ⬜ | – | Interne KI-Richtlinie (welche Tools, welche Daten, Prüfpflicht der Ergebnisse), Schulung mit Teilnahmeliste, jährliche Auffrischung | Timo |
| Menschliche Aufsicht organisatorisch verankert | AI Act Art. 26 (nur Hochrisiko, hier freiwillig), DSK-OH KI Rn. 12 | ja | ✅ Vier-Augen-Prinzip bei Freigaben (Anfordernder darf nicht selbst erteilen), kritische Aktionen nur Admin, Abnahme nur Mensch | `rechte.js` | Zuständigkeiten je Raum benennen | Timo |
| Verzeichnis von Verarbeitungstätigkeiten | DSGVO Art. 30 | ja (Ausnahme Abs. 5 greift nicht) | ⬜ | – | Einträge: Team-Portal, KI Office/Agenten, Chat-Assistent, Wissensbasis, Hosting, WhatsApp | Timo |
| Informationspflichten gegenüber Team | DSGVO Art. 13; ggf. § 87 BetrVG | ja | 🔶 Portal zeigt beim Einrichten, welche Daten gespeichert werden; KI Office zeigt Hinweis, was protokolliert wird (Bedienung) | `docs/team/index.html` (einrichten), `docs/office/index.html` (Hinweis) | Datenschutzinformation fürs Team schriftlich ergänzen (Empfänger OpenAI/Anthropic/Supabase/Hetzner/GitHub/Meta, Fristen) | Timo |
| Informationspflichten gegenüber Kursteilnehmenden, KI-Hinweis Chat | DSGVO Art. 13; AI Act Art. 50 Abs. 1 | ja | ⬜ nicht Teil dieses PR | – | Hinweis im Kurs-Chat prüfen, Datenschutzerklärung ergänzen | Kursleitung |
| DSFA | DSGVO Art. 35; DSK-Muss-Liste Nr. 11 (KI zur Steuerung der Interaktion) | Chat-Assistent: voraussichtlich ja; interne Agenten: Schwellenprüfung | ⬜ | – | DSFA für Chat-Assistent; Schwellenprüfung für Agenten dokumentieren | Timo (ggf. externer DSB) |
| Meldeprozess Datenpannen inkl. Anbieterkette | DSGVO Art. 33/34 | ja | ⬜ | – | 72-h-Prozess, Kontaktwege | Timo |
| Löschkonzept mit Fristen je Datenklasse | Art. 5 Abs. 1 lit. e; DIN 66398 | ja | ✅ Konzept in `LOESCHKONZEPT.md` (Fristen sind Vorschläge, Entscheidung Timo) | Dokument | Fristen bestätigen | Timo |
| Support-/Admin-Zugriffe begrenzen | Art. 32 | ja | 🔶 Admin-Rolle nur Timo; Supabase/n8n-Zugänge nicht Teil des Repos | – | 2FA bei Supabase, n8n, GitHub prüfen | Timo |
| Monitoring von Rechtsänderungen | – | ja | ⬜ | – | Wiedervorlagen: 02.12.2026 (Art. 50 Abs. 2 Übergang), 2027 (C-703/25 P, Hochrisiko 02.12.2027, Beschäftigtendatengesetz) | Timo |

### 4.3 Juristisch zu bewerten

| Anforderung | Quelle/Artikel | Anwendbarkeit | Umsetzung | Nachweis | Offener Punkt | Verantwortlich |
|---|---|---|---|---|---|---|
| Rechtsgrundlage je Verarbeitung | DSGVO Art. 6 Abs. 1 lit. b/f; § 26 BDSG nur ergänzend (C-34/21) | ja | 🔶 Vorschlag: Team-Portal und Office lit. b (Arbeits-/Auftragsverhältnis) und lit. f (Organisation, Sicherheit); Kursteilnehmende lit. b; WhatsApp lit. a | – | Interessenabwägung für Agenten-Logs mit Mitarbeiterbezug schriftlich | Timo / Berater |
| Rollenbestimmung je KI-System | AI Act Art. 3 Nr. 3, 4 | ja | 🔶 Abschnitt 3 | Dokument | Anbieterrolle beim Chat-Assistenten juristisch bestätigen | Berater |
| Hochrisiko Anhang III Nr. 3 (Bildung) nicht aktiviert | AI Act Art. 6 Abs. 2, Anhang III | nicht aktiviert | ✅ dokumentiert (Abschnitt 3 D) | Dokument | bei neuen Kursfunktionen (Bewertung, Zulassung) neu prüfen | Timo |
| Hochrisiko Anhang III Nr. 4 (Beschäftigung) nicht aktiviert | AI Act Anhang III Nr. 4 | nicht aktiviert | ✅ dokumentiert; Routing nicht personenbezogen | Dokument, `office/agenten.json` | – | Timo |
| Keine ausschließlich automatisierten Entscheidungen | DSGVO Art. 22; EuGH C-634/21 | ja (Negativprüfung) | ✅ Freigaben, Abnahmen, Statuswechsel mit Wirkung nur durch Menschen | `rechte.js`, Zustandsmaschine | – | – |
| AV-Vertrag Supabase + Region | Art. 28, 44 ff. | ja | ⬜ | – | DPA abschließen, Region im Dashboard prüfen, ggf. Migration in EU-Projekt | Timo |
| AV-Vertrag Hetzner | Art. 28 | ja | ⬜ | – | AVV im Kundenkonto, Annex 1, Standort DE | Timo |
| AV-Vertrag / Terms OpenAI | Art. 28, 44 ff. | ja (Chat-Assistent) | ⬜ | – | DPA, EU-Projekt (eu.api.openai.com) prüfen, Abuse-Monitoring-Status | Timo |
| AV-Vertrag / Terms Anthropic | Art. 28, 44 ff. | ja (sobald Agenten Modelle aufrufen) | ⬜ | – | Commercial Terms + DPA, Retention im Konto prüfen, Transfer Impact Assessment (keine EU-only-Verarbeitung über direkte API) | Timo |
| GitHub Pages (Zugriffslogs, DPA) | Art. 6 Abs. 1 lit. f, Art. 28/44 | ja | ⬜ | – | In Datenschutzerklärung nennen, DPA ablegen | Timo |
| WhatsApp Business (Benachrichtigungen) | Art. 28, 45 | ja, falls genutzt | ⬜ | – | Data Processing Terms, Transfer-Addendum, Einwilligung (im Portal vorhanden) | Timo |
| Drittlandtransfer abgesichert | Art. 44–46; DPF (gültig, Rechtsmittel anhängig) | ja | ⬜ | – | DPF-Zertifizierung je Anbieter auf dataprivacyframework.gov prüfen; SCC + TIA als Fallback | Timo / Berater |
| Art. 50 Abs. 2 Markierung generierter Inhalte | AI Act Art. 50 Abs. 2; Code of Practice | prüfen | ⬜ | – | Reichweite auf Systemebene für Text-Chatbot unklar | Berater |
| Art. 50 Abs. 4 Kennzeichnung veröffentlichter KI-Texte | AI Act Art. 50 Abs. 4 | nur falls Agenten-Texte unredigiert veröffentlicht werden | 🔶 Social-Posts durchlaufen im Portal „Zur Freigabe“; im Office nur mit Freigabe `post_veroeffentlichen` | Zustandsmaschine | redaktionelle Prüfung dokumentieren | Marketing |
| Urheber-/Lizenzrecht der Komponenten | – | ja | ✅ `QUELLEN_UND_LIZENZEN.md` | Dokument | n8n-Lizenz bei Kundenzugang/Verkauf klären | Timo |

## 5. Besondere Datenarten und Nebenprozesse

- **Logs:** n8n speichert nur Fehlerausführungen; sie können Request-Bodys (ohne Token-Anzeige im Office-Code, aber im Webhook-Node) enthalten. Empfehlung: `EXECUTIONS_DATA_MAX_AGE` setzen (z. B. 14 Tage) und `EXECUTIONS_DATA_PRUNE=true`. GitHub Pages protokolliert IP-Adressen (Anbieterseite).
- **Backups:** Supabase-Backups folgen der Anbieterfrist; gelöschte Runs leben dort bis zum Ablauf weiter. Im Löschkonzept berücksichtigt.
- **Embeddings:** `kurs_wissen` ist nicht Teil dieses PR; Behandlung wie personenbezogene Daten, falls Quelltexte Namen enthalten.
- **Telemetrie:** Das KI Office sendet keine Telemetrie. n8n-Telemetrie ist Instanz-Einstellung (`N8N_DIAGNOSTICS_ENABLED`), prüfen.
- **Supportzugriffe:** Supabase- und n8n-Support können im Störungsfall Zugriff erhalten; in AVV geregelt.
- **Modellaufrufe:** OpenAI (gpt-5-mini über n8n) für den Kurs-Chat; Anthropic für Agenten (geplant). Beide: Standardmäßig kein Training auf API-Daten laut Anbieterangaben (Suchauszüge, nicht verifiziert am 17.10.2026). Daten verlassen die EU.

## 6. Unsicher / nicht verifiziert am 17.10.2026

1. Volltexte von VO 2026/1744, Anhang III, Art.-50-Leitlinien nicht geöffnet.
2. Anbieterrolle beim API-basierten Chat-Assistenten ist eine Lesart.
3. Beschäftigtendatengesetz: letzte belastbare Quelle ca. August 2026.
4. DPF: keine Kommissionsreaktion auf das EDPB-Schreiben gefunden; Zertifizierungsstatus der Anbieter nicht geprüft.
5. Anthropic-Retention (7 vs. 30 Tage) widersprüchlich; OpenAI EU-Residenz/ZDR widersprüchlich.
6. Supabase-Region des Projekts unbekannt (kein Zugang in dieser Sitzung).
7. Keine neuen DSK-Papiere 2026 zu KI-Agenten gefunden; Fehlanzeige ist kein Beweis.

## Nachtrag 17.10.2026: Anwendungsfall D, PA-Assistent (Termine und Postfächer)

| Punkt | Einordnung | Stand |
|---|---|---|
| Verarbeitung | Lesen aller Postfächer und Kalender von Timo, Erkennen von Entscheidungsbedarf, Anlegen von Rückfragen/Aufgaben im Office | geplant, nicht aktiviert |
| Datenkategorien | Kontaktdaten und Inhalte Dritter (Kunden, Partner, Behörden), ggf. Beschäftigtendaten (Team-Mails), Termine | – |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse, Organisation der eigenen Geschäftstätigkeit) für Geschäftsmails; bei Beschäftigten § 26 BDSG beachten; Interessenabwägung dokumentieren | ⬜ organisatorisch |
| Modellaufruf | Mailinhalte an ein Modell (Anthropic/OpenAI) senden = Drittlandtransfer, AV-Vertrag und Datensparsamkeit nötig; Vorverarbeitung (nur Betreff/Absender/Kurzauszug) prüfen | ⬜ juristisch |
| Datenminimierung | Office speichert nur Betreff, Absender, Frist und Entscheidungssatz, nie den Mailtext; Ereignisse mit `quelle_ref` auf die Mail-ID | technisch geplant |
| Transparenz | Teammitglieder informieren, dass ein Assistent Team-Mails sichtet; keine Leistungsbewertung | ⬜ organisatorisch |
| AI Act | Kein Hochrisiko (keine Entscheidungen über Personen); Art. 50 nicht berührt, solange der PA nicht nach außen schreibt | eingeordnet |
| DSFA | Prüfen: systematische Auswertung von Kommunikation kann DSFA-pflichtig sein (Art. 35), insbesondere bei Beschäftigtenmails | ⬜ juristisch |

Bis diese Punkte geklärt sind, bekommt der PA-Assistent keinen Ausführer mit Postfachzugriff.
