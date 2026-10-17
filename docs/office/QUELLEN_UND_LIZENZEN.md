# Quellen und Lizenzen: KI Office

Prüfdatum: 17.10.2026 · Methode: Web-Recherche (GitHub-Rohdateien, npm-Registry, Suchauszüge der offiziellen Seiten) plus Blick ins Repo. Dieses Dokument ist eine technische Zusammenfassung von Lizenztexten und Nutzungsbedingungen, **keine Rechtsberatung**. Vor einem Kundenzugang oder Verkauf des KI Office bitte eine anwaltliche Prüfung einholen.

Mehrere Hosts waren am Prüfdatum aus der Prüfumgebung nicht erreichbar (Proxy/DNS): gsap.com, webflow.com, docs.n8n.io, n8n.io, supabase.com, privacy.claude.com, platform.openai.com, openai.com, developers.openai.com, sahni.ai, www.ecom-orbit.de, web.archive.org. Wo das relevant ist, steht es dabei. Alles, was nur aus Suchauszügen stammt, ist als solches markiert.

## 1. Was das KI Office selbst nutzt

Das KI Office (`docs/office/`, `office/`) ist bewusst ohne Fremdbibliotheken gebaut: Vanilla JS, eigenes CSS auf Basis der Portal-Variablen, eigene SVG-Grafiken für das virtuelle Büro, Systemschriften. SHA-256/HMAC sind eigene Implementierungen in `office/lib/hash.js` (gegen `node:crypto` getestet). Es werden **keine** Assets, Texte oder Code aus den Referenzprojekten übernommen.

