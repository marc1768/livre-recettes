/* Livre de recettes — PWA
 * Données : API Apps Script (Google Sheet) ; cache local pour le hors ligne.
 * Réglages (URL API + clé) stockés dans le navigateur de chaque appareil.
 */
(function () {
  'use strict';

  const DEFAULT_CATS = ['Entrée', 'Potage', 'Plat', 'Accompagnement', 'Sauce', 'Dessert', 'Apéro'];
  const DEFAULT_MODES = ['Air fryer', 'Four', 'Poêle', 'Casserole', 'Vapeur', 'Barbecue'];
  const DEFAULT_STATUTS = ['À tester', 'Testé – OK', 'Testé – à ajuster', 'Abandonné'];
  const DEFAULT_DEVICE = 'Severin FR 2462';
  const PHOTO_MAX = 1600, PHOTO_QUALITY = 0.8;

  const S = { data: [], listes: {}, maj: '', cat: '', q: '', mode: '', statut: '', view: 'list', id: null, busy: false };
  const $ = id => document.getElementById(id);
  const app = $('app');

  // ---------- stockage local (protégé : peut échouer en navigation privée) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoré */ } }
  };
  const cfg = () => store.get('lr_cfg', { url: '', key: '' });

  // Lien d'installation : index.html#setup=<URL API>|<clé>
  (function setupFromHash() {
    const m = location.hash.match(/^#setup=([^|]+)\|(.+)$/);
    if (!m) return;
    store.set('lr_cfg', { url: decodeURIComponent(m[1]), key: decodeURIComponent(m[2]) });
    history.replaceState(null, '', location.pathname + location.search);
  })();

  // ---------- utilitaires ----------
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const split = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  function photoSrc(u, w) {
    u = String(u || '').trim();
    const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([\w-]{20,})/);
    return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w' + (w || 1000) : u;
  }
  function toast(msg, err) {
    const t = $('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, err ? 6000 : 2500);
  }
  const listes = () => ({
    categories: (S.listes.categories && S.listes.categories.length) ? S.listes.categories : DEFAULT_CATS,
    modes: (S.listes.modes_cuisson && S.listes.modes_cuisson.length) ? S.listes.modes_cuisson : DEFAULT_MODES,
    statuts: (S.listes.statuts && S.listes.statuts.length) ? S.listes.statuts : DEFAULT_STATUTS
  });
  function catOrder() {
    const l = listes().categories.slice();
    S.data.forEach(r => { if (r.categorie && l.indexOf(r.categorie) < 0) l.push(r.categorie); });
    return l;
  }
  function stClass(st) {
    const n = norm(st);
    if (!n) return '';
    if (n.indexOf('ajuster') >= 0) return 'warn';
    if (n.indexOf('ok') >= 0 || n === 'teste') return 'ok';
    if (n.indexOf('tester') >= 0) return 'todo';
    return '';
  }
  const statusBadge = st => st ? '<span class="st ' + stClass(st) + '">' + esc(st) + '</span>' : '';
  function metaLine(r) {
    const m = [];
    if (r.temps_min) m.push('⏱ ' + esc(r.temps_min) + ' min');
    if (r.personnes) m.push('👤 ' + esc(r.personnes) + ' pers.');
    return m.join('<span>·</span>');
  }

  // ---------- API ----------
  async function apiGet() {
    const c = cfg();
    const r = await fetch(c.url + (c.url.indexOf('?') >= 0 ? '&' : '?') + 'action=list&key=' + encodeURIComponent(c.key), { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Erreur API');
    return j;
  }
  async function apiPost(body) {
    const c = cfg();
    if (!navigator.onLine) throw new Error('Pas de connexion : enregistrement impossible hors ligne.');
    // text/plain = requête "simple" : pas de pré-requête CORS, accepté par Apps Script
    const r = await fetch(c.url, { method: 'POST', body: JSON.stringify(Object.assign({ key: c.key }, body)) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Erreur API');
    return j;
  }

  // ---------- filtres ----------
  function filtered() {
    const q = norm(S.q);
    const o = catOrder();
    return S.data.filter(r => {
      if (S.cat && r.categorie !== S.cat) return false;
      if (S.mode && split(r.modes_cuisson).indexOf(S.mode) < 0) return false;
      if (S.statut && r.statut !== S.statut) return false;
      if (q) {
        const hay = norm([r.titre, r.categorie, r.modes_cuisson, r.ingredients, r.notes_marc].join(' '));
        if (q.split(/\s+/).some(w => hay.indexOf(w) < 0)) return false;
      }
      return true;
    }).sort((a, b) => (o.indexOf(a.categorie) - o.indexOf(b.categorie)) || String(a.titre).localeCompare(String(b.titre), 'fr'));
  }

  function buildFilters() {
    const cats = catOrder().filter(c => S.data.some(r => r.categorie === c));
    $('chips').innerHTML = ['<button class="chip' + (S.cat ? '' : ' on') + '" data-cat="">Toutes</button>']
      .concat(cats.map(c => '<button class="chip' + (S.cat === c ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>')).join('');
    const modes = [];
    S.data.forEach(r => split(r.modes_cuisson).forEach(m => { if (modes.indexOf(m) < 0) modes.push(m); }));
    $('fMode').innerHTML = '<option value="">Tous les modes de cuisson</option>' +
      modes.map(m => '<option' + (S.mode === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
    const sts = listes().statuts.slice();
    S.data.forEach(r => { if (r.statut && sts.indexOf(r.statut) < 0) sts.push(r.statut); });
    $('fStatut').innerHTML = '<option value="">Tous les statuts</option>' +
      sts.map(s => '<option' + (S.statut === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('');
  }

  // ---------- vue : liste ----------
  function renderList() {
    $('filters').style.display = '';
    const c = cfg();
    if (!c.url || !c.key) { renderSettings(true); return; }
    if (!S.data.length) { app.innerHTML = '<div class="empty">Aucune recette pour l\'instant. Ajoute la première avec « + Recette ».</div>'; return; }
    const list = filtered();
    let h = '<div class="count">' + list.length + ' recette' + (list.length > 1 ? 's' : '') + (S.maj ? ' · mis à jour ' + esc(S.maj) : '') + '</div>';
    if (!list.length) h += '<div class="empty">Aucune recette ne correspond aux filtres.</div>';
    h += '<div class="grid">' + list.map(r =>
      '<div class="card" data-id="' + esc(r.id) + '">' +
        (r.photo_url ? '<img class="thumb" loading="lazy" src="' + esc(photoSrc(r.photo_url, 600)) + '" alt="">' : '') +
        '<div class="cat">' + esc(r.categorie || 'Sans catégorie') + '</div>' +
        '<h3>' + esc(r.titre) + '</h3>' +
        '<div class="meta">' + metaLine(r) + '</div>' +
        '<div class="tags">' + split(r.modes_cuisson).map(m => '<span class="tag">' + esc(m) + '</span>').join('') + statusBadge(r.statut) + '</div>' +
      '</div>').join('') + '</div>';
    app.innerHTML = h;
  }

  // ---------- vue : fiche ----------
  function ingredientsHtml(r, interactive) {
    let h = '', open = false;
    lines(r.ingredients).forEach(l => {
      if (l.charAt(0) === '#') {
        if (open) h += '</ul>';
        h += '<h5>' + esc(l.replace(/^#+\s*/, '')) + '</h5><ul class="ing">'; open = true;
      } else {
        if (!open) { h += '<ul class="ing">'; open = true; }
        h += '<li>' + (interactive ? '<input type="checkbox">' : '') + '<span>' + esc(l.replace(/^[-•]\s*/, '')) + '</span></li>';
      }
    });
    return h + (open ? '</ul>' : '');
  }
  function reglagesHtml(r) {
    const groups = {}, order = [];
    lines(r.reglages_appareil).forEach(l => {
      let dev = '', rest = l;
      const p = l.indexOf('|');
      if (p >= 0) { dev = l.slice(0, p).trim(); rest = l.slice(p + 1).trim(); }
      let label = rest, val = '';
      const c = rest.lastIndexOf(' : ');
      if (c >= 0) { label = rest.slice(0, c).trim(); val = rest.slice(c + 3).trim(); }
      if (!groups[dev]) { groups[dev] = []; order.push(dev); }
      groups[dev].push([label, val]);
    });
    return order.map(d => (d ? '<div class="dev">' + esc(d) + '</div>' : '') +
      '<table class="reg">' + groups[d].map(x => '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>').join('') + '</table>').join('');
  }
  function recipeHtml(r, interactive) {
    let h = '<article class="recipe">' +
      '<div class="rcat">' + esc(r.categorie) + '</div>' +
      '<h2>' + esc(r.titre) + '</h2>' +
      '<div class="meta">' + metaLine(r) + '</div>' +
      '<div class="tags" style="margin-top:8px">' + split(r.modes_cuisson).map(m => '<span class="tag">' + esc(m) + '</span>').join('') + statusBadge(r.statut) + '</div>' +
      (r.photo_url ? '<img class="hero" src="' + esc(photoSrc(r.photo_url, 1200)) + '" alt="">' : '');
    if (r.reglages_appareil) h += '<h4>Réglages</h4>' + reglagesHtml(r);
    h += '<div class="cols"><div><h4>Ingrédients</h4>' + ingredientsHtml(r, interactive) + '</div>' +
         '<div><h4>Préparation</h4><ol class="steps">' + lines(r.etapes).map(s => '<li>' + esc(s.replace(/^\d+[.)]\s*/, '')) + '</li>').join('') + '</ol></div></div>';
    if (r.notes_marc) h += '<h4>Mes notes</h4><div class="note">' + esc(r.notes_marc) + '</div>';
    if (r.sources) h += '<h4>Sources</h4><div class="src">' + lines(r.sources).map(linkify).join('<br>') + '</div>';
    return h + '</article>';
  }
  function renderRecipe() {
    const r = S.data.find(x => String(x.id) === String(S.id));
    $('filters').style.display = 'none';
    if (!r) { S.view = 'list'; return render(); }
    app.innerHTML = '<div class="actions no-print"><button class="btn" data-act="back">← Retour</button>' +
      '<button class="btn" data-act="edit">✎ Modifier</button></div>' + recipeHtml(r, true);
    window.scrollTo(0, 0);
  }

  // ---------- vue : formulaire (création / modification) ----------
  let pending = null;   // { blob, dataUrl } photo choisie, envoyée à l'enregistrement
  function renderForm() {
    $('filters').style.display = 'none';
    const r = S.id ? (S.data.find(x => String(x.id) === String(S.id)) || {}) : {};
    const L = listes();
    const modesSel = split(r.modes_cuisson);
    const mode = r.id ? modesSel : ['Air fryer'];
    const allModes = L.modes.slice(); modesSel.forEach(m => { if (allModes.indexOf(m) < 0) allModes.push(m); });
    const opt = (arr, v) => arr.map(x => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    pending = null;
    app.innerHTML =
      '<form class="edit" id="form" autocomplete="off">' +
      '<h2>' + (r.id ? 'Modifier ' + esc(r.id) : 'Nouvelle recette') + '</h2>' +
      '<div class="field"><label for="f_titre">Titre *</label><input type="text" id="f_titre" required value="' + esc(r.titre) + '"></div>' +
      '<div class="row3">' +
        '<div class="field"><label for="f_cat">Catégorie</label><select id="f_cat">' + opt(L.categories, r.categorie || 'Plat') + '</select></div>' +
        '<div class="field"><label for="f_pers">Personnes</label><input type="number" min="1" id="f_pers" value="' + esc(r.personnes || 2) + '"></div>' +
        '<div class="field"><label for="f_temps">Temps (min)</label><input type="number" min="0" id="f_temps" value="' + esc(r.temps_min) + '"></div>' +
      '</div>' +
      '<div class="field"><span class="lbl">Modes de cuisson</span><div class="checks">' +
        allModes.map(m => '<label><input type="checkbox" name="mode" value="' + esc(m) + '"' + (mode.indexOf(m) >= 0 ? ' checked' : '') + '>' + esc(m) + '</label>').join('') +
      '</div></div>' +
      '<div class="field"><label for="f_ing">Ingrédients</label><small>Un ingrédient par ligne. Ligne commençant par « # » = sous-titre (ex. # Sauce).</small>' +
        '<textarea id="f_ing" rows="8">' + esc(r.ingredients) + '</textarea></div>' +
      '<div class="field"><label for="f_etp">Étapes</label><small>Une étape par ligne (numérotation automatique).</small>' +
        '<textarea id="f_etp" rows="8">' + esc(r.etapes) + '</textarea></div>' +
      '<div class="field"><label for="f_reg">Réglages appareil</label><small>Une ligne par réglage : « Appareil | Étape : valeur » — ex. ' + esc(DEFAULT_DEVICE) + ' | Cuisson : 180 °C, 12 min</small>' +
        '<textarea id="f_reg" rows="4" placeholder="' + esc(DEFAULT_DEVICE) + ' | Cuisson : 180 °C, 12 min">' + esc(r.reglages_appareil) + '</textarea></div>' +
      '<div class="row2">' +
        '<div class="field"><label for="f_st">Statut</label><select id="f_st">' + opt(L.statuts, r.statut || L.statuts[0]) + '</select></div>' +
        '<div class="field"><label for="f_src">Sources</label><input type="text" id="f_src" value="' + esc(lines(r.sources).join(' ; ')) + '" placeholder="Livre, site, Claude…"></div>' +
      '</div>' +
      '<div class="field"><label for="f_notes">Mes notes</label><textarea id="f_notes" rows="3" placeholder="Réglages réels, ajustements…">' + esc(r.notes_marc) + '</textarea></div>' +
      '<div class="field"><span class="lbl">Photo</span><div class="photo-box">' +
        '<img id="f_prev" alt="" src="' + esc(r.photo_url ? photoSrc(r.photo_url, 600) : '') + '"' + (r.photo_url ? '' : ' hidden') + '>' +
        '<div class="photo-btns">' +
          '<span class="btn filebtn">📷 Choisir / prendre une photo<input type="file" id="f_file" accept="image/*"></span>' +
          '<input type="url" id="f_url" placeholder="… ou coller un lien (Drive ou image web)" value="' + esc(r.photo_url) + '">' +
          '<small id="f_pinfo">' + (r.photo_url ? 'Photo actuelle conservée.' : 'La photo est réduite (~300 Ko) avant l\'envoi.') + '</small>' +
        '</div></div></div>' +
      '<div class="formbar"><button type="button" class="btn" data-act="cancel">Annuler</button>' +
        '<button type="submit" class="btn primary" id="f_save">Enregistrer</button></div>' +
      '</form>';
    window.scrollTo(0, 0);

    $('f_file').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        $('f_pinfo').textContent = 'Préparation de la photo…';
        pending = await reduirePhoto(f);
        $('f_prev').src = pending.dataUrl; $('f_prev').hidden = false;
        $('f_url').value = '';
        $('f_pinfo').textContent = 'Photo prête (' + Math.round(pending.taille / 1024) + ' Ko), envoyée à l\'enregistrement.';
      } catch (err) { pending = null; $('f_pinfo').textContent = 'Photo illisible : ' + err.message; }
    });
    $('f_url').addEventListener('input', e => {
      const u = e.target.value.trim();
      if (u) { pending = null; $('f_prev').src = photoSrc(u, 600); $('f_prev').hidden = false; }
    });
    $('form').addEventListener('submit', e => { e.preventDefault(); enregistrer(r); });
  }

  function reduirePhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL('image/jpeg', PHOTO_QUALITY);
        resolve({ dataUrl, taille: Math.round((dataUrl.length - 23) * 3 / 4) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('format non pris en charge')); };
      img.src = url;
    });
  }

  async function enregistrer(ancienne) {
    if (S.busy) return;
    const modes = Array.from(document.querySelectorAll('input[name=mode]:checked')).map(x => x.value);
    const rec = {
      id: ancienne.id || '',
      titre: $('f_titre').value.trim(),
      categorie: $('f_cat').value,
      modes_cuisson: modes.join(', '),
      personnes: $('f_pers').value,
      temps_min: $('f_temps').value,
      ingredients: $('f_ing').value.trim(),
      etapes: $('f_etp').value.trim(),
      reglages_appareil: $('f_reg').value.trim(),
      statut: $('f_st').value,
      sources: $('f_src').value.split(/\s*;\s*/).filter(Boolean).join('\n'),
      notes_marc: $('f_notes').value.trim(),
      photo_url: pending ? (ancienne.photo_url || '') : $('f_url').value.trim()
    };
    if (!rec.titre) { toast('Le titre est obligatoire.', true); return; }
    S.busy = true; $('f_save').disabled = true; $('f_save').textContent = 'Enregistrement…';
    try {
      let saved = (await apiPost({ action: 'save', recette: rec })).recette;
      if (pending) {
        $('f_save').textContent = 'Envoi de la photo…';
        const url = (await apiPost({ action: 'photo', id: saved.id, mime: 'image/jpeg', data: pending.dataUrl })).url;
        saved = (await apiPost({ action: 'save', recette: { id: saved.id, photo_url: url } })).recette;
      }
      const i = S.data.findIndex(x => String(x.id) === String(saved.id));
      if (i >= 0) S.data[i] = saved; else S.data.push(saved);
      store.set('lr_cache', { recettes: S.data, listes: S.listes, maj: S.maj });
      toast('Recette ' + saved.id + ' enregistrée.');
      S.id = saved.id; S.view = 'recipe'; render();
    } catch (err) {
      toast(err.message, true);
      $('f_save').disabled = false; $('f_save').textContent = 'Enregistrer';
    } finally { S.busy = false; }
  }

  // ---------- vue : réglages ----------
  function renderSettings(first) {
    $('filters').style.display = 'none';
    const c = cfg();
    app.innerHTML = '<form class="edit" id="sform">' +
      '<h2>Réglages</h2>' +
      (first ? '<p class="src">Première utilisation sur cet appareil : renseigne l\'adresse de l\'API et la clé (ou ouvre le lien d\'installation fourni par Claude).</p>' : '') +
      '<div class="field"><label for="s_url">Adresse de l\'API (Apps Script, finit par /exec)</label><input type="url" id="s_url" value="' + esc(c.url) + '"></div>' +
      '<div class="field"><label for="s_key">Clé secrète</label><input type="password" id="s_key" value="' + esc(c.key) + '"></div>' +
      '<div class="formbar">' + (first ? '' : '<button type="button" class="btn" data-act="cancel">Annuler</button>') +
      '<button type="submit" class="btn primary">Enregistrer et tester</button></div></form>';
    $('sform').addEventListener('submit', async e => {
      e.preventDefault();
      store.set('lr_cfg', { url: $('s_url').value.trim(), key: $('s_key').value.trim() });
      S.view = 'list';
      await load(true);
    });
  }

  // ---------- vue : livre ----------
  function renderBook() {
    $('filters').style.display = 'none';
    const list = filtered();
    const cats = catOrder().filter(c => list.some(r => r.categorie === c));
    const noCat = list.filter(r => !r.categorie);
    let h = '<div class="book-tools"><button class="btn" data-act="back">← Retour</button>' +
      '<button class="btn primary" data-act="print">Imprimer / PDF</button>' +
      '<span class="src" style="align-self:center">Le livre reprend les filtres actifs (' + list.length + ' recettes).</span></div>';
    h += '<div class="book"><section class="cover"><h1>Mon livre de recettes</h1><div class="src">' +
      list.length + ' recettes · édition du ' + new Date().toLocaleDateString('fr-BE') + '</div></section>';
    h += '<section class="toc"><h2>Sommaire</h2>' + cats.map(c =>
      '<h3>' + esc(c) + '</h3><ol>' + list.filter(r => r.categorie === c).map(r => '<li>' + esc(r.titre) + '</li>').join('') + '</ol>').join('') + '</section>';
    cats.forEach(c => {
      h += '<h2 class="chapter">' + esc(c) + '</h2>';
      list.filter(r => r.categorie === c).forEach(r => { h += recipeHtml(r, false); });
    });
    if (noCat.length) { h += '<h2 class="chapter">Divers</h2>'; noCat.forEach(r => { h += recipeHtml(r, false); }); }
    app.innerHTML = h + '</div>';
    window.scrollTo(0, 0);
  }

  function render() {
    if (S.view === 'recipe') return renderRecipe();
    if (S.view === 'book') return renderBook();
    if (S.view === 'form') return renderForm();
    if (S.view === 'settings') return renderSettings(false);
    buildFilters(); renderList();
  }

  // ---------- événements ----------
  document.addEventListener('click', e => {
    const t = e.target;
    const chip = t.closest('.chip');
    if (chip) { S.cat = chip.getAttribute('data-cat'); render(); return; }
    const card = t.closest('.card');
    if (card) { S.id = card.getAttribute('data-id'); S.view = 'recipe'; render(); return; }
    const act = t.closest('[data-act]') && t.closest('[data-act]').getAttribute('data-act');
    if (act === 'back') { S.view = 'list'; render(); return; }
    if (act === 'edit') { S.view = 'form'; render(); return; }
    if (act === 'cancel') { S.view = S.id && S.data.some(r => String(r.id) === String(S.id)) && S.view === 'form' ? 'recipe' : 'list'; render(); return; }
    if (act === 'print') { window.print(); return; }
    if (t.id === 'btnBook') { S.view = 'book'; render(); return; }
    if (t.id === 'btnNew') { S.id = null; S.view = 'form'; render(); return; }
    if (t.id === 'btnSettings') { S.view = 'settings'; render(); return; }
    if (t.id === 'btnReload') { load(true); return; }
    if (t.matches('ul.ing input')) t.parentNode.classList.toggle('done', t.checked);
  });
  $('q').addEventListener('input', e => { S.q = e.target.value; renderList(); });
  $('fMode').addEventListener('change', e => { S.mode = e.target.value; renderList(); });
  $('fStatut').addEventListener('change', e => { S.statut = e.target.value; renderList(); });
  function majReseau() { $('net').hidden = navigator.onLine; }
  window.addEventListener('online', majReseau); window.addEventListener('offline', majReseau);

  // ---------- chargement ----------
  async function load(force) {
    const c = cfg();
    if (!c.url || !c.key) { S.view = 'settings'; renderSettings(true); return; }
    if (force) toast('Mise à jour…');
    try {
      const d = await apiGet();
      S.data = d.recettes || []; S.listes = d.listes || {}; S.maj = d.maj || '';
      store.set('lr_cache', { recettes: S.data, listes: S.listes, maj: S.maj });
      if (S.view === 'settings') S.view = 'list';
      if (S.view !== 'form') render();
      if (force) toast(S.data.length + ' recettes chargées.');
    } catch (err) {
      if (!S.data.length) app.innerHTML = '<div class="msg err">Impossible de charger les recettes.<br><small>' + esc(err.message) + '</small></div>';
      toast((navigator.onLine ? 'Erreur : ' : 'Hors ligne : ') + err.message + ' — affichage de la dernière version.', true);
    }
  }

  // Démarrage : cache local immédiat, puis mise à jour réseau
  const cache = store.get('lr_cache', null);
  if (cache && cache.recettes) { S.data = cache.recettes; S.listes = cache.listes || {}; S.maj = cache.maj || ''; render(); }
  majReseau();
  load(false);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
