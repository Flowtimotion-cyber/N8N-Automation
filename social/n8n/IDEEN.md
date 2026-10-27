# Ideen-Briefkasten (Social Media)

Das ganze Team teilt oben im Reiter **Social Media** Ideen, Links zu guten Posts, Bilder oder eigene Videos.

## Bausteine

| Teil | Wo | Was |
|---|---|---|
| Tabelle `team_social_ideen` + Bucket `social-ideen` | `supabase/team_social_ideen.sql` | Einmal im Supabase-SQL-Editor ausführen |
| **TEAM: Social-Ideen-API (Portal)** | n8n `gThnlTbObVDF67Wl`, aktiv, `POST /webhook/social-ideen-api` | Body `{token, aktion, daten}` als text/plain. Token wird gegen `team_mitglieder` geprüft. Aktionen: `liste`, `speichern`, `upload_url` (signierter Supabase-Upload, Browser lädt direkt hoch), `status` (nur admin/dozent). Origin nur GitHub Pages. |
| **SOCIAL: Team-Ideen lesen & markieren (intern, Claude)** | n8n `jxssRs6T9gZQCYTR`, inaktiv, nur über n8n-MCP | `{aktion:'offen'}` liefert neue/eingeplante Ideen. `{aktion:'markieren', idee_id, status, notiz, post_id}` setzt den Stand. |
| Portal-Karte „💡 Ideen & Material“ | `docs/team/index.html` (`ideenKarte`, `ideenBinden`) | Formular mit Text, Link, Datei-Upload (Fortschritt), Liste offener Ideen, Status-Auswahl für admin/dozent |

## Ablauf in der täglichen Content-Aufgabe

1. Offene Ideen lesen (intern-Workflow, `offen`).
2. Ideen/Links/Bilder fließen in Themenwahl und Hook ein, die Quelle kommt in `quelle` des Beitrags.
3. Videos (`art = video`): per Higgsfield `media_import_url` holen, mit dem Workflow „video-editing“ (Schnitt, animierter Text, Momentum-Farben) bzw. „video-montage“ (Untertitel, Musik) zum 9:16-Reel machen, über „SOCIAL: Medien als JPEG ablegen“ in `social-medien` ablegen und als Reel „Zur Freigabe“ einstellen.
4. Idee markieren: `eingeplant` bzw. `umgesetzt` mit `post_id`.

Freigabe bleibt beim Menschen: Agenten setzen höchstens „Zur Freigabe“.

## Grenzen

- Dateigröße: Supabase Free erlaubt 50 MB pro Datei. Für längere Handyvideos das Projekt-Limit unter Storage > Settings anheben (Pro-Plan) oder das Video vorher kürzen.
