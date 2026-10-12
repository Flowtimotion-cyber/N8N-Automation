// ---------- helpers for the artifact frame ----------
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
async function saveFile(name, data) {
  if (!CAP.dl) return copyText(data);
  try { await CAP.dl.save({ filename: name, data }); } catch (e) { if (e && e.code !== "declined") copyText(data); }
}
function merkText() {
  return [DATA.title, "", "Die 6 Merksätze:", ...DATA.levels.map((L, i) => (i + 1) + ". " + L.merksatz), "",
    "Mein Prozess-Steckbrief:", ...DATA.levels[5].own.map((n, k) => n + ": " + (S.own[k] || "–")), "",
    "XP: " + S.xp + (S.check ? " · Abschluss-Check: " + S.check.best + " / 10" : "")].join("\n");
}

// ---------- sync progress to the shared store ----------
let syncTimer = null, syncBusy = false, syncAgain = false, syncOff = false;
function snapshotForDb() {
  return { name: S.name || "", step: S.step, maxStep: S.maxStep || 0, totalSteps: STEPS.length - 1, xp: S.xp,
    done: S.done, levelsDone: Object.keys(S.done).length, check: S.check, own: S.own, updatedAt: new Date().toISOString() };
}
function syncLater() { if (!CAP.db || !CAP.uid || syncOff) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 1200); }
async function syncNow() {
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  try { await CAP.db.doc("progress/" + CAP.uid).set(snapshotForDb()); }
  catch (e) { if (e && (e.code === "invalid_argument" || e.code === "revoked" || e.code === "not_granted")) syncOff = true; }
  syncBusy = false;
  if (syncAgain) { syncAgain = false; syncNow(); }
}

// ---------- newsletter opt-in ----------
const CONSENT = "Ja, ich möchte den Newsletter mit Tipps zu KI und Automationen per E-Mail erhalten. Ich kann mich jederzeit wieder abmelden.";
function newsletterBox(sc) {
  const c = el("div", "card nl"); sc.appendChild(c);
  c.innerHTML = '<div class="kicker">Newsletter</div><h2>Bleib dran an Teil 2 und 3</h2><p class="muted">Trag deine E-Mail-Adresse ein, dann erfährst du, sobald die nächsten Teile und neue Praxisbeispiele online sind.</p>';
  const body = el("div"); c.appendChild(body);
  if (!CAP.db || !CAP.uid) { body.innerHTML = '<div class="fb neutral">Die Anmeldung funktioniert nur, wenn du bei Claude angemeldet bist und diese Seite über den Kurslink geöffnet hast.</div>'; return; }
  const ref = CAP.db.doc("newsletter/" + CAP.uid);
  const showDone = (email) => {
    body.innerHTML = ""; body.appendChild(el("div", "fb ok", "Eingetragen: <b>" + esc(email) + "</b>. Bitte bestätige die Anmeldung gleich in der E-Mail, die du dazu bekommst."));
    const out = el("button", "btn sec", "Wieder austragen"); out.style.marginTop = "12px";
    confirmBtn(out, async () => { try { await ref.delete(); toast("Ausgetragen"); showForm(email); } catch (e) { toast("Austragen hat nicht geklappt. Bitte später erneut versuchen."); } });
    body.appendChild(out);
  };
  const showForm = (prefill) => {
    body.innerHTML = "";
    const f = el("form", "nlform"); f.noValidate = true;
    const lb = el("label", "", "E-Mail-Adresse"); lb.htmlFor = "nl-email";
    const inp = el("input"); inp.type = "email"; inp.id = "nl-email"; inp.autocomplete = "email"; inp.placeholder = "name@firma.de"; inp.value = prefill || "";
    const cb = el("label", "consent"); const box = el("input"); box.type = "checkbox"; box.id = "nl-consent"; cb.appendChild(box); cb.appendChild(el("span", "", esc(CONSENT)));
    const btn = el("button", "btn", "Zum Newsletter anmelden"); btn.type = "submit";
    const msg = el("div");
    f.append(lb, inp, cb, btn, msg); body.appendChild(f);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = inp.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.innerHTML = '<div class="fb bad">Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@firma.de.</div>'; inp.focus(); return; }
      if (!box.checked) { msg.innerHTML = '<div class="fb bad">Bitte setz den Haken, damit wir dir den Newsletter schicken dürfen.</div>'; return; }
      btn.disabled = true; btn.textContent = "Wird eingetragen …";
      try { await ref.set({ email, consent: true, consentText: CONSENT, consentAt: new Date().toISOString(), source: "Modul 1.1", name: S.name || "" }); showDone(email); toast("Danke!"); }
      catch (e) { btn.disabled = false; btn.textContent = "Zum Newsletter anmelden"; msg.innerHTML = '<div class="fb bad">' + (e && e.code === "invalid_argument" ? "Mit deinem Zugang kann diese Seite nichts speichern. Bitte wende dich an die Kursleitung." : "Das Eintragen hat gerade nicht geklappt. Bitte versuch es in einer Minute noch einmal.") + '</div>'; }
    });
  };
  body.innerHTML = '<p class="muted">Lädt …</p>';
  ref.get().then(s => { if (s.exists) showDone(s.data().email); else CAP.user.email().then(m => showForm(m || "")); }).catch(() => showForm(""));
}

