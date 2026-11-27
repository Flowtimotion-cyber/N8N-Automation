# Hinweise für Claude Code in diesem Repository

## Quelltext-Formatierung

Die verbindliche Quelle ist `.editorconfig`. Claude Code liest sie nicht von selbst, deshalb steht das Wichtigste hier.

- Einrückung mit **Tabs**, nicht mit Leerzeichen; ein Tab entspricht 4 Leerzeichen.
- Das gilt auch für umgebrochene Zeilen (z. B. umgebrochene Funktionsparameter): Der Leerraum am Zeilenanfang besteht nur aus Tabs, auch wenn damit ausgerichtet wird. Leerzeichen sind nur für die Ausrichtung mitten in der Zeile erlaubt (z. B. vor `=`).
- Öffnende geschweifte Klammern stehen am Ende der Zeile, die sie verursacht, nicht in einer eigenen Zeile:

  ```js
  function pruefen(x) {
  	if (x) {
  		...
  	}
  }
  ```

- Ausnahmen, weil das Format es verlangt:
  - `package.json`, `package-lock.json`: 2 Leerzeichen (so schreibt es npm).
  - `*.py`: 4 Leerzeichen (PEP 8).
  - `*.md`: Leerzeichen (2), sonst werden Listen und Code-Blöcke falsch dargestellt; zwei Leerzeichen am Zeilenende sind ein Zeilenumbruch und bleiben stehen.
  - `*.yml`, `*.yaml`: 2 Leerzeichen (YAML erlaubt keine Tabs).
- Bestehende Dateien, die noch mit Leerzeichen eingerückt sind, nicht nebenbei komplett umstellen (großer Diff, Merge-Konflikte). Neue und geänderte Zeilen trotzdem mit Tabs. Eine ganze Datei umzustellen ist ein eigener Commit ohne inhaltliche Änderungen.

## Zeilenenden

- Alle Textdateien mit **LF**, auch unter Windows.
- Ausnahme: Windows-Stapeldateien (`*.bat`, `*.cmd`) mit **CRLF**.
- `.gitattributes` setzt das beim Auschecken durch; trotzdem beim Schreiben einer Datei gleich das richtige Zeilenende verwenden und keine gemischten Zeilenenden erzeugen. Bei LF ist das wichtig, weil Windows mit `core.autocrlf=true` sonst ein anderes n8n-Bündel erzeugt und Shell-Skripte unter Linux mit CRLF nicht laufen.
- Zeichensatz UTF-8 (ohne BOM).