| Komponente | Wo | Lizenz | Hinweis |
|---|---|---|---|
| Eigener Code (Office-UI, Bibliothek, Testserver, Tests, Workflow-Code) | `docs/office/`, `office/`, `supabase/team_office.sql` | Repo-Lizenz (keine LICENSE-Datei im Repo, siehe Restpunkte) | – |
| Node.js 22 (nur Entwicklung/Test) | Testserver, Tests | MIT-ähnlich, gebündelte Abhängigkeiten mit eigenen Lizenzen (https://github.com/nodejs/node/blob/main/LICENSE) | nicht ausgeliefert |
| Playwright 1.56.1 (global in der Prüfumgebung) bzw. `puppeteer-core` ^23 aus `package.json` | Browsertests | Apache-2.0 (https://github.com/microsoft/playwright/blob/main/LICENSE, https://github.com/puppeteer/puppeteer/blob/main/LICENSE) | Browser-Binaries (Chromium, BSD-3) separat |

## 2. Übersichtstabelle aller berührten Komponenten

| Komponente | Herkunft/Link | Version/Commit | Lizenz | Bedingungen/Hinweise | Prüfdatum |
|---|---|---|---|---|---|
| jsPDF | https://github.com/parallax/jsPDF · LICENSE: https://raw.githubusercontent.com/parallax/jsPDF/master/LICENSE | Team-Portal lädt per CDN `cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` (2.5.1); aktuell 4.2.1 | MIT (James Hall 2010–2025, yWorks GmbH 2015–2025) | Lizenz-/Copyright-Hinweis bleibt im CDN-Header erhalten. 2.5.1 liegt zwei Hauptversionen zurück, Update prüfen. Das KI Office nutzt jsPDF nicht. | 17.10.2026 |
| GSAP | https://github.com/greensock/GSAP · Lizenz-URL laut Paket: https://gsap.com/standard-license | `package.json` gsap ^3.15.0; vendored in `projects/level2/assets/gsap.min.js` | GSAP Standard „No Charge“ License (proprietär, kostenlos) | Lizenztext selbst nicht abrufbar am 17.10.2026. Laut README im GSAP-Repo seit der Webflow-Übernahme zu 100 % kostenlos inklusive kommerzieller Nutzung und früherer Club-Plugins (Ankündigung laut Suchauszug 30.04.2025). Einschränkung laut Suchauszügen: keine Nutzung in No-Code-Animations-Buildern, die mit Webflow konkurrieren; eine Klausel zu Produkten mit Endnutzer-Gebühren war im Auszug erwähnt, Aktualität unklar. Nur im Video-/Kurs-Tooling genutzt, nicht im KI Office. **Vor einem kostenpflichtigen Kundenzugang Originaltext prüfen.** | 17.10.2026 |
| @fontsource/space-grotesk | https://github.com/fontsource/font-files/tree/main/fonts/google/space-grotesk | npm 5.3.0 | SIL OFL 1.1 (npm-Lizenzfeld); Fontsource-Tooling MIT | Freie Nutzung/Einbettung auch kommerziell; Schrift nicht einzeln verkaufen; Reserved-Font-Name bei Änderungen. Nur Video-Tooling. | 17.10.2026 |
| @fontsource/jetbrains-mono | registry.npmjs.org | npm 5.3.0 | SIL OFL 1.1 (npm-Lizenzfeld; Upstream-LICENSE nicht separat abgerufen) | wie oben; nur Video-Tooling | 17.10.2026 |
| simple-icons | https://github.com/simple-icons/simple-icons · https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md | `package.json` latest (16.35.0), Pin empfohlen | CC0 1.0 (Artwork) | CC0 gilt für die SVG-Daten, nicht für Marken; Brand-Guidelines je Icon beachten. Nur Video-Tooling. | 17.10.2026 |
| puppeteer-core | https://github.com/puppeteer/puppeteer/blob/main/LICENSE | ^23.0.0 (aktuell 25.x) | Apache-2.0 | Lizenz-/NOTICE-Hinweise beibehalten. | 17.10.2026 |
| hyperframes / @hyperframes/core | https://github.com/heygen-com/hyperframes · https://raw.githubusercontent.com/heygen-com/hyperframes/main/LICENSE | latest (0.8.167), Pin empfohlen | Apache-2.0 (HeyGen, Inc.) | Rendering nutzt headless Chrome und FFmpeg (eigene Lizenzen). Nur Video-Tooling. | 17.10.2026 |
| Playwright | https://github.com/microsoft/playwright/blob/main/LICENSE | 1.56.1 (global in Prüfumgebung), genutzt in `video/imagefilm/*.js`, fehlt in `package.json` | Apache-2.0 | Als devDependency aufnehmen (Restpunkt). | 17.10.2026 |
| Node.js | https://github.com/nodejs/node/blob/main/LICENSE | 22.x | MIT-ähnlich | gebündelte Abhängigkeiten mit eigenen Lizenzen | 17.10.2026 |
| Supabase | Self-Hosting-Repo https://github.com/supabase/supabase/blob/master/LICENSE · Cloud: https://supabase.com/terms, https://supabase.com/legal/dpa, https://supabase.com/aup | Cloud-Projekt `llhwmzhvhluamxwemaqx` | Repo Apache-2.0; supabase-js MIT; Cloud: Nutzungsbedingungen und DPA | supabase.com nicht abrufbar am 17.10.2026. Laut Suchauszügen: DPA Version 1 vom 01.08.2026 (andere Quelle: Datei vom 01.06.2026), AUP vom 01.06.2026; Transfers nach Singapur/USA über SCC. **DPA abschließen, Projektregion prüfen.** | 17.10.2026 |
| @n8n/workflow-sdk | https://github.com/n8n-io/n8n/tree/master/packages/%40n8n/workflow-sdk | npm 0.36.5 (Lizenzfeld „SEE LICENSE IN LICENSE.md“); master 0.37.0 „LicenseRef-n8n-sustainable-use“ | n8n Sustainable Use License 1.0 (+ Enterprise License für `.ee.`-Dateien) | Nur Build-Werkzeug für `office/n8n/office-api.workflow.js`; nicht Teil eines verkauften Produkts. In dieser Sitzung **nicht installiert**; der Import-JSON wurde ohne SDK erzeugt. | 17.10.2026 |
| n8n (Plattform) | https://github.com/n8n-io/n8n/blob/master/LICENSE.md · https://github.com/n8n-io/n8n/blob/master/LICENSE_EE.md · FAQ (Repo-Quelle): https://github.com/n8n-io/n8n-docs/blob/main/docs/n8n-community-license/license-faq.md · offiziell (nicht abrufbar): https://docs.n8n.io/sustainable-use-license/, https://docs.n8n.io/embed/, https://n8n.io/legal/ | self-hosted `n8n.hm-storage.de`; außerdem im Repo referenziert `momentumki.app.n8n.cloud` | Sustainable Use License 1.0 (self-hosted) / Enterprise License (`.ee.`) / n8n-Cloud-Vertrag | siehe Abschnitt 4 | 17.10.2026 |
| Anthropic Claude API (claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5) | https://platform.claude.com/docs/en/about-claude/models/overview · https://platform.claude.com/docs/en/about-claude/pricing · https://www.anthropic.com/legal/commercial-terms · https://platform.claude.com/docs/en/manage-claude/api-and-data-retention | nur Konfiguration (Registry, Subagenten); keine Aufrufe im Repo | Commercial Terms of Service (Fassung 17.06.2025 laut Seite) | siehe Abschnitt 5 | 17.10.2026 |
| OpenAI gpt-5-mini | https://developers.openai.com/api/docs/models/gpt-5-mini · https://developers.openai.com/api/docs/guides/your-data · https://openai.com/policies/business-terms/ | `assistent/workflow.js` (Chat-Assistent, unverändert) | Business Terms | siehe Abschnitt 5; OpenAI-Hosts nicht abrufbar am 17.10.2026 | 17.10.2026 |
| Agents Office (ajsahni) – nur Referenz | https://github.com/ajsahni/agents-office · https://raw.githubusercontent.com/ajsahni/agents-office/main/LICENSE · https://sahni.ai/agentsofficev3/ | main, letzte README-Änderung 17.09.2026 | PolyForm Noncommercial 1.0.0 + Zusatzbedingungen von Sahni.ai | siehe Abschnitt 3; nichts übernommen | 17.10.2026 |

## 3. Referenzen: nur Bedienkonzept angesehen

### 3.1 Agents Office (ajsahni/agents-office)

**Lizenz:** PolyForm Noncommercial 1.0.0 mit Zusatzbedingungen von Sahni.ai (Copyright 2026 Sahni.ai, Neuseeland). Die Zusatzbedingungen verbieten das Entfernen der Sahni.ai-Marke und der Lizenzzeile im UI, Umbenennen oder Ausgeben als eigenes Werk, das Anpassen der Software zum Ansteuern eines anderen Agentensystems oder Produkts sowie das Bündeln damit; alles nicht ausdrücklich Erlaubte braucht schriftliche Erlaubnis. Keine Commons-Clause. **Folge für dieses Projekt:** Kein Code, keine Grafiken, keine Texte, nicht der Name. Ideen und Bedienkonzepte sind nicht geschützt; das KI Office ist vollständig eigenständig gebaut. Die Software selbst in einem Unternehmen produktiv zu betreiben wäre unter „Noncommercial“ grenzwertig, deshalb nicht eingesetzt.

**Bedienkonzept (paraphrasiert):** Isometrische 3D-Szene (Three.js) mit sechs Abteilungs-Pods um ein zentrales „Brain“ (Notizordner). Agenten sitzen an Schreibtischen; eine Taskleiste nimmt Aufgaben in Alltagssprache entgegen und routet sie an einen Agenten. Zustände werden visuell codiert (pulsierendes Connector-Logo bei Tool-Nutzung, aufstehender winkender Agent bei Wartezustand auf Freigabe, Uhr-Symbol für Routinen). Klick auf einen Agenten öffnet einen Chat, Klick auf das Brain eine Graphansicht. Ein Status-Panel listet Aufgaben nach Zustand mit Approve/Reject. Kanban-Board und Kalender ergänzen die Szene; Tastaturkürzel schalten Ansichten um.

**Was das KI Office daraus ableitet (eigenständig umgesetzt):** Räume als Filter, Agentenzustand sichtbar im Büro (Farbpunkt je Run-Status), Klick auf Agent führt zur echten Arbeitsübersicht, Freigaben als eigene Liste mit Entscheidung, Tastaturbedienung. Bewusst anders: 2D-SVG statt 3D, keine Chat-Eingabe im Büro (Aufträge entstehen aus Aufgaben des Portals), keine erfundenen Fortschrittsanzeigen.

### 3.2 https://sahni.ai/agentsofficev3/

Nicht abrufbar am 17.10.2026 (DNS-Fehler, auch Archiv nicht erreichbar). Laut Suchauszug Landingpage derselben Software („Agents Office v3 (Beta)“, PolyForm Noncommercial, Node 20+, Claude Code). Eigene Beobachtungen der Live-Demo gibt es nicht.

### 3.3 https://www.ecom-orbit.de/

Nicht abrufbar am 17.10.2026 (DNS-Fehler), auch keine Suchtreffer. Aufbau und Inhalt konnten nicht beschrieben werden. **Offen:** Timo sieht die Seite selbst an und ergänzt hier drei bis fünf Sätze.

## 4. n8n-Einsatzbedingungen

**Lizenzstruktur** (Quelle: `LICENSE.md` im n8n-Repo, identisch im npm-Paket @n8n/workflow-sdk): Alles außerhalb von `.ee.`-Dateien steht unter der Sustainable Use License 1.0 (SUL). `.ee.`-Dateien unter der n8n Enterprise License (produktiver Einsatz nur mit gültiger Enterprise-Lizenz). SUL-Kernregel: Nutzung und Änderung nur für eigene interne Geschäftszwecke oder nicht-kommerzielle/private Zwecke; Weitergabe nur kostenlos und nicht-kommerziell; Hinweise nicht entfernen; bei Verstoß erlischt die Lizenz (30-Tage-Heilung). Laut Community-Lizenz-Seite gilt die SUL nur für Self-Hosting; n8n Cloud hat eigene kostenpflichtige Bedingungen (nicht abrufbar am 17.10.2026). Bezahlte Beratung, Support und Workflow-Bau für Kunden sind ausdrücklich erlaubt. Kontakt: license@n8n.io, sales@n8n.io.

**FAQ (Repo-Quelle n8n-docs):** Erlaubt: n8n fürs eigene Geschäft; Automationen für Kunden auf der eigenen Instanz, solange Kunden sie nicht erstellen oder bearbeiten können; n8n unsichtbar als Backend im eigenen Produkt, bei dem Nutzer vorgefertigte Automationen auslösen. Entscheidend ist, wer die Workflow-Logik kontrolliert. Nicht erlaubt: n8n als Dienst hosten, in dem Kunden Workflows bauen; externe Nutzer Workflows konfigurieren lassen (auch per API, MCP oder KI-Agent); Fork für ein eigenes Automationsprodukt; White-Labeling; „Automation-as-a-Service“, dessen Kernwert die Automationsfähigkeit ist; Enterprise-Features ohne Lizenz. „n8n Embed“ (https://docs.n8n.io/embed/, nicht abrufbar) ist der vertragliche Weg für Einbettung/White-Label.

| Szenario | Einschätzung (keine Rechtsberatung) |
|---|---|
| a) Momentum nutzt n8n intern für Team-Portal und KI Office | Kernfall der SUL („interne Geschäftszwecke“) auf der selbst gehosteten Instanz: ohne weitere Lizenz zulässig, solange keine `.ee.`-Features ohne Schlüssel genutzt werden. Auf n8n Cloud durch das Abo gedeckt. **Unkritisch.** |
| b) Späterer Kundenzugang zum KI Office, n8n läuft im Hintergrund | Von der FAQ als „Backend-Engine im eigenen Produkt“ gedeckt, **wenn** Kunden nie die n8n-Oberfläche sehen und keine Workflows erstellen, ändern oder konfigurieren (auch nicht indirekt über UI, API, MCP oder Agenten). Kritisch, sobald Kunden Workflow-Logik beeinflussen können. **Zulässig im Lese-/Auslöse-Modus; schriftliche Bestätigung von license@n8n.io einholen, bevor Kunden Logik beeinflussen.** Die Architektur des KI Office hält n8n hinter einer eigenen API-Schicht (Adaptergrenze `office/adapter/`), damit das möglich bleibt. |
| c) Verkauf des KI Office als Produkt | Als SaaS mit unsichtbarem n8n-Backend grundsätzlich wie b), aber mit der Warnung der FAQ, dass ein Produkt, dessen Wert überwiegend aus n8n-Funktionalität stammt, nicht erlaubt ist (Grauzone, Vorabklärung verlangt). n8n mitliefern (On-Premise, Docker-Bundle, Fork) verstößt gegen die Weitergabe-Regel: nur mit Embed-/Enterprise-Vereinbarung. Kunden Workflows bauen lassen: nur mit Embed/Enterprise. **Ohne schriftliche Vereinbarung mit n8n nicht starten.** |

