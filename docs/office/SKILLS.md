# Skills: Prüfung externer Skill-Repositories

Prüfdatum: 17.10.2026 · Geprüft per Web-Recherche ohne Installation. Nichts wurde in dieser Sitzung installiert oder ausgeführt. Skills sind **Arbeitshilfen**, kein Sicherheitsnachweis.

## 0. Methode und Einschränkungen

- Geprüft wurden die Default-Branches (`main`) zum Prüfzeitpunkt. Commit-SHAs stammen aus `git ls-remote` gegen github.com, abgeglichen mit den Commit-Seiten. Der GitHub-API-Endpunkt `api.github.com/repos/…/commits` war aus der Prüfumgebung nicht abrufbar am 17.10.2026 (Proxy 403).
- Dateiinhalte wurden über raw.githubusercontent.com bzw. einen flachen, rein lesenden Checkout gelesen. Kein Hook und kein Skript wurde ausgeführt.
- „Skripte/Hooks“ meint Dateien, die ein Agent oder Plugin-Host ausführt (Shell/Python/JS), nicht Markdown-Anleitungen.

## 1. Repo-Übersicht

| Repo | Commit (HEAD, main) | Commit-Datum | Lizenz | Version lt. Manifest |
|---|---|---|---|---|
| anthropics/skills | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | 2026-10-09 | Apache-2.0 pro Skill (`skills/<name>/LICENSE.txt`); kein Root-LICENSE; docx/pdf/pptx/xlsx laut README nur „source-available“ | Marketplace 1.0.0 |
| n8n-io/skills | `180b8415e3b73f78828cfa01e908e67f89f2a139` | 2026-08-21 | Apache-2.0 | Plugin 1.2.0 |
| czlonkowski/n8n-skills | `c640094d949c5a7bfce7d51fc9c049e3dcd3be44` | 2026-10-15 | MIT (Hooks aus n8n-io/skills, Apache-2.0, siehe NOTICES) | Plugin 1.36.0 |
| trailofbits/skills | `5c99c03fb8a9ea568432ecbcba5d86e9f4ac2bf0` | 2026-10-15 | CC-BY-SA-4.0 | je Plugin, siehe unten |

## 2. Detailprüfung

### 2.1 anthropics/skills

README-Hinweis wörtlich: „These skills are provided for demonstration and educational purposes only.“ Das Marketplace-Plugin `example-skills` bündelt frontend-design und webapp-testing mit zehn weiteren Skills. Wer nur zwei Skills will, kopiert die beiden Ordner statt das Plugin zu installieren.

**frontend-design** (`skills/frontend-design/`): nur `SKILL.md` und `LICENSE.txt`. Reine Design-Anleitung (Typografie, Palette, Layout-Plan vor dem Code, Vermeidung des typischen „KI-Looks“). Keine Skripte, keine Hooks, kein Netzwerk.

**webapp-testing** (`skills/webapp-testing/`): `SKILL.md`, `LICENSE.txt`, `scripts/with_server.py`, drei Beispiele. `with_server.py` (110 Zeilen, nur Standardbibliothek) startet die übergebenen Server-Kommandos per `subprocess.Popen(..., shell=True)`, pollt `localhost:<port>` und beendet die Server danach. Keine externen Verbindungen, keine Downloads. Beispiele schreiben nach `/mnt/user-data/outputs/` (Sandbox-Pfad, lokal anpassen). Playwright und Chromium installiert der Skill nicht. Risiko: `shell=True` führt genau das aus, was du als `--server` übergibst.

### 2.2 n8n-io/skills (offiziell)

14 Skill-Ordner (nur `SKILL.md` + `references/`), Bash-Hooks, Plugin-Manifeste. Voraussetzung: n8n ≥ 2.2.0 mit Instance-level MCP; das Plugin fragt bei Installation die n8n-URL ab und registriert einen MCP-Server `n8n-mcp` auf `${n8n_url}/mcp-server/http` (eigene Instanz, kein Drittanbieter). Hooks: `SessionStart` lädt den Router-Skill, `PreToolUse` auf `mcp__.*__(validate_workflow|create_workflow_from_code|update_workflow|get_node_types|execute_workflow|test_workflow)` gibt Erinnerungstexte, `PostToolUse` auf `validate_workflow` greppt den SDK-Code. Alle Skripte gelesen: nur `jq`/`python3` zum JSON-Escapen, Marker-Dateien unter `${TMPDIR:-/tmp}/n8n-skills-state`, keine `curl`/`wget`-Aufrufe; die angekündigten „drift checks“ sind als TODO gestubbt. Jeder Hook „fails open“ (exit 0). Hinweis: Die Matcher greifen auf jeden MCP-Server mit gleichnamigen Tools, also auch auf den offiziellen n8n-MCP, und erhöhen den Kontextverbrauch.

