echo on
rem TesterProxy mit Testkopie (team/n8n/bauen-testkopien.mjs): die Portal-API laeuft ueber den TEST-Workflow in n8n.
rem Social laeuft ueber den Live-Workflow (TEST: Social-Upload am 27.11.2026 archiviert). Fuer eine neue Social-Testkopie
rem diese importieren und ",team-social=team-social-test" an die Umleitung anhaengen.
cd /d "%~dp0.."
node TesterProxy\proxy.mjs docs --umleiten team-api-v2=team-api-v2-test
pause
