// =====================================================================================================
// Team-Portal: Konfiguration
// =====================================================================================================
//
// Diese Datei liegt neben docs/team/index.html und wird dort vor dem eigentlichen Programm geladen:
//	<script src="konfig.js?v=1"></script>
// index.html ruft teamPortalKonfig() einmal auf und erhält ein Objekt mit allen Anbindungen und
// Einstellungen, die man gezielt ändern können soll, ohne in die große index.html zu gehen.
//
// Die Kommentare „→ index.html: …“ nennen die Konstante, die dort mit dem jeweiligen Wert belegt wird.
// Fehlt diese Datei oder lädt sie nicht, zeigt das Portal eine Fehlermeldung statt zu starten.
// Auch der TesterProxy (TesterProxy/proxy.mjs) liest diese Datei, um die Adresse der n8n-Instanz zu kennen.
//
// -----------------------------------------------------------------------------------------------------
// Rahmenbedingungen des Systems
// -----------------------------------------------------------------------------------------------------
// Portal (Browser):
//	- Eine einzelne Seite: HTML5 (<!doctype html>), reines JavaScript ohne Build-Schritt, ohne Framework,
//	  ohne Module (klassische <script>-Tags). Diese Datei darf deshalb kein import/export enthalten.
//	- Sprachstand: ES2020 (u. a. ??, async/await, Pfeilfunktionen). Benötigte Browser-Funktionen:
//	  <dialog>, fetch, crypto.subtle (Tresor), navigator.clipboard, MediaRecorder (Diktat).
//	  → aktuelle Chrome/Edge/Firefox/Safari. crypto.subtle und clipboard gibt es nur in einem
//	  „sicheren Kontext“, also über https oder http://127.0.0.1 / http://localhost (TesterProxy).
//	- Ausgeliefert über GitHub Pages aus dem Ordner docs/ (öffentlich lesbar!). Darum hier nur
//	  Adressen und Einstellungen, NIEMALS Schlüssel, Tokens oder Passwörter (die liegen nur in n8n).
//	- GitHub Pages hält Dateien bis ca. 10 Minuten im Zwischenspeicher: Nach einer Änderung an dieser
//	  Datei die Versionsnummer im <script src="konfig.js?v=…"> der index.html erhöhen.
//
// Node.js (nur für Werkzeuge im Repo, NICHT für das Portal selbst):
//	- TesterProxy, Tests (node --test mit Glob-Mustern) und Bau-Skripte der n8n-Workflows.
//	- Node.js 22 LTS oder neuer (node --test mit Glob-Mustern braucht mindestens 21); getestet mit 24.14.1.
//
// Server-Seite:
//	- n8n (Adresse siehe N8N_INSTANZ unten): Jede Funktion des Portals ist ein eigener Webhook-Workflow.
//	  Das Portal schickt nur den persönlichen Mitglieds-Token mit; n8n prüft Token und Rolle.
//	- Datenbank hinter n8n: Supabase oder eigenes PostgreSQL (Wahl: DATENBANK unten). Das Portal spricht
//	  die Datenbank NIE direkt an (kein Schlüssel im Browser); die Supabase-Angaben unten dienen nur der Orientierung.
//
// -----------------------------------------------------------------------------------------------------
// Konventionen
// -----------------------------------------------------------------------------------------------------
//	- Adressen ohne abschließenden Schrägstrich, außer wo es ausdrücklich dabeisteht (Ordner-Adressen).
//	- Webhook-Pfade: Kleinbuchstaben mit Bindestrich (team-…), identisch mit dem „Path“ im Webhook-Knoten
//	  des jeweiligen n8n-Workflows. Ein Pfad muss in n8n veröffentlicht (aktiv) sein, sonst antwortet
//	  n8n mit 404 („webhook not registered“).
//	- Die Adresse der n8n-Instanz steht nur ein einziges Mal im Code: in N8N_INSTANZ unten, in einfachen
//	  Anführungszeichen und ohne Schrägstrich am Ende. Alle Webhook-Adressen werden daraus gebildet.
//	  Der TesterProxy ersetzt beim Ausliefern genau dieses Literal (mit Anführungszeichen) durch
//	  location.origin, sodass alle Aufrufe über den Proxy laufen. Die Schreibweise also nicht ändern.
//	- Zeiten in Millisekunden (Suffix _ms bzw. …Ms), Längen in Zeichen.
// =====================================================================================================