### 2.3 czlonkowski/n8n-skills (Community)

15 Skills, zugeschnitten auf den Community-Server **n8n-mcp** (gleicher Autor, andere Tool-Namen als der offizielle n8n-MCP). Das mitgelieferte `mcp.json` zeigt auf den **gehosteten Drittdienst `https://api.n8n-mcp.com/mcp`** (OAuth-Login, n8n-Instanz wird dort verbunden); `.mcp.json.example` zeigt die Self-hosted-Variante (`npx n8n-mcp` mit API-Key). Hooks wie bei n8n-io (lokal, fail-open, keine HTTP-Aufrufe). Besonderheit `n8n-self-hosting`: leitet den Agenten an, per SSH auf Server zu gehen, Docker über `get.docker.com` zu installieren, Compose-Stacks auszurollen, `ufw` zu setzen. Sehr hohe Wirkung, nur mit ausdrücklicher Freigabe.

### 2.4 trailofbits/skills

Marketplace mit 44 Plugins; Lizenz CC-BY-SA-4.0 (Namensnennung, Share-alike bei veränderter Weitergabe; interne Nutzung unkritisch). Keines der fünf geprüften Plugins hat Hooks.

| Plugin | Version | allowed-tools | Skripte | Netzwerk/Downloads |
|---|---|---|---|---|
| differential-review | 1.1.4 | Read Write Grep Glob Bash | keine | keine eigenen; nutzt `git blame`, ggf. `gh pr view` |
| insecure-defaults | 2.0.3 | Bash Workflow | `workflows/audit.js` (startet viele Subagenten, Verify mit Opus) | keine; Kostenfaktor hoch |
| sharp-edges | 1.1.3 | Read Grep Glob (nur lesend) | keine | keine |
| static-analysis | 1.5.0 | semgrep: Bash Read Glob … | `run-scans.sh`, `merge_sarif.py`, CodeQL-Hilfsskripte | klont zur Laufzeit rund 12 Regel-Repos per `git clone --depth 1`; `--metrics=off`; Semgrep/CodeQL werden nicht installiert |
| supply-chain-risk-auditor | 2.0.4 | Read Write Bash Glob Grep | 4 Python-Skripte (Stdlib, `uv run`) | sendet Paketnamen/Versionen an api.osv.dev, registry.npmjs.org, api.npmjs.org, pypi.org, proxy.golang.org, api.deps.dev, api.github.com (nutzt `gh auth token`), api.scorecard.dev |

## 3. Ergebnistabelle

