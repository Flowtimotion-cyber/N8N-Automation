// ---------- Klassen-Version: Lernstand an n8n, Ergebnis-Mail, Setup-Assistent ----------
const WEBHOOK = "https://n8n.hm-storage.de/webhook/kurs-lernstand";
const KURS = "Modul 1.1";
const TID_KEY = "m11-teilnehmer-id";
CAP.dl = { save: async ({ filename, data }) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "text/plain;charset=utf-8" })); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); } };

function teilnehmerId() {
  let id = null;
  try { id = localStorage.getItem(TID_KEY); } catch (e) {}
  if (!id) {
    const r = new Uint8Array(12); crypto.getRandomValues(r);
    id = "t_" + Array.from(r, b => b.toString(16).padStart(2, "0")).join("");
    try { localStorage.setItem(TID_KEY, id); } catch (e) {}
  }
  return id;
}

// helpers (same as artifact version)
function copyText(txt) {
  const fallback = () => { const ta = el("textarea"); ta.value = txt; ta.className = "copybox"; document.body.appendChild(ta); ta.select(); toast("Text markiert – jetzt kopieren"); setTimeout(() => ta.remove(), 15000); };
  try { navigator.clipboard.writeText(txt).then(() => toast("Kopiert"), fallback); } catch (e) { fallback(); }
}
function confirmBtn(b, action) {
  const label = b.textContent; let armed = false, t;
  b.onclick = () => {
    if (!armed) { armed = true; b.textContent = "Wirklich? Nochmal tippen"; b.classList.add("warn"); t = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove("warn"); }, 3500); return; }
    clearTimeout(t); action();
  };
}
async function saveFile(name, data) { try { await CAP.dl.save({ filename: name, data }); } catch (e) { copyText(data); } }
function merkText() {
  return [DATA.title, "", "Die 6 Merksätze:", ...DATA.levels.map((L, i) => (i + 1) + ". " + L.merksatz), "",
    "Mein Prozess-Steckbrief:", ...DATA.levels[5].own.map((n, k) => n + ": " + (S.own[k] || "–")), "",
    "XP: " + S.xp + (S.check ? " · Abschluss-Check: " + S.check.best + " / 10" : "")].join("\n");
}

// ---------- Lernstand senden ----------
function payload(extra) {
  return Object.assign({
    kurscode: S.kurscode || "", teilnehmer_id: teilnehmerId(), name: S.name || "", kurs: KURS,
    level_fertig: Object.keys(S.done).length, fortschritt_prozent: Math.round((S.maxStep || 0) / (STEPS.length - 1) * 100),
    xp: S.xp, check_best: S.check ? S.check.best : null, check_bestanden: !!(S.check && S.check.passed), steckbrief: S.own
  }, extra || {});
}
function post(body) {
  return fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
}
let syncTimer = null, lastSent = "";
function syncLater() {
  if (!S.name || !S.kurscode) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { const b = payload(); const k = JSON.stringify(b); if (k === lastSent) return; lastSent = k; post(b).catch(() => { lastSent = ""; }); }, 1500);
}
window.addEventListener("pagehide", () => { if (syncTimer) { clearTimeout(syncTimer); const b = payload(); if (JSON.stringify(b) !== lastSent && S.name && S.kurscode) post(b).catch(() => {}); } });

// ---------- Startseite: Name + Kurscode sind Pflicht ----------
const _renderStart = renderStart;
renderStart = function (sc) {
  _renderStart(sc);
  const card = $(".card", sc); const nameInp = $("input[type=text]", card);
  nameInp.id = "tn-name"; nameInp.placeholder = "Vor- und Nachname";
  const nameLabel = nameInp.previousElementSibling; if (nameLabel) { nameLabel.innerHTML = "Dein Name"; nameLabel.htmlFor = "tn-name"; }
  const lb = el("label", "", "Kurscode <span class=\"muted\" style=\"font-weight:500\">(bekommst du von deiner Kursleitung)</span>"); lb.htmlFor = "tn-code"; lb.style.cssText = "font-weight:700;display:block;margin:14px 0 8px";
  const code = el("input"); code.type = "text"; code.id = "tn-code"; code.autocomplete = "off"; code.placeholder = "z. B. ABC123"; code.value = S.kurscode || "";
  nameInp.after(lb, code);
  const note = $("p.small", card); if (note) note.textContent = "Mit deinem Namen und dem Kurscode speichert die Kursleitung deinen Lernstand: erledigte Level, XP, Check-Ergebnis und deinen Prozess-Steckbrief. Andere Teilnehmer sehen davon nichts.";
  const gate = () => { const ok = (S.name || "").length >= 2 && (S.kurscode || "").length >= 3; setNext(ok, "Los geht’s"); };
  nameInp.addEventListener("input", gate);
  code.addEventListener("input", () => { S.kurscode = code.value.trim().toUpperCase(); save(); gate(); });
  gate();
};

