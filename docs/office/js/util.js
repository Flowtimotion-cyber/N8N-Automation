// KI Office: kleine Helfer (Escaping, Datum, Chips). Alles HTML wird per String gebaut: esc() für JEDEN Wert aus Daten.
export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2800); };
export const heute = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const dDate = s => s ? new Date(s + 'T00:00:00') : null;
export const fmtD = s => { if (!s) return ''; const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? dDate(s) : new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
export const fmtDT = s => { if (!s) return '–'; const d = new Date(s); return isNaN(d) ? '–' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
export const fmtZeit = s => { if (!s) return '–'; const d = new Date(s); return isNaN(d) ? '–' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
export const relativ = s => { if (!s) return 'nie'; const ms = Date.now() - new Date(s).getTime(); if (!isFinite(ms)) return '–'; const m = Math.round(ms / 60000); if (m < 1) return 'gerade eben'; if (m < 60) return 'vor ' + m + ' Min.'; const h = Math.round(m / 60); if (h < 48) return 'vor ' + h + ' Std.'; return 'vor ' + Math.round(h / 24) + ' Tagen'; };
export const ueberfaellig = a => a.deadline && a.status !== 'Erledigt' && dDate(a.deadline) < heute();
export const farbe = id => 'c' + (1 + (Math.abs([...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0)) % 6));
export const chip = (text, cls, title) => '<span class="chip ' + esc(cls || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(text) + '</span>';
export const kpi = (n, l, warn, href) => (href ? '<a class="kpi click' : '<div class="kpi') + (warn ? ' warn' : '') + '"' + (href ? ' href="' + esc(href) + '" style="text-decoration:none;color:inherit"' : '') + '><b>' + esc(n) + '</b><span>' + esc(l) + '</span>' + (href ? '</a>' : '</div>');
export const kurz = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export const opt = (arr, sel, lab) => arr.map(v => '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(lab ? lab(v) : (v || '–')) + '</option>').join('');
/** Sehr kleine Markdown-Teilmenge für Zusammenfassungen: Absätze, Zeilenumbrüche, **fett**, Links werden NICHT aktiv (nur Text). */
export function md(text) {
  return String(text || '').split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>').join('');
}