| Skill | Quelle | Commit/Version | Lizenz | Zweck | Skripte/Hooks | Netzwerk/Datenübermittlung | Prüfergebnis | Empfehlung |
|---|---|---|---|---|---|---|---|---|
| frontend-design | anthropics/skills `skills/frontend-design/` | `dbd4588` (2026-10-09) | Apache-2.0 | Gestaltungsleitfaden für UI | keine | keine | nur Markdown, unkritisch | **Nutzen** |
| webapp-testing | anthropics/skills `skills/webapp-testing/` | `dbd4588` (2026-10-09) | Apache-2.0 | Lokale Web-App mit Playwright testen, Screenshots | `scripts/with_server.py` (lokal), 3 Beispiele | nur localhost | Skript gelesen, keine externen Verbindungen | **Nutzen** (Beispielpfade anpassen) |
| differential-review | trailofbits/skills `plugins/differential-review/` | `5c99c03` (2026-10-15) / 1.1.4 | CC-BY-SA-4.0 | Sicherheitsorientiertes Diff-/PR-Review | keine; 1 Command, 1 Subagent | keine eigenen | nur Markdown | **Nutzen** als Review-Checkliste |
| sharp-edges | trailofbits/skills `plugins/sharp-edges/` | `5c99c03` (2026-10-15) / 1.1.3 | CC-BY-SA-4.0 | Footgun-/Default-Review (fail-open, CORS, Timeouts) | keine; nur lesend | keine | unkritisch | **Nutzen** für Supabase-Policies, n8n-Webhooks |
| n8n-skills (13 + Router) | n8n-io/skills | `180b841` (2026-08-21) / 1.2.0 | Apache-2.0 | Offizielle Best Practices zum offiziellen n8n-MCP | SessionStart-, 6 PreToolUse-, 1 PostToolUse-Hook (lokal, fail-open) | nur zur eigenen n8n-Instanz | Hooks gelesen, keine Telemetrie | **Nutzen**; ohne Hooks nur `skills/` übernehmen |
| n8n-mcp-skills (15) | czlonkowski/n8n-skills | `c640094` (2026-10-15) / 1.36.0 | MIT (+ Apache-2.0-Teile) | Best Practices für Community-Server n8n-mcp | Hooks lokal; `build.sh` nur Paketierung | `mcp.json` zeigt auf Drittdienst api.n8n-mcp.com; `n8n-self-hosting` arbeitet per SSH | nur sinnvoll mit n8n-mcp; Drittdienst-Option | **Weglassen** |
| insecure-defaults | trailofbits/skills | `5c99c03` / 2.0.3 | CC-BY-SA-4.0 | Automatisierter Audit auf unsichere Defaults | Workflow-Skript, viele Subagenten | keine | schwergewichtig, teuer | **Vorerst weglassen** |
| static-analysis | trailofbits/skills | `5c99c03` / 1.5.0 | CC-BY-SA-4.0 | Semgrep-/CodeQL-Scans | Shell/Python/Workflows | klont Regel-Repos zur Laufzeit | für Vanilla JS + n8n-JSON wenig Mehrwert | **Weglassen** |
| supply-chain-risk-auditor | trailofbits/skills | `5c99c03` / 2.0.4 | CC-BY-SA-4.0 | Abhängigkeits-Audit | 4 Python-Skripte | sendet Abhängigkeitsliste an mehrere öffentliche APIs | transparent, führt keine Pakete aus | **Weglassen**, solange kaum npm-Abhängigkeiten |

## 4. Auswahl für dieses Projekt

1. **frontend-design** (Anthropic): reiner Prompt, keine Skripte.
2. **webapp-testing** (Anthropic): ein gelesenes Hilfsskript, nur localhost. In dieser Sitzung wurde der Ansatz (Playwright headless, Screenshots Desktop und Mobil) in `office/test/browser.test.mjs` eigenständig nachgebaut, ohne das Skript zu kopieren.
3. **differential-review** (Trail of Bits): Review-Checkliste für Änderungen an Auth, Supabase-Zugriff und n8n-Webhooks. Die Checkliste wurde beim Sicherheitsbericht (`SICHERHEIT.md`) als Arbeitshilfe genutzt.
4. **sharp-edges** (Trail of Bits): rein lesend; prüft genau die Fehlerklasse, die bei n8n/Supabase typisch ist.
5. **n8n-io/skills**: offiziell, passt zum offiziellen n8n-MCP, der schon genutzt wird.

Weggelassen: czlonkowski/n8n-skills (Drittdienst in `mcp.json`, SSH-Skill, Überschneidung), insecure-defaults (teuer), static-analysis (zusätzliche Toolchain, klont Regel-Repos), supply-chain-risk-auditor (sendet Abhängigkeitsliste nach außen; erst sinnvoll mit echten Abhängigkeiten).

## 5. Betriebshinweise

- Übernahme auf die genannten Commit-SHAs pinnen; bei Updates `SKILL.md`, `hooks/` und `scripts/` erneut lesen.
- Hooks wirken nur bei Plugin-Installation in Claude Code/Codex; das Kopieren einzelner Skill-Ordner nach `~/.claude/skills/` übernimmt keine Hooks.
- CC-BY-SA-4.0 (Trail of Bits): Namensnennung behalten; Share-alike nur bei veränderter Weitergabe.
- Keiner der empfohlenen Skills lädt Software nach oder sendet Daten an Dritte.
- In dieser Sitzung wurde **kein** Skill installiert. Die Auswahl ist eine Empfehlung an Timo; die Installation ist ein Restpunkt (`RESTPUNKTE.md`).