## 5. Modellanbieter

**Anthropic (Claude API):** Modell-IDs `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5` auf der Modellübersicht bestätigt (gepinnte Snapshots; Mindestlaufzeit laut Seite bis Herbst 2027). Preise laut Preisseite (USD je Mio. Token): Haiku 5.5 0,10/0,50 (Prompts bis 100k Token), Sonnet 5.5 2/10, Opus 5.5 4/20; Batch 50 % Rabatt. Commercial Terms: kein Training auf Customer Content, Kunde erhält Rechte an Outputs, DPA per Verweis Bestandteil, Hinweispflicht gegenüber Nutzern zur Prüfung von Faktenaussagen. Datenaufbewahrung laut Docs-Seite: Konversationsinhalte standardmäßig nicht gespeichert außer bei „Covered Models“ (Fable/Mythos) mit 30-Tage-Pflicht; Haiku/Sonnet/Opus 5.5 zählen nicht dazu und sind Zero-Data-Retention-fähig (Einrichtung über Sales, gilt nicht für Batch, Files, Code Execution). Die Standard-Retention-Policy auf privacy.claude.com war nicht abrufbar am 17.10.2026; ein Presse-Auszug nennt 30 Tage als Regelfall ohne ZDR. **Vor Aussagen gegenüber Kunden direkt prüfen.**