// ---------- Abschluss: Zusammenfassung per Mail, Ausblick ----------
function newsletterBox(sc) {
  const c = el("div", "card nl"); sc.appendChild(c);
  c.innerHTML = '<div class="kicker">Für deinen Rechner</div><h2>Zusammenfassung per E-Mail</h2><p class="muted">Wir schicken dir deinen Prozess-Steckbrief und die Merksätze als E-Mail. So hast du alles für Teil 2 griffbereit.</p>';
  const f = el("form", "nlform"); f.noValidate = true; c.appendChild(f);
  const lb = el("label", "", "E-Mail-Adresse"); lb.htmlFor = "tn-email";
  const inp = el("input"); inp.type = "email"; inp.id = "tn-email"; inp.autocomplete = "email"; inp.placeholder = "name@firma.de"; inp.value = S.email || "";
  const cb = el("label", "consent"); const box = el("input"); box.type = "checkbox"; box.id = "tn-consent"; cb.appendChild(box);
  cb.appendChild(el("span", "", "Ja, schickt mir meine Zusammenfassung an diese Adresse. Die Adresse wird nur dafür und für Infos zu diesem Kurs genutzt."));
  const btn = el("button", "btn", "Zusammenfassung senden"); btn.type = "submit";
  const msg = el("div"); f.append(lb, inp, cb, btn, msg);
  if (S.mailSentTo) msg.innerHTML = '<div class="fb ok">Zuletzt gesendet an <b>' + esc(S.mailSentTo) + '</b>. Du kannst sie jederzeit erneut anfordern.</div>';
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = inp.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.innerHTML = '<div class="fb bad">Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@firma.de.</div>'; inp.focus(); return; }
    if (!box.checked) { msg.innerHTML = '<div class="fb bad">Bitte setz den Haken, damit wir dir die E-Mail schicken dürfen.</div>'; return; }
    if (!S.name || !S.kurscode) { msg.innerHTML = '<div class="fb bad">Name oder Kurscode fehlen. Trag beides auf der Startseite ein.</div>'; return; }
    btn.disabled = true; btn.textContent = "Wird gesendet …";
    try {
      const r = await post(payload({ email, mail_senden: true, merksaetze: DATA.levels.map(L => L.merksatz) }));
      if (!r.ok) throw new Error(r.status);
      S.email = email; S.mailSentTo = email; save();
      msg.innerHTML = '<div class="fb ok">Abgeschickt! Die E-Mail kommt in den nächsten Minuten. Schau auch im Spam-Ordner nach.</div>';
    } catch (e) { msg.innerHTML = '<div class="fb bad">Das hat gerade nicht geklappt. Prüf deine Internetverbindung und versuch es noch einmal.</div>'; }
    btn.disabled = false; btn.textContent = "Zusammenfassung senden";
  });

  const next = el("div", "card nl");
  next.innerHTML = '<div class="kicker">Wie es weitergeht</div><h2>Teil 2, Teil 3 und Hermes</h2>' +
    '<div class="outlook">' +
    '<div><b>Teil 2 · Automationen bauen lassen</b><span>Du verbindest n8n mit Claude Code und lässt aus deinem Steckbrief die erste Automation bauen. Kein Claude-Abo? Mit ChatGPT geht es auch.</span></div>' +
    '<div><b>Teil 3 · Dein eigener Server</b><span>n8n auf einem eigenen Server bei Hetzner, inklusive Umzug deiner Workflows.</span></div>' +
    '<div class="soon"><b>Bald · Modul Hermes</b><span>Dein eigener KI-Agent, der für dich mitarbeitet. Ein eigenes Modul ist in Vorbereitung.</span></div>' +
    '</div><p class="muted" style="margin-top:14px">Fragen zum Einrichten? Unten rechts hilft dir der Setup-Assistent, auch mit Screenshots.</p>';
  sc.appendChild(next);
}

// ---------- Setup-Assistent (n8n Chat) ----------
(function loadChat() {
  const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdn.jsdelivr.net/npm/@n8n/chat@1.40.1/dist/style.css"; document.head.appendChild(css);
  const s = document.createElement("script"); s.type = "module";
  s.textContent = "import { createChat } from 'https://cdn.jsdelivr.net/npm/@n8n/chat@1.40.1/dist/chat.bundle.es.js';" +
    "createChat({ webhookUrl: 'https://n8n.hm-storage.de/webhook/55498f00-289d-43ca-899e-f23fbf4c0d69/chat', mode: 'window', showWelcomeScreen: false, loadPreviousSession: false," +
    " allowFileUploads: true, allowedFilesMimeTypes: 'image/*', defaultLanguage: 'en'," +
    " initialMessages: ['Hallo! Ich bin dein Setup-Assistent.', 'Frag mich alles zum Einrichten: Claude Code, ChatGPT, die Verbindung zu n8n oder deinen eigenen Server. Du kannst mir auch Screenshots schicken (Passwörter und Schlüssel vorher schwärzen).']," +
    " i18n: { en: { title: 'Setup-Assistent', subtitle: 'Hilfe beim Einrichten, Schritt für Schritt', footer: '', getStarted: 'Neues Gespräch', inputPlaceholder: 'Deine Frage …', closeButtonTooltip: 'Schließen' } } });";
  document.body.appendChild(s);
})();
