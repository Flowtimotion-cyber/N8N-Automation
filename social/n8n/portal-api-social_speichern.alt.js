  case 'social_speichern': {
    const thema = txt(d.thema, 160);
    if (thema.length < 3) return raus(400, 'Bitte gib dem Beitrag ein Thema.');
    const KAN = ['LinkedIn', 'Instagram', 'Facebook', 'YouTube', 'TikTok', 'Newsletter', 'Webseite / Blog', 'Sonstiges'];
    const ST = ['Idee', 'In Arbeit', 'Zur Freigabe', 'Geplant', 'Veröffentlicht'];
    const altP = /^p_[\w]+$/.test(d.post_id || '') ? d.post_id : '';
    const row = { post_id: altP || neueId('p'), thema, text: txt(d.text, 4000),
      datum: /^\d{4}-\d{2}-\d{2}$/.test(String(d.datum || '')) ? d.datum : '', kanal: KAN.includes(d.kanal) ? d.kanal : 'Sonstiges',
      status: ST.includes(d.status) ? d.status : 'Idee', verantwortlich: mitgliedDa(d.verantwortlich) ? d.verantwortlich : ich.mitglied_id,
      link: /^https?:\/\//.test(String(d.link || '')) ? txt(d.link, 400) : '', geaendert: jetzt };
    if (istAgent && ['Geplant', 'Veröffentlicht'].includes(row.status)) row.status = 'Zur Freigabe';
    return schreiben([altP ? aend('team_social', 'post_id', altP, row) : neu('team_social', row)], { id: row.post_id });
  }