function teamPortalKonfig() {
	'use strict';

	// Adresse der n8n-Instanz: das einzige Vorkommen im Code (siehe Konvention zum TesterProxy oben)
	const N8N_INSTANZ = 'https://n8n.hm-storage.de';
	// Gemeinsame Basis aller Portal-Webhooks
	const N8N_WEBHOOK_BASIS = N8N_INSTANZ + '/webhook/';

	// Datenbank hinter der Portal-API: 'supabase' oder 'postgre'.
	// Für jede Variante gibt es einen eigenen n8n-Workflow (gebaut von team/n8n/bauen.mjs); das Portal spricht nur
	// den hier gewählten an. Ist dessen Workflow in n8n nicht eingerichtet, zeigt das Portal eine Fehlermeldung und stoppt.
	const DATENBANK = 'supabase'; // 'postgre';
	const PORTAL_API = {
		supabase: { name: 'Supabase',   url: N8N_WEBHOOK_BASIS + 'team-api-v2',    workflow: 'TEAM: Portal-API v2 (Supabase, Agenten)',   id: 'kMuDaDmT9rCN5Vs2' },
		postgre:  { name: 'PostgreSQL', url: N8N_WEBHOOK_BASIS + 'team-api-v2-pg', workflow: 'TEAM: Portal-API v2 (PostgreSQL, Agenten)', id: '' }
	};

	const n8n = {
		instanz:       N8N_INSTANZ,
		webhookBasis:  N8N_WEBHOOK_BASIS,
		// Gewählte Datenbank-Variante und alle bekannten Varianten (für die Fehlermeldung im Portal)
		datenbank:     DATENBANK,
		portalApis:    PORTAL_API,
		// Fehler-Workflow, den alle TEAM-Workflows in ihren Einstellungen eingetragen haben
		fehlerWorkflowId: 'pka7MaqDJwuhjHpY',

		// Endpunkte des Portals. Je Eintrag: url, Workflow-Name in n8n, Workflow-ID, Konstante in index.html.
		webhooks: {
			// Hauptschnittstelle: Anmeldung, Aufgaben, Projekte, Notizen, Arbeitszeit, Team …
			// Workflow je nach DATENBANK (oben); null bei unbekannter Variante. → index.html: API
			portal:      Object.prototype.hasOwnProperty.call(PORTAL_API, DATENBANK) ? PORTAL_API[DATENBANK] : null,
			// Chat-Assistent (Knopf unten rechts). → index.html: KI_API
			assistent:   { url: N8N_WEBHOOK_BASIS + 'team-assistent',   workflow: 'TEAM: Portal-Assistent (Fragen zu Firma und Portal)', id: 'TJ5E1KT5MvzxvoD9' },
			// Nachrichtendienst (@-Markierungen). → index.html: MSGS_API
			nachrichten: { url: N8N_WEBHOOK_BASIS + 'team-msgs',        workflow: 'TEAM: Nachrichten (Portal)',                          id: '0tUWBdqqBPtnlfAj' },
			// Register „WhatsApp“. → index.html: WA_API
			whatsapp:    { url: N8N_WEBHOOK_BASIS + 'team-inbox',       workflow: 'TEAM: WhatsApp-Inbox (Portal)',                       id: 'PUrXB6zVrUjUpbGh' },
			// WhatsApp-Vorlage senden, wenn das 24-Stunden-Fenster zu ist. → index.html: WA_VORLAGE_API
			waVorlage:   { url: N8N_WEBHOOK_BASIS + 'team-inbox-vorlage', workflow: 'TEAM: WhatsApp-Vorlage senden (App)',                id: 'OsLyyXUA3G4WyETH' },
			// Team-Chat (Gruppen-, Direkt-, Projekt-Chats). → index.html: CHAT_API
			chat:        { url: N8N_WEBHOOK_BASIS + 'team-chat',        workflow: 'TEAM: Chat (Portal)',                                 id: 'EjzNbDUU28ngwKQi' },
			// Team-Chat: Sprachnachricht und „KI korrigieren“. → index.html: HELFER_API
			chatHelfer:  { url: N8N_WEBHOOK_BASIS + 'team-chat-helfer', workflow: 'TEAM: Chat-Helfer (Portal)',                          id: 'Udi7cuPyYwWUlWGT' },
			// Team-Chat: Dateianhänge. → index.html: ANHANG_API
			anhang:      { url: N8N_WEBHOOK_BASIS + 'team-anhang',      workflow: 'TEAM: Anhänge (Portal)',                              id: '26mU82EnBPDha4Fg' },
			// Register „Vertrieb“ (Twenty CRM). → index.html: VERTRIEB_API
			vertrieb:    { url: N8N_WEBHOOK_BASIS + 'team-vertrieb',    workflow: 'TEAM: Vertrieb-Pipeline (Twenty)',                    id: 'cWDiokGOeQT5uFsY' },
			// Register „Diktat“ (Transkription). → index.html: DIKTAT_API
			diktat:      { url: N8N_WEBHOOK_BASIS + 'team-diktat',      workflow: 'TEAM: Diktat',                                        id: 'Zvn018lfOXFuzenF' },
			// Register „Webseite“ (Statistik). → index.html: WEB_API
			webseite:    { url: N8N_WEBHOOK_BASIS + 'team-web',         workflow: 'TEAM: Webseiten-Statistik (Portal)',                  id: 'mkgTfndZQnmnpsdW' },
			// Register „ChatGPT-Werbung“ (nur Admins). → index.html: ADS_API
			werbung:     { url: N8N_WEBHOOK_BASIS + 'team-ads',         workflow: 'TEAM: ChatGPT-Werbung (Portal)',                      id: '0zGdfWautIznsbFU' },
			// Register „Kurs & Teilnehmer“ (Klassenbuch aus Notion). → index.html: KB_API
			klassenbuch: { url: N8N_WEBHOOK_BASIS + 'team-klassenbuch', workflow: 'TEAM: Klassenbuch (Notion → Portal)',                 id: 'nej6aYHT2S7Ztip2' },
			// Register „Social Media“ (Uploads und Ideen). → index.html: SOCIAL_API
			social:      { url: N8N_WEBHOOK_BASIS + 'team-social',      workflow: 'TEAM: Social-Upload',                                 id: 'ZfStqgtH3IZugnv5' },
			// Register „KI Office“. → index.html: OFFICE_API
			office:      { url: N8N_WEBHOOK_BASIS + 'office-api',       workflow: 'TEAM: Office-API',                                    id: 'NuK6m10yIGKMRWxC' }
		}
	};

	// Nur zur Orientierung: Das Portal greift nicht direkt auf Supabase zu, sondern immer über n8n.
	// Hier NIEMALS den anon- oder service_role-Schlüssel eintragen (diese Datei ist öffentlich).
	const supabase = {
		projekt:         'llhwmzhvhluamxwemaqx',
		url:             'https://llhwmzhvhluamxwemaqx.supabase.co',
		region:          'AWS eu-west-1',
		dashboard:       'https://supabase.com/dashboard/project/llhwmzhvhluamxwemaqx',
		// Name der Zugangsdaten in n8n, über die alle TEAM-Workflows auf die Datenbank zugreifen
		n8nZugangsdaten: 'Supabase account',
		// Tabellen und Funktionen: SQL-Dateien im Repo-Ordner supabase/ (Grundschema: team_schema.sql)
		sqlOrdner:       'supabase/'
	};

	// Weitere Anbindungen und Adressen, die bisher fest in index.html stehen
	const adressen = {
		// Öffentliche Adresse des Portals (für „Link kopieren“ und persönliche Anmelde-Links). → index.html: PORTAL
		portal:       'https://flowtimotion-cyber.github.io/N8N-Automation/team/',
		// KI Office, relativ zum Team-Portal (Ordner-Adresse, mit Schrägstrich). → index.html: OFFICE
		office:       '../office/',
		// Twenty CRM (Vertrieb). → index.html: TWENTY
		twenty:       'https://twenty.hm-storage.de',
		// Repo-Ansicht für Verweise auf Dateien (Ordner-Adresse, mit Schrägstrich). → index.html: REPO
		repo:         'https://github.com/Flowtimotion-cyber/N8N-Automation/blob/main/',
		// PDF-Erzeugung (wird erst bei Bedarf nachgeladen)
		jspdf:        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
	};

	// Einstellungen einzelner Bereiche
	const einstellungen = {
		nachrichten: {
			abrufTaktMs: 60000,	// → index.html: MSGS_TAKT_MS (wie oft auf neue Nachrichten geprüft wird)
			textMax:     20000	// → index.html: MSGS_TEXT_MAX (muss zur Grenze in der Supabase-Funktion passen)
		},
		whatsapp: {
			autoAktiv:   true	// → index.html: WA_AUTO_AKTIV (seit 23.11.2026 an, Vorlage neue_aufgabe freigegeben)
		},
		// Anleitungsvideo auf der Übersicht (Loom). → index.html: ANLEITUNG_VIDEO
		anleitungVideo: { id: 'd8374b76435f44bba6bae75895ded4bf', titel: 'So funktioniert das Portal', dauer: '9½ Minuten' }
	};

	return { n8n, supabase, adressen, einstellungen };
}