**OpenAI (gpt-5-mini, Chat-Assistent, unverändert):** Alle OpenAI-Seiten nicht abrufbar am 17.10.2026; Angaben aus Suchauszügen: API-Daten werden seit 01.03.2023 standardmäßig nicht zum Training verwendet; Abuse-Monitoring-Logs bis 30 Tage; Zero Data Retention nur nach Genehmigung. Preise laut Auszug 0,25/2,00 USD je Mio. Token. Die Modellseite ist laut Auszug als **deprecated** markiert: Nachfolgemodell und Abschaltdatum für `assistent/workflow.js` prüfen (Restpunkt, Workflow wird nicht angefasst).

## 6. Nicht abrufbar / offen

| Punkt | Status | Nächster Schritt |
|---|---|---|
| sahni.ai/agentsofficev3 | nicht abrufbar | bei Bedarf selbst ansehen |
| ecom-orbit.de | nicht abrufbar, keine Suchtreffer | Timo ergänzt Beschreibung |
| GSAP Standard License Volltext | nicht abrufbar | vor Kundenverkauf prüfen; KI Office nutzt GSAP nicht |
| n8n Docs, n8n.io/legal, Cloud-AGB | nicht abrufbar | über GitHub-Repo belegt; Cloud-AGB im Account nachlesen |
| Supabase ToS/DPA/AUP | nicht abrufbar | Originale lesen, DPA abschließen |
| Anthropic Standard-Retention | nicht abrufbar | im Konto prüfen |
| OpenAI Modell-/Datenseiten | nicht abrufbar | Deprecation von gpt-5-mini verifizieren |
| Repo-Hygiene | – | `simple-icons`, `hyperframes` pinnen; Playwright als devDependency; jsPDF-Update; LICENSE-Datei fürs Repo |