// ---------- owner dashboard ----------
let dashOpen = false;
function csvCell(v) { v = v == null ? "" : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function toCsv(rows) { return "﻿" + rows.map(r => r.map(csvCell).join(";")).join("\n"); }
const fmtDate = iso => { try { return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); } catch (e) { return iso || ""; } };
async function openDash() {
  dashOpen = true; $("#main").hidden = true; $(".navbar").hidden = true; $("#dash").hidden = false; $("#dashbtn").textContent = "Zum Kurs";
  const d = $("#dash"); d.innerHTML = '<div class="card"><p class="muted">Lade Teilnehmer …</p></div>';
  let prog = [], nl = [];
  try { const [a, b] = await Promise.all([CAP.db.collection("progress").get(), CAP.db.collection("newsletter").orderBy("consentAt", "desc").get()]);
    prog = a.docs.map(x => ({ id: x.id, ...x.data() })); nl = b.docs.map(x => ({ id: x.id, ...x.data() })); }
  catch (e) { d.innerHTML = '<div class="card"><div class="fb bad">Die Auswertung konnte nicht geladen werden. Lade die Seite neu und öffne sie erneut.</div></div>'; return; }
  const ps = await CAP.user.profiles([...new Set([...prog.map(p => p.id), ...nl.map(n => n.id)])]);
  const who = p => (ps[p.id] && ps[p.id].name) || p.name || "Teilnehmer ohne Namen";
  prog.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const passed = prog.filter(p => p.check && p.check.passed).length;
  const finished = prog.filter(p => p.levelsDone >= 6).length;
  d.innerHTML = "";
  const head = el("div", "card");
  head.innerHTML = '<div class="kicker">Auswertung · nur für dich sichtbar</div><h2>Teilnehmer und Newsletter</h2>' +
    '<div class="stats"><div><b>' + prog.length + '</b><span>gestartet</span></div><div><b>' + finished + '</b><span>alle 6 Level</span></div><div><b>' + passed + '</b><span>Check bestanden</span></div><div><b>' + nl.length + '</b><span>Newsletter</span></div></div>';
  d.appendChild(head);

  const t1 = el("div", "card"); d.appendChild(t1);
  t1.innerHTML = '<h3>Lernstand</h3>';
  if (!prog.length) t1.appendChild(el("p", "muted", "Noch niemand hat den Kurs gestartet. Sobald Teilnehmer angemeldet loslegen, erscheinen sie hier."));
  else {
    const wrap = el("div", "tbl"); const tb = el("table");
    tb.innerHTML = '<thead><tr><th>Teilnehmer</th><th>Level</th><th>Fortschritt</th><th class="num">XP</th><th>Check</th><th>Zuletzt aktiv</th></tr></thead>';
    const body = el("tbody"); tb.appendChild(body);
    prog.forEach(p => {
      const pct = Math.round((p.maxStep || 0) / (p.totalSteps || 1) * 100);
      const ck = p.check ? '<span class="pill ' + (p.check.passed ? "ok" : "bad") + '">' + p.check.best + ' / 10' + (p.check.passed ? " bestanden" : "") + '</span>' : '<span class="pill">offen</span>';
      const tr = el("tr"); tr.innerHTML = '<td class="who"></td><td class="num">' + (p.levelsDone || 0) + ' / 6</td><td><div class="bar"><i style="width:' + pct + '%"></i></div><small class="muted">' + pct + ' %</small></td><td class="num">' + (p.xp || 0) + '</td><td>' + ck + '</td><td class="muted">' + esc(fmtDate(p.updatedAt)) + '</td>';
      $(".who", tr).textContent = who(p);
      const filled = (p.own || []).filter(x => x && x.trim()).length;
      if (filled) { const b = el("button", "linkbtn", "Steckbrief"); $(".who", tr).appendChild(document.createElement("br")); $(".who", tr).appendChild(b);
        const tr2 = el("tr", "sub"); tr2.hidden = true; const td = el("td"); td.colSpan = 6; tr2.appendChild(td);
        DATA.levels[5].own.forEach((n, k) => { const pp = el("p"); const bb = el("b"); bb.textContent = n + ": "; pp.appendChild(bb); pp.appendChild(document.createTextNode((p.own || [])[k] || "–")); td.appendChild(pp); });
        b.onclick = () => { tr2.hidden = !tr2.hidden; }; body.appendChild(tr); body.appendChild(tr2); }
      else body.appendChild(tr);
    });
    wrap.appendChild(tb); t1.appendChild(wrap);
    const r = el("div", "row"); const ex = el("button", "btn sec", "Lernstand als CSV"); r.appendChild(ex); t1.appendChild(r);
    ex.onclick = () => saveFile("Lernstand_Modul-1-1.csv", toCsv([["Teilnehmer", "Level", "Fortschritt %", "XP", "Check beste Wertung", "Check bestanden", "Zuletzt aktiv", ...DATA.levels[5].own.map(n => "Steckbrief " + n)],
      ...prog.map(p => [who(p), p.levelsDone || 0, Math.round((p.maxStep || 0) / (p.totalSteps || 1) * 100), p.xp || 0, p.check ? p.check.best : "", p.check && p.check.passed ? "ja" : "nein", fmtDate(p.updatedAt), ...DATA.levels[5].own.map((n, k) => (p.own || [])[k] || "")])]));
  }

  const t2 = el("div", "card"); d.appendChild(t2);
  t2.innerHTML = '<h3>Newsletter-Anmeldungen</h3><p class="muted">Importiere die Liste in dein Newsletter-Tool und schick dort die Bestätigungsmail (Double-Opt-In). Erst danach ist die Anmeldung rechtlich sauber.</p>';
  if (!nl.length) t2.appendChild(el("p", "muted", "Noch keine Anmeldungen."));
  else {
    const wrap = el("div", "tbl"); const tb = el("table"); tb.innerHTML = '<thead><tr><th>E-Mail</th><th>Teilnehmer</th><th>Eingetragen am</th><th>Quelle</th></tr></thead>';
    const body = el("tbody"); tb.appendChild(body);
    nl.forEach(n => { const tr = el("tr"); tr.innerHTML = '<td class="mail"></td><td class="who"></td><td class="muted">' + esc(fmtDate(n.consentAt)) + '</td><td class="muted">' + esc(n.source || "") + '</td>'; $(".mail", tr).textContent = n.email; $(".who", tr).textContent = who(n); body.appendChild(tr); });
    wrap.appendChild(tb); t2.appendChild(wrap);
    const r = el("div", "row"); const ex = el("button", "btn sec", "Newsletter-Liste als CSV"); const cp = el("button", "btn sec", "Adressen kopieren"); r.append(ex, cp); t2.appendChild(r);
    ex.onclick = () => saveFile("Newsletter_Modul-1-1.csv", toCsv([["E-Mail", "Name", "Einwilligung am", "Einwilligungstext", "Quelle"], ...nl.map(n => [n.email, who(n), n.consentAt, n.consentText, n.source])]));
    cp.onclick = () => copyText(nl.map(n => n.email).join("\n"));
  }
}
function closeDash() { dashOpen = false; $("#dash").hidden = true; $("#main").hidden = false; $(".navbar").hidden = false; $("#dashbtn").textContent = "Auswertung"; render(); }

// ---------- capabilities boot ----------
(async () => {
  if (!window.claude || !window.claude.use) return;
  const [db, user, dl] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("downloads")]);
  CAP.db = db; CAP.user = user; CAP.dl = dl;
  if (user) { CAP.uid = await user.id(); CAP.owner = await user.isOwner(); }
  if (CAP.owner && db) { const b = $("#dashbtn"); b.hidden = false; b.onclick = () => dashOpen ? closeDash() : openDash(); }
  if (db && CAP.uid) {
    // resume on another device: take the stored state when this browser has none
    if (!S.maxStep && !S.xp) {
      try { const s = await db.doc("progress/" + CAP.uid).get();
        if (s.exists) { const r = s.data(); S = { ...fresh(), name: r.name || "", step: r.step || 0, maxStep: r.maxStep || 0, xp: r.xp || 0, done: { ...(r.done || {}) }, check: r.check ? { ...r.check } : null, own: [...(r.own || ["", "", "", "", ""])] };
          try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} if (!dashOpen) render(); toast("Fortschritt geladen"); }
      } catch (e) {}
    }
    if (STEPS[S.step].k === "summary" && !dashOpen) render();
  }
})();
