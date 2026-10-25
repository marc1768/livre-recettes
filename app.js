/* Livre de recettes — PWA v3 (multi-utilisateurs)
 * Données : API Apps Script (Google Sheet). Cache local pour le hors ligne.
 */
(function () {
  'use strict';

  const DEFAULT_API = 'https://script.google.com/macros/s/AKfycby4o7MSXGk4P5NFOqeu-wKmXrXi3AO_fDGANKazVIILqqDuxztUm_OGAcX0006YRi2Z/exec';
  // Anciennes API (compte Google précédent) : remplacées automatiquement sur les appareils déjà installés
  const OLD_APIS = ['https://script.google.com/macros/s/AKfycbygtRHPOZTNVlTeTfCF9lMbL4I9BOFc43uPRL_2H_-oRzHAZiuQCtm5ZLGsfgFyIM8/exec'];
  const APP_VERSION = 'v5.4';                   // affiché dans l'en-tête : à changer à chaque mise à jour (avec VERSION de sw.js)
  const DEFAULT_CATS = ['Entrée', 'Potage', 'Plat', 'Accompagnement', 'Sauce', 'Dessert', 'Apéro', 'Boisson'];
  const DEFAULT_MODES = ['Air fryer', 'Four', 'Poêle', 'Casserole', 'Vapeur', 'Barbecue', 'Grill', 'Gaufrier', 'Raclette', 'Micro-ondes', 'Blender', 'Robot', 'Sorbetière', 'Extracteur de jus', 'Mousseur à lait', 'Machine à café', 'Four à pizza', 'Sans cuisson'];
  const DEFAULT_STATUTS = ['À tester', 'Testé – OK', 'Testé – à ajuster', 'Abandonné'];
  const DEFAULT_DEVICES = ['Severin FR 2462', 'Four traditionnel'];
  const CAT_STYLE = {
    'entree': ['#3d8b5a', '🥗'], 'potage': ['#d08a1e', '🍲'], 'soupe': ['#d08a1e', '🍲'], 'plat': ['#b5522b', '🍽️'],
    'accompagnement': ['#7a8b2e', '🥔'], 'sauce': ['#8a4fa0', '🥣'], 'dessert': ['#d1477a', '🍰'], 'apero': ['#2f7ab5', '🥂'], 'boisson': ['#1d8f8f', '🍹']
  };
  const PHOTO_MAX = 1600, PHOTO_QUALITY = 0.8, TIMEOUT_MS = 60000;

  const S = { data: [], listes: {}, maj: '', user: null, cat: '', q: '', mode: '', statut: '', auteur: '', view: 'list', id: null, busy: false, nouv: false };
  let syncEnCours = false;                       // envoi de la file en cours
  const $ = id => document.getElementById(id);
  const app = $('app');

  // ---------- stockage local (protégé) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoré */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignoré */ } }
  };
  const cfg = () => Object.assign({ url: DEFAULT_API, key: '', token: '' }, store.get('lr_cfg', {}));
  const setCfg = o => store.set('lr_cfg', Object.assign(cfg(), o));
  (function migrerApi() {
    const c = store.get('lr_cfg', {});
    if (c.url && OLD_APIS.indexOf(c.url) >= 0) { c.url = DEFAULT_API; c.token = ''; store.set('lr_cfg', c); }
  })();
  // Jeton : session longue (« Rester connecté ») dans localStorage, sinon session du navigateur seulement
  const ss = { get(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }, set(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (e) { /* ignoré */ } } };
  const tok = () => ss.get('lr_tok') || cfg().token;

  // Lien d'invitation : #u=<Nom> (pré-remplit le nom sur l'écran de connexion)
  (function lienInvitation() {
    const m = location.hash.match(/^#u=(.+)$/);
    if (!m) return;
    try { store.set('lr_nom', decodeURIComponent(m[1])); } catch (e) { /* ignoré */ }
    history.replaceState(null, '', location.pathname + location.search);
  })();
  // Lien d'installation : #setup=<URL API>|<clé d'installation>
  (function setupFromHash() {
    const m = location.hash.match(/^#setup=([^|]+)\|(.+)$/);
    if (!m) return;
    setCfg({ url: decodeURIComponent(m[1]), key: decodeURIComponent(m[2]) });
    history.replaceState(null, '', location.pathname + location.search);
  })();

  // ---------- utilitaires ----------
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const split = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const catStyle = c => CAT_STYLE[norm(c)] || ['#7a746b', '🍴'];
  // Illustration quand la recette n'a pas de photo : casserole dessinée sur la couleur de la catégorie
  const phHtml = c => '<div class="ph" style="' + cvar(c) + '"><svg viewBox="0 0 160 90" aria-hidden="true">' +
    '<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".95">' +
    '<path d="M66 22c-4-5 4-8 0-13M80 22c-4-5 4-8 0-13M94 22c-4-5 4-8 0-13" opacity=".7"/>' +
    '<path d="M50 34h60"/><path d="M76 29h8"/><path d="M52 38h56l-4 30a6 6 0 0 1-6 5H62a6 6 0 0 1-6-5z"/>' +
    '<path d="M52 44H38M108 44h14"/></g><text x="80" y="86" text-anchor="middle" fill="#fff" font-size="9" opacity=".85">' + esc(c || '') + '</text></svg></div>';
  const cvar = c => '--c:' + catStyle(c)[0];
  function photoSrc(u, w) {
    u = String(u || '').trim();
    const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=|thumbnail\?id=)([\w-]{20,})/);
    return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w' + (w || 1000) : u;
  }
  function toast(msg, err) {
    const t = $('toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, err ? 7000 : 2500);
  }
  function busy(on, txt) { $('busy').hidden = !on; if (txt) $('busyTxt').textContent = txt; }
  const listes = () => ({
    categories: (S.listes.categories || []).length ? S.listes.categories : DEFAULT_CATS,
    modes: (S.listes.modes_cuisson || []).length ? S.listes.modes_cuisson : DEFAULT_MODES,
    statuts: (S.listes.statuts || []).length ? S.listes.statuts : DEFAULT_STATUTS,
    appareils: (S.listes.appareils || []).length ? S.listes.appareils : DEFAULT_DEVICES
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
  function starsHtml(moy, nb) {
    if (!nb) return '<span class="stars"><span class="e">★★★★★</span><small>pas encore notée</small></span>';
    const full = Math.round(moy);
    return '<span class="stars" title="' + moy + ' / 5">' + '★'.repeat(full) + '<span class="e">' + '★'.repeat(5 - full) + '</span><small>' + String(moy).replace('.', ',') + ' (' + nb + ')</small></span>';
  }

  // ---------- réglages de cuisson (texte <-> étapes) ----------
  // Format texte (colonne reglages_appareil) : "Appareil | Étape : 170 °C, 15 min (remarque)"
  function parseRegs(txt) {
    let device = '';
    const steps = lines(txt).map(l => {
      let rest = l; const p = l.indexOf('|');
      if (p >= 0) { device = device || l.slice(0, p).trim(); rest = l.slice(p + 1).trim(); }
      let label = rest, val = '';
      const c = rest.lastIndexOf(' : ');
      if (c >= 0) { label = rest.slice(0, c).trim(); val = rest.slice(c + 3).trim(); }
      const t = val.match(/(\d{2,3})\s*°\s*C/i);
      const d = val.match(/(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?\s*min/i);
      const rem = (val.match(/\(([^)]*)\)/) || [])[1] || '';
      return { label: label, temp: t ? +t[1] : 0, time: d ? +(d[2] || d[1]) : 0, time2: d && d[2] ? +d[1] : 0, rem: rem, raw: val };
    });
    return { device: device, steps: steps };
  }
  function stepValue(s) {
    const parts = [];
    if (s.temp) parts.push(s.temp + ' °C');
    if (s.time) parts.push((s.time2 ? s.time2 + '–' : '') + s.time + ' min');
    return parts.join(', ') + (s.rem ? ' (' + s.rem + ')' : '');
  }
  function serializeRegs(device, steps) {
    return steps.filter(s => s.label || s.temp || s.time)
      .map(s => (device ? device + ' | ' : '') + (s.label || 'Cuisson') + ' : ' + stepValue(s)).join('\n');
  }
  function mainStep(r) {
    const st = parseRegs(r.reglages_appareil).steps.filter(s => s.temp || s.time);
    return st.find(s => /cuisson/i.test(s.label) && s.temp) || st.find(s => s.temp) || st[0] || null;
  }

  // ---------- API (POST JSON, délai max, nouvelle tentative si réponse invalide) ----------
  async function api(action, body, opts) {
    opts = opts || {};
    const c = cfg();
    if (!navigator.onLine) throw new Error('Pas de connexion internet.');
    const payload = JSON.stringify(Object.assign({ action: action, token: tok() }, body || {}));
    let last;
    for (let essai = 1; essai <= (opts.essais || 2); essai++) {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const r = await fetch(c.url, { method: 'POST', body: payload, signal: ctl.signal, credentials: 'omit' });
        const txt = await r.text();
        let j;
        try { j = JSON.parse(txt); } catch (e) { throw new Error('REPONSE'); }
        if (!j.ok) {
          if (/^SESSION:/.test(j.error || '')) { deconnecter(true); throw new Error(j.error.replace(/^SESSION:\s*/, '')); }
          const err = new Error(j.error || 'Erreur API'); err.api = true; throw err;
        }
        return j;
      } catch (e) {
        last = e;
        if (e.api || (e.message && !/REPONSE|abort|Failed to fetch|NetworkError|Load failed/i.test(e.message + (e.name || '')))) throw e;
        if (essai < (opts.essais || 2)) await new Promise(res => setTimeout(res, 1500));
      } finally { clearTimeout(to); }
    }
    if (last && last.name === 'AbortError') throw new Error('Le serveur Google ne répond pas (délai dépassé). Réessaie dans un instant.');
    throw new Error('Réponse inattendue du serveur Google. Réessaie dans un instant.');
  }

  // ---------- nouvelles recettes (indication rouge) ----------
  // lr_connues (localStorage) : toutes les recettes déjà vues sur ce téléphone.
  // lr_base (sessionStorage) : ce qui était connu à l'ouverture de l'appli → sert de référence pendant toute l'ouverture.
  // Une recette ajoutée par quelqu'un d'autre depuis la dernière ouverture est « nouvelle » ; à l'ouverture suivante elle devient connue.
  const estAdmin = () => !!(S.user && S.user.role === 'admin');
  let BASE = null;
  (function initNouveautes() {
    const b = ss.get('lr_base');
    if (b) { try { BASE = new Set(JSON.parse(b)); } catch (e) { BASE = null; } return; }
    const k = store.get('lr_connues', null);
    if (k) { BASE = new Set(k); ss.set('lr_base', JSON.stringify(k)); }
  })();
  function marquerConnues() {
    const ids = S.data.map(r => String(r.id)).filter(i => i.indexOf('TMP') !== 0);
    if (!ids.length) return;
    if (!BASE) { BASE = new Set(ids); ss.set('lr_base', JSON.stringify(ids)); }   // toute première ouverture : rien n'est « nouveau »
    const k = new Set(store.get('lr_connues', [])); ids.forEach(i => k.add(i)); store.set('lr_connues', Array.from(k));
  }
  const estNouvelle = r => !!BASE && String(r.id).indexOf('TMP') !== 0 && !BASE.has(String(r.id)) &&
    !(S.user && norm(r.auteur) === norm(S.user.nom));
  const nbNouvelles = () => S.data.filter(estNouvelle).length;

  // ---------- filtres ----------
  function filtered() {
    const q = norm(S.q), o = catOrder();
    const me = S.user ? norm(S.user.nom) : '';
    return S.data.filter(r => {
      if (S.nouv && !estNouvelle(r)) return false;
      if (S.cat && r.categorie !== S.cat) return false;
      if (S.mode && split(r.modes_cuisson).indexOf(S.mode) < 0) return false;
      if (S.statut && r.statut !== S.statut) return false;
      if (S.auteur === '__moi' && norm(r.auteur) !== me) return false;
      if (S.auteur && S.auteur !== '__moi' && r.auteur !== S.auteur) return false;
      if (q) {
        const hay = norm([r.titre, r.categorie, r.modes_cuisson, r.ingredients, r.notes_marc, r.auteur].join(' '));
        if (q.split(/\s+/).some(w => hay.indexOf(w) < 0)) return false;
      }
      return true;
    }).sort((a, b) => (o.indexOf(a.categorie) - o.indexOf(b.categorie)) || String(a.titre).localeCompare(String(b.titre), 'fr'));
  }

  function buildFilters() {
    const cats = catOrder().filter(c => S.data.some(r => r.categorie === c));
    $('chips').innerHTML = ['<button class="chip' + (S.cat ? '' : ' on') + '" data-cat="">Toutes</button>']
      .concat(cats.map(c => '<button class="chip' + (S.cat === c ? ' on' : '') + '" data-cat="' + esc(c) + '" style="' + cvar(c) + '"><i></i>' + esc(c) + '</button>')).join('');
    const modes = []; S.data.forEach(r => split(r.modes_cuisson).forEach(m => { if (modes.indexOf(m) < 0) modes.push(m); }));
    $('fMode').innerHTML = '<option value="">Tous les modes de cuisson</option>' + modes.map(m => '<option' + (S.mode === m ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
    const sts = listes().statuts.slice(); S.data.forEach(r => { if (r.statut && sts.indexOf(r.statut) < 0) sts.push(r.statut); });
    $('fStatut').innerHTML = '<option value="">Tous les statuts</option>' + sts.map(s => '<option' + (S.statut === s ? ' selected' : '') + '>' + esc(s) + '</option>').join('');
    const auteurs = []; S.data.forEach(r => { if (r.auteur && auteurs.indexOf(r.auteur) < 0) auteurs.push(r.auteur); });
    auteurs.sort((a, b) => a.localeCompare(b, 'fr'));
    if (S.auteur && auteurs.indexOf(S.auteur) < 0) S.auteur = '';
    $('fAuteur').innerHTML = '<option value="">👤 Ajoutées par : tout le monde</option>' +
      auteurs.map(a => '<option value="' + esc(a) + '"' + (S.auteur === a ? ' selected' : '') + '>👤 ' + esc(a) + ' (' + S.data.filter(r => r.auteur === a).length + ')</option>').join('');
  }

  window.phHtmlGlobal = img => phHtml(img.closest('.card') ? img.closest('.card').querySelector('.cat').textContent : '');
  function chrome(loggedIn, withFilters) {
    ['btnReload', 'btnBook', 'btnNew', 'btnMe'].forEach(id => { $(id).hidden = !loggedIn; });
    majSync();
    if (loggedIn && S.user) $('btnMe').textContent = S.user.nom.charAt(0).toUpperCase();
    $('ver').textContent = APP_VERSION;
    $('filters').style.display = withFilters ? '' : 'none';
  }

  // ---------- vue : liste ----------
  function renderList() {
    chrome(true, true);
    const list = filtered();
    const prenom = S.user ? S.user.nom : '';
    let h = '<section class="hero"><h2>Bonjour ' + esc(prenom) + ' !</h2><p>' + S.data.length + ' recette' + (S.data.length > 1 ? 's' : '') +
      ' dans le livre' + (S.maj ? ' · mis à jour ' + esc(S.maj) : '') + ' · appli ' + APP_VERSION + ' · <a href="#" class="hhero" data-help="__top">❓ Aide</a></p></section>';
    const nn = nbNouvelles();
    if (nn) h += '<button class="newbar" data-act="nouv">🔴 ' + nn + (nn > 1 ? ' nouvelles recettes' : ' nouvelle recette') +
      (S.nouv ? ' — <u>tout afficher</u>' : ' — <u>voir</u>') + '</button>';
    else S.nouv = false;
    if (!S.data.length) { app.innerHTML = h + '<div class="empty">Aucune recette pour l\'instant. Ajoute la première avec « + Recette ».</div>'; return; }
    h += '<div class="count">' + list.length + ' résultat' + (list.length > 1 ? 's' : '') + '</div>';
    if (!list.length) h += '<div class="empty">Aucune recette ne correspond aux filtres.</div>';
    h += '<div class="grid">' + list.map(r => {
      const ms = mainStep(r);
      return '<div class="card' + (estNouvelle(r) ? ' new' : '') + '" data-id="' + esc(r.id) + '" style="' + cvar(r.categorie) + '">' +
        (estNouvelle(r) ? '<span class="newbadge">NOUVELLE</span>' : '') +
        (r.photo_url ? '<img class="thumb" loading="lazy" src="' + esc(photoSrc(r.photo_url, 600)) + '" alt="" onerror="this.outerHTML=phHtmlGlobal(this)">' : phHtml(r.categorie)) +
        '<div class="cbody">' +
          '<div class="cat">' + esc(r.categorie || 'Sans catégorie') + '</div>' +
          '<h3>' + esc(r.titre) + '</h3>' +
          '<div class="meta">' + (ms && (ms.temp || ms.time) ? '<span class="cook">' + (ms.temp ? '🌡 ' + ms.temp + ' °C' : '') + (ms.time ? ' ⏱ ' + ms.time + ' min' : '') + '</span>' : '') +
            (r.personnes ? '<span>👤 ' + esc(r.personnes) + '</span>' : '') + '</div>' +
          starsHtml(+r.note_moyenne || 0, +r.note_nb || 0) +
          '<div class="tags">' + split(r.modes_cuisson).map(m => '<span class="tag">' + esc(m) + '</span>').join('') + statusBadge(r.statut) +
            (r.ma_version ? '<span class="tag mine">ma version</span>' : '') +
            (r.auteur ? '<span class="by">par ' + esc(r.auteur) + '</span>' : '') + '</div>' +
        '</div></div>';
    }).join('') + '</div>';
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
    const p = parseRegs(r.reglages_appareil);
    if (!p.steps.length) return '';
    return (p.device ? '<div class="dev">' + esc(p.device) + '</div>' : '') + '<div class="regs">' + p.steps.map(s =>
      '<div class="reg"><b>' + esc(s.label) + '</b><span class="v">' +
        (s.temp || s.time ? (s.temp ? s.temp + ' °C' : '') + (s.temp && s.time ? ' · ' : '') + (s.time ? (s.time2 ? s.time2 + '–' : '') + s.time + ' min' : '') : esc(s.raw)) +
      '</span>' + (s.rem ? '<small>' + esc(s.rem) + '</small>' : '') + '</div>').join('') + '</div>';
  }
  function rateHtml(r) {
    const mine = +r.ma_note || 0;
    return '<div class="rate no-print"><span class="lbl">Ma note</span><span id="myStars">' +
      [1, 2, 3, 4, 5].map(i => '<button class="starbtn' + (i <= mine ? ' on' : '') + '" data-star="' + i + '" aria-label="' + i + ' étoile' + (i > 1 ? 's' : '') + '">★</button>').join('') +
      '</span><span class="lbl">Moyenne</span> ' + starsHtml(+r.note_moyenne || 0, +r.note_nb || 0) + '</div>';
  }
  function recipeHtml(r, interactive) {
    let h = '<article class="recipe" style="' + cvar(r.categorie) + '">' +
      '<div class="rcat">' + esc(r.categorie) + '</div>' +
      '<h2>' + esc(r.titre) + '</h2>' +
      '<div class="meta">' + (r.personnes ? '<span>👤 ' + esc(r.personnes) + ' pers.</span>' : '') + (r.temps_min ? '<span>⏱ ' + esc(r.temps_min) + ' min au total</span>' : '') +
        (r.auteur ? '<span>✍ ' + esc(r.auteur) + '</span>' : '') + '</div>' +
      '<div class="tags" style="margin-top:8px">' + split(r.modes_cuisson).map(m => '<span class="tag">' + esc(m) + '</span>').join('') + statusBadge(r.statut) + '</div>' +
      (interactive ? rateHtml(r) : (+r.note_nb ? '<div style="margin-top:6px">' + starsHtml(+r.note_moyenne, +r.note_nb) + '</div>' : '')) +
      (r.photo_url ? '<img class="hero-img" src="' + esc(photoSrc(r.photo_url, 1200)) + '" alt="">' : '');
    if (r.reglages_appareil) h += '<h4>Réglages</h4>' + reglagesHtml(r);
    if (r.ingredients || r.etapes) h += '<div class="cols"><div>' + (r.ingredients ? '<h4>Ingrédients</h4>' + ingredientsHtml(r, interactive) : '') + '</div>' +
      '<div>' + (r.etapes ? '<h4>Préparation</h4><ol class="steps">' + lines(r.etapes).map(s => '<li>' + esc(s.replace(/^\d+[.)]\s*/, '')) + '</li>').join('') + '</ol>' : '') + '</div></div>';
    if (r.notes_marc) h += '<h4>Notes</h4><div class="note">' + esc(r.notes_marc) + '</div>';
    if (r.sources) h += '<h4>Sources</h4><div class="src">' + lines(r.sources).map(linkify).join('<br>') + '</div>';
    return h + '</article>';
  }
  function renderRecipe() {
    chrome(true, false);
    const r = S.data.find(x => String(x.id) === String(S.id));
    if (!r) { S.view = 'list'; return render(); }
    app.innerHTML = '<div class="actions no-print"><button class="btn" data-act="back">← Retour</button>' +
      '<button class="btn" data-act="edit">✎ Modifier</button>' +
      '<button class="btn" data-act="print">🖨 Imprimer</button>' +
      '<button class="btn" data-help="fiche" aria-label="Aide">❓</button>' +
      (r.ma_version ? '<button class="btn" data-act="reset">↺ Revenir à l\'original</button>' : '') + '</div>' +
      (enAttente(r.id) ? '<div class="pend no-print">⏳ Enregistrée sur le téléphone — envoi au retour à la liste ou avec le bouton ⬆.</div>' : '') +
      (r.ma_version ? '<div class="myver no-print">✎ Ma version — modifiée' + (r.ma_version_date ? ' le ' + esc(r.ma_version_date) : '') + '. Les autres voient la recette d\'origine.</div>' : '') +
      recipeHtml(r, true);
    window.scrollTo(0, 0);
  }

  async function noter(n) {
    const r = S.data.find(x => String(x.id) === String(S.id));
    if (!r) return;
    const val = (+r.ma_note === n) ? 0 : n;                  // re-toucher la même étoile = retirer sa note
    if (String(r.id).indexOf('TMP') === 0) { toast('Note possible après l\'envoi de la recette.', true); return; }
    const avant = { ma_note: r.ma_note, note_moyenne: r.note_moyenne, note_nb: r.note_nb };
    r.ma_note = val; renderRecipe();                          // affichage immédiat
    toast(val ? 'Note : ' + val + '/5' : 'Note retirée');
    try {
      const j = await api('rate', { id: r.id, note: val });
      r.ma_note = j.ma_note; r.note_moyenne = j.moyenne; r.note_nb = j.nb;
      saveCache(); if (S.view === 'recipe' && String(S.id) === String(r.id)) renderRecipe();
    } catch (e) { Object.assign(r, avant); if (S.view === 'recipe') renderRecipe(); toast('Note non enregistrée : ' + e.message, true); }
  }

  // ---------- vue : formulaire recette ----------
  const H = id => ' <button type="button" class="hbtn" data-help="' + id + '" aria-label="Aide">?</button>';
  let pending = null, photoSuppr = false, editSteps = [], editDevice = '';
  function stepperHtml(kind, i, v) {
    const txt = kind === 'temp' ? (v ? v + ' °C' : '— °C') : (v ? v + ' min' : '— min');
    return '<div class="stepper"><button type="button" data-step="' + kind + '" data-i="' + i + '" data-d="-1" aria-label="moins">−</button><span>' + txt +
      '</span><button type="button" data-step="' + kind + '" data-i="' + i + '" data-d="1" aria-label="plus">+</button></div>';
  }
  function renderStepsEditor() {
    const box = $('stepsEd'); if (!box) return;
    box.innerHTML = editSteps.map((s, i) =>
      '<div class="srow"><input class="lab" data-lab="' + i + '" value="' + esc(s.label) + '" placeholder="Étape (ex. Cuisson 1)">' +
      stepperHtml('temp', i, s.temp) + stepperHtml('time', i, s.time) +
      '<button type="button" class="del" data-delstep="' + i + '" aria-label="Supprimer l\'étape">×</button>' +
      '<input class="rem" data-rem="' + i + '" value="' + esc(s.rem) + '" placeholder="Remarque (facultatif) : secouer à mi-cuisson…"></div>').join('');
  }
  function limitesTemp() { return /severin|air ?fryer/i.test(editDevice) ? [60, 200] : [30, 300]; }
  function changerStep(kind, i, d) {
    const s = editSteps[i]; if (!s) return;
    if (kind === 'temp') {
      const [mn, mx] = limitesTemp();
      s.temp = s.temp ? Math.min(mx, Math.max(mn, s.temp + d * 5)) : (d > 0 ? 180 : 0);
      if (s.temp && s.temp < mn) s.temp = mn;
    } else {
      s.time = Math.max(0, Math.min(600, (s.time || 0) + d)); s.time2 = 0;
    }
    renderStepsEditor();
  }

  function renderForm() {
    chrome(true, false);
    const r = S.id ? (S.data.find(x => String(x.id) === String(S.id)) || {}) : {};
    const L = listes();
    const modesSel = split(r.modes_cuisson);
    const mode = r.id ? modesSel : ['Air fryer'];
    const allModes = L.modes.slice(); modesSel.forEach(m => { if (allModes.indexOf(m) < 0) allModes.push(m); });
    const opt = (arr, v) => arr.map(x => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    const pr = parseRegs(r.reglages_appareil);
    editDevice = pr.device || L.appareils[0];
    editSteps = pr.steps.length ? pr.steps : [{ label: 'Cuisson', temp: 180, time: 12, time2: 0, rem: '' }];
    const devs = L.appareils.slice(); if (devs.indexOf(editDevice) < 0) devs.push(editDevice);
    pending = null; photoSuppr = false;
    app.innerHTML =
      '<form class="edit" id="form" autocomplete="off" style="' + cvar(r.categorie || 'Plat') + '">' +
      '<h2>' + (r.id ? 'Modifier ' + esc(r.id) : 'Nouvelle recette') + ' <button type="button" class="btn sm hlink" data-help="titre">❓ Aide</button></h2>' +
      '<div class="field"><label for="f_titre">Titre *' + H('titre') + '</label><input type="text" id="f_titre" required value="' + esc(r.titre) + '"></div>' +
      '<div class="row3">' +
        '<div class="field"><label for="f_cat">Catégorie</label><select id="f_cat">' + opt(L.categories, r.categorie || 'Plat') + '</select></div>' +
        '<div class="field"><label for="f_pers">Personnes</label><input type="number" min="1" id="f_pers" value="' + esc(r.personnes || 2) + '"></div>' +
        '<div class="field"><label for="f_temps">Temps total (min)</label><input type="number" min="0" id="f_temps" value="' + esc(r.temps_min) + '"></div>' +
      '</div>' +
      '<div class="field"><span class="lbl">Modes de cuisson' + H('modes') + '</span><div class="checks">' +
        allModes.map(m => '<label><input type="checkbox" name="mode" value="' + esc(m) + '"' + (mode.indexOf(m) >= 0 ? ' checked' : '') + '>' + esc(m) + '</label>').join('') + '</div></div>' +
      '<div class="field"><span class="lbl">Réglages de cuisson' + H('reglages') + '</span>' +
        '<div class="row2"><select id="f_dev">' + opt(devs, editDevice) + '</select><small>Température par pas de 5 °C, temps par pas de 1 min. Une ligne par étape.</small></div>' +
        '<div class="steps-ed" id="stepsEd"></div>' +
        '<button type="button" class="btn sm" data-act="addstep" style="justify-self:start">+ Ajouter une étape</button></div>' +
      '<div class="field"><label for="f_ing">Ingrédients' + H('ingredients') + '</label><small>Un ingrédient par ligne. Ligne commençant par « # » = sous-titre (ex. # Sauce).</small>' +
        '<textarea id="f_ing" rows="8">' + esc(r.ingredients) + '</textarea></div>' +
      '<div class="field"><label for="f_etp">Préparation' + H('preparation') + '</label><small>Une étape par ligne (numérotation automatique).</small>' +
        '<textarea id="f_etp" rows="8">' + esc(r.etapes) + '</textarea></div>' +
      '<div class="row2">' +
        '<div class="field"><label for="f_st">Statut' + H('statut') + '</label><select id="f_st">' + opt(L.statuts, r.statut || L.statuts[0]) + '</select></div>' +
        '<div class="field"><label for="f_src">Sources</label><input type="text" id="f_src" value="' + esc(lines(r.sources).join(' ; ')) + '" placeholder="Livre, site, Claude…"></div>' +
      '</div>' +
      '<div class="field"><label for="f_notes">Notes' + H('statut') + '</label><textarea id="f_notes" rows="3" placeholder="Réglages réels, ajustements…">' + esc(r.notes_marc) + '</textarea></div>' +
      '<div class="field"><span class="lbl">Photo' + H('photo') + '</span><div class="photo-box">' +
        '<img id="f_prev" alt="" src="' + esc(r.photo_url ? photoSrc(r.photo_url, 600) : '') + '"' + (r.photo_url ? '' : ' hidden') + '>' +
        '<div class="photo-btns">' +
          '<span class="btn filebtn">📷 Choisir / prendre une photo<input type="file" id="f_file" accept="image/*"></span>' +
          '<input type="url" id="f_url" placeholder="… ou coller un lien (Drive ou image web)" value="' + esc(/^data:/.test(r.photo_url || '') ? '' : r.photo_url) + '">' +
          '<button type="button" class="btn sm danger" id="f_delphoto"' + (r.photo_url ? '' : ' hidden') + '>🗑 Supprimer la photo</button>' +
          '<small id="f_pinfo">' + (r.photo_url ? 'Photo actuelle conservée.' : 'La photo est réduite (~300 Ko) avant l\'envoi.') + '</small>' +
        '</div></div></div>' +
      (r.id ? '<p class="src">Tes modifications ne seront visibles que par toi (« ma version »). Les autres continuent à voir la recette d\'origine.</p>' : '') +
      (r.id && estAdmin() ? '<div class="delzone"><button type="button" class="btn danger" data-act="delete">🗑 Supprimer cette recette</button><small>' + H('supprimer') + ' Visible seulement sur ton compte administrateur. Supprime la recette pour tout le monde (avec les versions personnelles).</small></div>' : '') +
      '<div class="formbar">' +
        '<button type="button" class="btn" data-act="cancel">Annuler</button>' +
        '<button type="submit" class="btn primary" id="f_save">Enregistrer</button>' + H('enregistrer') + '</div>' +
      '</form>';
    renderStepsEditor();
    window.scrollTo(0, 0);

    $('f_dev').addEventListener('change', e => { editDevice = e.target.value; });
    $('f_cat').addEventListener('change', e => { $('form').style.cssText = cvar(e.target.value); });
    $('stepsEd').addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.lab) editSteps[+t.dataset.lab].label = t.value;
      if (t.dataset.rem) editSteps[+t.dataset.rem].rem = t.value;
    });
    $('f_file').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        $('f_pinfo').textContent = 'Préparation de la photo…';
        pending = await reduirePhoto(f);
        $('f_prev').src = pending.dataUrl; $('f_prev').hidden = false; $('f_url').value = ''; $('f_delphoto').hidden = false;
        $('f_pinfo').textContent = 'Photo prête (' + Math.round(pending.taille / 1024) + ' Ko), envoyée à l\'enregistrement.';
      } catch (err) { pending = null; $('f_pinfo').textContent = 'Photo illisible : ' + err.message; }
    });
    $('f_url').addEventListener('input', e => {
      const u = e.target.value.trim();
      if (u) { pending = null; photoSuppr = false; $('f_prev').src = photoSrc(u, 600); $('f_prev').hidden = false; $('f_delphoto').hidden = false; }
    });
    $('f_delphoto').addEventListener('click', () => {
      pending = null; photoSuppr = true; $('f_url').value = ''; $('f_file').value = '';
      $('f_prev').hidden = true; $('f_prev').removeAttribute('src'); $('f_delphoto').hidden = true;
      $('f_pinfo').textContent = 'Photo retirée : elle disparaîtra à l\'enregistrement.';
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
        resolve({ dataUrl: dataUrl, taille: Math.round((dataUrl.length - 23) * 3 / 4) });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('format non pris en charge')); };
      img.src = url;
    });
  }

  // ---------- enregistrement local immédiat + file d'envoi (outbox) ----------
  // Chaque modification est appliquée tout de suite sur le téléphone (cache local),
  // puis envoyée au serveur Google au retour à la liste, avec le bouton ⬆, au retour du réseau
  // ou quand l'appli passe en arrière-plan.
  const outbox = () => store.get('lr_outbox', []);
  const setOutbox = q => { store.set('lr_outbox', q); majSync(); };
  const mesEnvois = () => outbox().filter(it => S.user && it.user === S.user.nom);
  const enAttente = id => mesEnvois().some(it => String(it.id) === String(id));
  function majSync() {
    const b = $('btnSync'); if (!b) return;
    const n = mesEnvois().length;
    b.hidden = !n || !S.user;
    b.classList.toggle('spin', syncEnCours);
    b.textContent = (syncEnCours ? '⟳ ' : '⬆ ') + n;
    b.title = n + ' modification(s) à envoyer — toucher pour envoyer maintenant';
  }

  function enregistrer(ancienne) {
    const modes = Array.from(document.querySelectorAll('input[name=mode]:checked')).map(x => x.value);
    const rec = {
      titre: $('f_titre').value.trim(),
      categorie: $('f_cat').value,
      modes_cuisson: modes.join(', '),
      personnes: $('f_pers').value,
      temps_min: $('f_temps').value,
      ingredients: $('f_ing').value.trim(),
      etapes: $('f_etp').value.trim(),
      reglages_appareil: serializeRegs(editDevice, editSteps),
      statut: $('f_st').value,
      sources: $('f_src').value.split(/\s*;\s*/).filter(Boolean).join('\n'),
      notes_marc: $('f_notes').value.trim()
    };
    if (!rec.titre) { toast('Le titre est obligatoire.', true); return; }
    // photo : nouvelle (à envoyer), supprimée, lien collé, ou inchangée
    let photo = null, local = '';
    const lien = $('f_url').value.trim();
    if (pending) { photo = pending.dataUrl; local = photo; }
    else if (photoSuppr) rec.photo_url = '';
    else if (lien) rec.photo_url = lien;
    else if (/^data:/.test(ancienne.photo_url || '')) photo = 'garder';
    else rec.photo_url = '';

    const creation = !ancienne.id;
    const id = creation ? 'TMP' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : ancienne.id;
    const q = outbox();
    let it = q.find(x => String(x.id) === String(id) && !x.enCours && x.user === S.user.nom);
    if (it) Object.assign(it.rec, rec);
    else {
      it = { qid: Date.now().toString(36) + Math.random().toString(36).slice(2), user: S.user.nom, id: id, rec: rec, photo: null,
        creation: creation || String(id).indexOf('TMP') === 0 && !q.some(x => String(x.id) === String(id)),
        nonce: Date.now().toString(36) + Math.random().toString(36).slice(2) };
      q.push(it);
    }
    if (photo && photo !== 'garder') it.photo = photo;
    else if (!photo && 'photo_url' in rec) it.photo = null;
    setOutbox(q);

    // copie locale affichée tout de suite
    const today = new Date().toLocaleDateString('fr-BE');
    const loc = Object.assign({}, ancienne, rec, { id: id });
    if (local) loc.photo_url = local;
    if (creation) Object.assign(loc, { auteur: S.user.nom, peut_modifier: true, peut_supprimer: true, note_moyenne: 0, note_nb: 0, ma_note: 0, date_ajout: today });
    else if (String(id).indexOf('TMP') !== 0) Object.assign(loc, { ma_version: true, ma_version_date: today });
    const i = S.data.findIndex(x => String(x.id) === String(id));
    if (i >= 0) S.data[i] = loc; else S.data.push(loc);
    saveCache();
    toast('✓ Enregistré — envoi au retour à la liste');
    S.id = id; S.view = 'recipe'; render();
  }

  // Remplace un identifiant provisoire (TMP…) par le vrai après création sur le serveur
  function remplacerId(ancien, nouveau) {
    if (String(ancien) === String(nouveau)) return;
    const q = outbox(); q.forEach(x => { if (String(x.id) === String(ancien)) { x.id = nouveau; x.creation = false; } }); setOutbox(q);
    S.data.forEach(r => { if (String(r.id) === String(ancien)) r.id = nouveau; });
    if (String(S.id) === String(ancien)) S.id = nouveau;
  }

  async function synchroniser(silencieux) {
    if (syncEnCours || !S.user || !tok()) return;
    if (!mesEnvois().length) return;
    if (!navigator.onLine) { if (!silencieux) toast('Hors ligne : les modifications restent sur le téléphone.', true); return; }
    syncEnCours = true; majSync();
    let ok = 0, err = null;
    try {
      for (;;) {
        const q = outbox();
        const it = q.find(x => x.user === S.user.nom);
        if (!it) break;
        it.enCours = true; setOutbox(q);
        try {
          if (it.creation) {
            const rec = Object.assign({}, it.rec); delete rec.id;
            const saved = (await api('save', { recette: rec, nonce: it.nonce })).recette;
            const ancien = it.id;
            const q2 = outbox(); const k = q2.find(x => x.qid === it.qid);
            if (k) { k.id = saved.id; k.creation = false; k.photoInitiale = true; k.rec = {}; k.base = saved; }
            setOutbox(q2);
            remplacerId(ancien, saved.id);
            Object.assign(it, k || {});
          } else if (Object.keys(it.rec).length) {
            const saved = (await api('save', { recette: Object.assign({}, it.rec, { id: it.id }) })).recette;
            const q2 = outbox(); const k = q2.find(x => x.qid === it.qid);
            if (k) { k.rec = {}; k.base = saved; } setOutbox(q2);
            it.rec = {}; it.base = saved;
          }
          let saved = it.base;
          if (it.photo) {
            const url = (await api('photo', { id: it.id, mime: 'image/jpeg', data: it.photo }, { essais: 2 })).url;
            saved = (await api('save', { recette: { id: it.id, photo_url: url, photo_initiale: !!it.photoInitiale } })).recette;
          }
          setOutbox(outbox().filter(x => x.qid !== it.qid));
          // mise à jour de la copie locale avec la réponse du serveur (sauf si une autre modif attend encore)
          if (saved && !enAttente(saved.id)) {
            const i = S.data.findIndex(x => String(x.id) === String(saved.id));
            const notes = i >= 0 ? { note_moyenne: S.data[i].note_moyenne, note_nb: S.data[i].note_nb, ma_note: S.data[i].ma_note } : { note_moyenne: 0, note_nb: 0, ma_note: 0 };
            saved = Object.assign({}, saved, notes);
            if (i >= 0) S.data[i] = saved; else S.data.push(saved);
          }
          saveCache(); ok++;
        } catch (e) {
          if (e.api) {                                   // refus définitif du serveur : on abandonne cette modification
            setOutbox(outbox().filter(x => x.qid !== it.qid));
            toast('Modification refusée par le serveur : ' + e.message, true);
            continue;
          }
          const q3 = outbox(); const k = q3.find(x => x.qid === it.qid); if (k) delete k.enCours; setOutbox(q3);
          err = e; break;
        }
      }
    } finally { syncEnCours = false; majSync(); }
    if (S.view === 'list' || S.view === 'recipe') render();
    if (err) { if (!silencieux) toast('Envoi impossible pour l\'instant (' + err.message + '). Les modifications restent sur le téléphone.', true); }
    else if (ok && !silencieux) toast('✓ ' + ok + (ok > 1 ? ' modifications envoyées' : ' modification envoyée'));
  }

  async function revenirOriginal(btn) {
    if (!btn.dataset.confirm) { btn.dataset.confirm = '1'; btn.textContent = 'Confirmer : effacer ma version'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.confirm; btn.textContent = '↺ Revenir à l\'original'; } }, 5000); return; }
    S.busy = true; busy(true, 'Retour à l\'original…');
    setOutbox(outbox().filter(x => !(String(x.id) === String(S.id) && !x.enCours)));
    try {
      const r0 = (await api('reset', { id: S.id }, { essais: 1 })).recette;
      const i = S.data.findIndex(x => String(x.id) === String(S.id));
      if (i >= 0) S.data[i] = Object.assign(r0, { note_moyenne: S.data[i].note_moyenne, note_nb: S.data[i].note_nb, ma_note: S.data[i].ma_note });
      saveCache(); toast('Recette d\'origine rétablie.'); render();
    } catch (e) { toast(e.message, true); } finally { S.busy = false; busy(false); }
  }

  async function supprimer(btn) {
    if (!btn.dataset.confirm) { btn.dataset.confirm = '1'; btn.textContent = 'Confirmer la suppression'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.confirm; btn.textContent = '🗑 Supprimer cette recette'; } }, 5000); return; }
    if (String(S.id).indexOf('TMP') === 0) {              // pas encore envoyée : suppression locale seulement
      setOutbox(outbox().filter(x => String(x.id) !== String(S.id)));
      S.data = S.data.filter(x => String(x.id) !== String(S.id)); saveCache();
      toast('Recette supprimée.'); S.id = null; S.view = 'list'; render(); return;
    }
    S.busy = true; busy(true, 'Suppression…');
    setOutbox(outbox().filter(x => !(String(x.id) === String(S.id) && !x.enCours)));
    try {
      await api('delete', { id: S.id }, { essais: 1 });
      S.data = S.data.filter(x => String(x.id) !== String(S.id)); saveCache();
      toast('Recette supprimée.'); S.id = null; S.view = 'list'; render();
    } catch (e) { toast(e.message, true); } finally { S.busy = false; busy(false); }
  }

  // ---------- vues : connexion / installation / compte ----------
  function renderLogin(msg) {
    chrome(false, false);
    app.innerHTML = '<form class="panel narrow" id="lform"><h2>Connexion <button type="button" class="hbtn" data-help="installer" aria-label="Aide">?</button></h2>' + (msg ? '<p class="src">' + esc(msg) + '</p>' : '') +
      '<div class="field"><label for="l_nom">Nom</label><input type="text" id="l_nom" autocomplete="username" required value="' + esc(store.get('lr_nom', '')) + '"></div>' +
      '<div class="field"><label for="l_mdp">Mot de passe</label><input type="password" id="l_mdp" autocomplete="current-password" required></div>' +
      '<label class="keep"><input type="checkbox" id="l_keep" checked> Rester connecté sur cet appareil</label>' +
      '<div class="formbar"><button type="submit" class="btn primary">Se connecter</button></div></form>';
    $('lform').addEventListener('submit', async e => {
      e.preventDefault(); busy(true, 'Connexion…');
      try {
        const rester = $('l_keep').checked;
        const j = await api('login', { nom: $('l_nom').value.trim(), mdp: $('l_mdp').value, rester: rester }, { essais: 1 });
        store.set('lr_nom', $('l_nom').value.trim());
        connecte(j, rester);
      } catch (err) { toast(err.message, true); } finally { busy(false); }
    });
  }
  function renderSetup() {
    chrome(false, false);
    const c = cfg();
    app.innerHTML = '<form class="panel narrow" id="suform"><h2>Première installation</h2>' +
      '<p class="src">Crée le compte administrateur. La clé d\'installation se trouve dans le lien fourni par Claude.</p>' +
      '<div class="field"><label for="su_key">Clé d\'installation</label><input type="password" id="su_key" value="' + esc(c.key) + '" required></div>' +
      '<div class="field"><label for="su_nom">Ton nom (identifiant)</label><input type="text" id="su_nom" value="Marc" required></div>' +
      '<div class="field"><label for="su_mdp">Mot de passe (6 caractères min.)</label><input type="password" id="su_mdp" autocomplete="new-password" required></div>' +
      '<div class="formbar"><button type="submit" class="btn primary">Créer le compte</button></div></form>';
    $('suform').addEventListener('submit', async e => {
      e.preventDefault(); busy(true, 'Création du compte…');
      try {
        const j = await api('setup', { key: $('su_key').value.trim(), nom: $('su_nom').value.trim(), mdp: $('su_mdp').value }, { essais: 1 });
        setCfg({ key: '' }); connecte(j);
      } catch (err) { toast(err.message, true); } finally { busy(false); }
    });
  }
  function renderPassword(force) {
    chrome(!force, false);
    app.innerHTML = '<form class="panel narrow" id="pform"><h2>' + (force ? 'Choisis ton mot de passe' : 'Changer mon mot de passe') + '</h2>' +
      (force ? '<p class="src">Tu utilises un mot de passe provisoire : remplace-le par le tien.</p>' : '') +
      '<div class="field"><label for="p_old">Mot de passe actuel</label><input type="password" id="p_old" autocomplete="current-password" required></div>' +
      '<div class="field"><label for="p_new">Nouveau mot de passe (6 caractères min.)</label><input type="password" id="p_new" autocomplete="new-password" required></div>' +
      '<div class="formbar">' + (force ? '' : '<button type="button" class="btn" data-act="back">Annuler</button>') + '<button type="submit" class="btn primary">Enregistrer</button></div></form>';
    $('pform').addEventListener('submit', async e => {
      e.preventDefault(); busy(true, 'Enregistrement…');
      try {
        await api('password', { ancien: $('p_old').value, nouveau: $('p_new').value }, { essais: 1 });
        S.user.doit_changer = false; store.set('lr_user', S.user);
        toast('Mot de passe changé.'); S.view = 'list'; load(false);
      } catch (err) { toast(err.message, true); } finally { busy(false); }
    });
  }
  function renderMe() {
    chrome(true, false);
    const admin = S.user && S.user.role === 'admin';
    app.innerHTML = '<div class="panel narrow"><h2>' + esc(S.user.nom) + '</h2><p class="src">' + (admin ? 'Administrateur : tu peux modifier toutes les fiches.' : 'Tu peux modifier tes fiches et lire celles des autres.') + '</p>' +
      '<div class="menu">' +
        (admin ? '<button class="btn" data-act="users">👥 Gérer les utilisateurs</button>' : '') +
        '<button class="btn" data-help="__top">❓ Aide — mode d\'emploi complet</button>' +
        '<button class="btn" data-act="pwd">🔑 Changer mon mot de passe</button>' +
        '<button class="btn" data-act="book">📖 Livre / impression PDF</button>' +
        '<button class="btn danger" data-act="logout">Se déconnecter</button>' +
        '<button class="btn" data-act="back">← Retour</button>' +
      '</div><p class="src" style="margin-top:14px">Version de l\'appli : <b>' + APP_VERSION + '</b></p></div>';
  }
  async function renderUsers() {
    chrome(true, false);
    app.innerHTML = '<div class="panel"><h2>Utilisateurs' + H('utilisateurs') + '</h2><div id="ulist" class="ulist"><div class="msg">Chargement…</div></div>' +
      '<form id="uform" style="display:grid;gap:10px;border-top:1px solid var(--line);padding-top:14px">' +
        '<b>Ajouter un utilisateur</b>' +
        '<div class="row3"><div class="field"><label for="u_nom">Nom</label><input type="text" id="u_nom" required></div>' +
        '<div class="field"><label for="u_mail">E-mail (invitation)</label><input type="email" id="u_mail" placeholder="facultatif" autocomplete="off"></div></div><div class="row3">' +
        '<div class="field"><label for="u_mdp">Mot de passe provisoire</label><input type="text" id="u_mdp" required minlength="6"></div>' +
        '<div class="field"><label for="u_role">Rôle</label><select id="u_role"><option value="utilisateur">Utilisateur</option><option value="admin">Admin</option></select></div></div>' +
        '<small class="src">Avec une adresse e-mail, la personne reçoit directement un mail avec le lien de l\'appli, son nom et son mot de passe provisoire. Elle choisira son propre mot de passe à la première connexion.</small>' +
        '<div class="formbar"><button type="button" class="btn" data-act="me">← Retour</button><button type="submit" class="btn primary">Ajouter</button></div>' +
      '</form></div>';
    $('uform').addEventListener('submit', async e => {
      e.preventDefault(); busy(true, 'Ajout…');
      try {
        const j = await api('user_add', { nom: $('u_nom').value.trim(), mdp: $('u_mdp').value, role: $('u_role').value, email: $('u_mail').value.trim() }, { essais: 1 });
        toast(j.mail ? 'Utilisateur ajouté, invitation envoyée à ' + j.mail + '.' : 'Utilisateur ajouté (pas d\'e-mail : communique-lui le lien, son nom et son mot de passe).'); renderUsers();
      }
      catch (err) { toast(err.message, true); } finally { busy(false); }
    });
    try {
      const j = await api('users');
      $('ulist').innerHTML = j.users.map(u =>
        '<div class="urow"><b class="' + (u.actif ? '' : 'off') + '">' + esc(u.nom) + '</b><span class="st">' + esc(u.role) + '</span>' +
        (u.email ? '<span class="st">✉ ' + esc(u.email) + '</span>' : '') +
        (u.doit_changer ? '<span class="st warn">mdp provisoire</span>' : '') +
        (u.nom === S.user.nom ? '' :
          '<input type="text" placeholder="nouveau mdp" data-resetval="' + esc(u.nom) + '" style="width:130px;padding:4px 8px;border:1px solid var(--line);border-radius:8px">' +
          (u.email ? '' : '<input type="email" placeholder="e-mail (facultatif)" data-resetmail="' + esc(u.nom) + '" style="width:170px;padding:4px 8px;border:1px solid var(--line);border-radius:8px">') +
          '<button class="btn sm" data-reset="' + esc(u.nom) + '">' + (u.email ? 'Réinitialiser + mail' : 'Réinitialiser') + '</button>' +
          '<button class="btn sm" data-toggle="' + esc(u.nom) + '" data-actif="' + (u.actif ? '0' : '1') + '">' + (u.actif ? 'Désactiver' : 'Réactiver') + '</button>') +
        '</div>').join('');
    } catch (err) { $('ulist').innerHTML = '<div class="msg err">' + esc(err.message) + '</div>'; }
  }

  function connecte(j, rester) {
    if (rester === false) { ss.set('lr_tok', j.token); setCfg({ token: '' }); }
    else { ss.set('lr_tok', ''); setCfg({ token: j.token }); }
    S.user = j.user; store.set('lr_user', S.user);
    if (S.user.doit_changer) { S.view = 'password'; renderPassword(true); return; }
    S.view = 'list'; load(true);
  }
  function deconnecter(silencieux) {
    setCfg({ token: '' }); ss.set('lr_tok', ''); store.del('lr_user'); store.del('lr_cache');
    S.user = null; S.data = [];
    if (!silencieux) renderLogin('Déconnecté.');
    else setTimeout(() => renderLogin('Session terminée : reconnecte-toi.'), 0);
  }

  // ---------- vue : livre ----------
  function renderBook() {
    chrome(true, false);
    const list = filtered();
    const cats = catOrder().filter(c => list.some(r => r.categorie === c));
    const noCat = list.filter(r => !r.categorie);
    let h = '<div class="book-tools"><button class="btn" data-act="back">← Retour</button>' +
      '<button class="btn primary" data-act="print">Imprimer / PDF</button>' +
      '<span class="src" style="align-self:center">Le livre reprend les filtres actifs (' + list.length + ' recettes).</span></div>';
    h += '<div class="book"><section class="cover"><h1>Mon livre de recettes</h1><div class="src">' + list.length + ' recettes · édition du ' + new Date().toLocaleDateString('fr-BE') + '</div></section>';
    h += '<section class="toc"><h2>Sommaire</h2>' + cats.map(c => '<h3 style="' + cvar(c) + '">' + esc(c) + '</h3><ol>' +
      list.filter(r => r.categorie === c).map(r => '<li>' + esc(r.titre) + '</li>').join('') + '</ol>').join('') + '</section>';
    cats.forEach(c => {
      h += '<h2 class="chapter" style="' + cvar(c) + '">' + esc(c) + '</h2>';
      list.filter(r => r.categorie === c).forEach(r => { h += recipeHtml(r, false); });
    });
    if (noCat.length) { h += '<h2 class="chapter">Divers</h2>'; noCat.forEach(r => { h += recipeHtml(r, false); }); }
    app.innerHTML = h + '</div>';
    window.scrollTo(0, 0);
  }

  function render() {
    if (!S.user) return renderLogin();
    if (S.user.doit_changer) return renderPassword(true);
    switch (S.view) {
      case 'recipe': return renderRecipe();
      case 'book': return renderBook();
      case 'form': return renderForm();
      case 'me': return renderMe();
      case 'users': return renderUsers();
      case 'password': return renderPassword(false);
    }
    buildFilters(); renderList();
  }

  // ---------- événements ----------
  document.addEventListener('click', e => {
    const t = e.target;
    const chip = t.closest('.chip');
    if (chip) {
      if (chip.hasAttribute('data-auteur')) S.auteur = chip.getAttribute('data-auteur');
      else S.cat = chip.getAttribute('data-cat');
      render(); return;
    }
    const card = t.closest('.card');
    if (card) { S.id = card.getAttribute('data-id'); S.view = 'recipe'; render(); return; }
    const star = t.closest('[data-star]');
    if (star) { noter(+star.dataset.star); return; }
    const stp = t.closest('[data-step]');
    if (stp) { changerStep(stp.dataset.step, +stp.dataset.i, +stp.dataset.d); return; }
    if (t.dataset.delstep !== undefined) { editSteps.splice(+t.dataset.delstep, 1); renderStepsEditor(); return; }
    if (t.dataset.reset) {
      const inp = document.querySelector('[data-resetval="' + CSS.escape(t.dataset.reset) + '"]');
      busy(true, 'Réinitialisation…');
      const im = document.querySelector('[data-resetmail="' + CSS.escape(t.dataset.reset) + '"]');
      api('user_reset', { nom: t.dataset.reset, mdp: inp ? inp.value : '', email: im ? im.value.trim() : '' }, { essais: 1 })
        .then(j => { toast(j.mail ? 'Mot de passe provisoire envoyé à ' + j.mail + '.' : 'Mot de passe provisoire enregistré.'); renderUsers(); }).catch(err => toast(err.message, true)).finally(() => busy(false));
      return;
    }
    if (t.dataset.toggle) {
      busy(true, 'Mise à jour…');
      api('user_toggle', { nom: t.dataset.toggle, actif: t.dataset.actif === '1' }, { essais: 1 })
        .then(() => renderUsers()).catch(err => toast(err.message, true)).finally(() => busy(false));
      return;
    }
    const actEl = t.closest('[data-act]');
    const act = actEl && actEl.getAttribute('data-act');
    if (act === 'back') { S.view = 'list'; render(); synchroniser(false); return; }
    if (act === 'nouv') { S.nouv = !S.nouv; render(); return; }
    if (act === 'edit') { S.view = 'form'; render(); return; }
    if (act === 'cancel') { S.view = S.id && S.data.some(r => String(r.id) === String(S.id)) ? 'recipe' : 'list'; render(); return; }
    if (act === 'delete') { supprimer(actEl); return; }
    if (act === 'reset') { revenirOriginal(actEl); return; }
    if (act === 'addstep') { editSteps.push({ label: 'Cuisson ' + (editSteps.length + 1), temp: 180, time: 10, time2: 0, rem: '' }); renderStepsEditor(); return; }
    if (act === 'print') { window.print(); return; }
    if (act === 'users') { S.view = 'users'; render(); return; }
    if (act === 'me') { S.view = 'me'; render(); return; }
    if (act === 'pwd') { S.view = 'password'; render(); return; }
    if (act === 'book') { S.view = 'book'; render(); return; }
    if (act === 'logout') { deconnecter(false); return; }
    if (t.id === 'btnBook') { S.view = 'book'; render(); return; }
    if (t.id === 'btnNew') { S.id = null; S.view = 'form'; render(); return; }
    if (t.id === 'btnMe') { S.view = 'me'; render(); return; }
    if (t.id === 'btnReload') { load(true); return; }
    if (t.id === 'btnSync') { synchroniser(false); return; }
    if (t.matches('ul.ing input')) t.parentNode.classList.toggle('done', t.checked);
  });
  $('q').addEventListener('input', e => { S.q = e.target.value; renderList(); });
  $('fMode').addEventListener('change', e => { S.mode = e.target.value; renderList(); });
  $('fStatut').addEventListener('change', e => { S.statut = e.target.value; renderList(); });
  $('fAuteur').addEventListener('change', e => { S.auteur = e.target.value; renderList(); });
  function majReseau() { $('net').hidden = navigator.onLine; }
  window.addEventListener('online', () => synchroniser(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') synchroniser(true); });
  window.addEventListener('online', majReseau); window.addEventListener('offline', majReseau);

  // ---------- chargement ----------
  function saveCache() { store.set('lr_cache', { recettes: S.data, listes: S.listes, maj: S.maj }); }
  async function load(force) {
    if (!tok()) return demarrerSansSession();
    if (force) toast('Mise à jour…');
    try {
      const d = await api('list', force ? { frais: true } : {});
      const locales = S.data.filter(r => enAttente(r.id));
      S.data = d.recettes || [];
      locales.forEach(l => { const i = S.data.findIndex(x => String(x.id) === String(l.id)); if (i >= 0) S.data[i] = l; else S.data.push(l); }); S.listes = d.listes || {}; S.maj = d.maj || '';
      S.user = d.user; store.set('lr_user', S.user);
      if (d.token && cfg().token) setCfg({ token: d.token });     // session prolongée par le serveur
      saveCache(); marquerConnues();
      if (S.view !== 'form') render();
      if (force) toast(S.data.length + (S.data.length > 1 ? ' recettes chargées.' : ' recette chargée.'));
    } catch (err) {
      if (!tok()) return;                           // session terminée : écran de connexion déjà affiché
      if (!S.data.length) app.innerHTML = '<div class="msg err">Impossible de charger les recettes.<br><small>' + esc(err.message) + '</small></div>';
      toast((navigator.onLine ? '' : 'Hors ligne : ') + err.message + (S.data.length ? ' — affichage de la dernière version.' : ''), true);
    }
  }
  async function demarrerSansSession() {
    chrome(false, false);
    try {
      const e = await api('etat', {}, { essais: 2 });
      if (!e.initialise) renderSetup(); else renderLogin();
    } catch (err) {
      app.innerHTML = '<div class="msg err">Impossible de joindre le serveur.<br><small>' + esc(err.message) + '</small></div>';
    }
  }

  // ---------- écran d'accueil animé (une fois par ouverture de l'appli) ----------
  (function accueil() {
    const sp = $('splash'), v = $('splashVid');
    let vu = false; try { vu = sessionStorage.getItem('lr_splash') === '1'; } catch (e) { /* ignoré */ }
    if (vu || !sp) return;
    try { sessionStorage.setItem('lr_splash', '1'); } catch (e) { /* ignoré */ }
    sp.hidden = false;
    let fini = false;
    const fermer = () => { if (fini) return; fini = true; sp.classList.add('out'); setTimeout(() => { sp.hidden = true; try { v.pause(); } catch (e) { /* ignoré */ } }, 700); };
    sp.addEventListener('click', fermer);
    v.addEventListener('ended', () => setTimeout(fermer, 600));
    const p = v.play && v.play();
    if (p && p.catch) p.catch(() => setTimeout(fermer, 3500));      // lecture automatique refusée : image fixe puis entrée
    setTimeout(fermer, 9000);                                         // sécurité
  })();

  // ---------- aide à l'installation sur l'écran d'accueil ----------
  (function aideInstallation() {
    const box = $('install');
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    let off = false; try { off = localStorage.getItem('lr_install_off') === '1'; } catch (e) { /* ignoré */ }
    if (standalone || off || !box) return;
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const inApp = /FBAN|FBAV|Instagram|GSA\/|Line\/|Outlook|; wv\)/.test(ua);
    const close = '<button class="x" data-inst="off" aria-label="Fermer">×</button>';
    let deferred = null;
    const montrer = html => { box.innerHTML = '<div>' + html + '</div>' + close; box.hidden = false; };
    if (ios) {
      montrer(inApp
        ? '📲 <b>Pour installer l\'appli</b>, ouvre d\'abord ce lien dans <b>Safari</b> (menu ⋯ ou ↗ « Ouvrir dans Safari »).'
        : '📲 <b>Installer l\'appli sur l\'iPhone</b> : touche <b>Partager</b> <span class="ico">⬆︎</span> puis <b>« Sur l\'écran d\'accueil »</b>, puis ouvre l\'icône « Recettes » et connecte-toi dedans.' +
          (/CriOS|FxiOS|EdgiOS/.test(ua) ? '<br><small>Pas de bouton Partager ? Ouvre la page dans Safari.</small>' : ''));
    } else if (android) {
      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault(); deferred = e;
        montrer('📲 <b>Installe l\'appli</b> sur ton téléphone pour l\'ouvrir comme une vraie application. <button class="btn sm primary" data-inst="go">Installer</button>');
      });
      setTimeout(() => { if (!deferred && box.hidden) montrer('📲 <b>Installer l\'appli</b> : menu <b>⋮</b> de Chrome puis <b>« Installer l\'application »</b> ou « Ajouter à l\'écran d\'accueil ».'); }, 4000);
    }
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-inst]'); if (!b) return;
      if (b.dataset.inst === 'go' && deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (err) { /* ignoré */ } deferred = null; }
      box.hidden = true;
      if (b.dataset.inst === 'off') { try { localStorage.setItem('lr_install_off', '1'); } catch (err) { /* ignoré */ } }
    });
    window.addEventListener('appinstalled', () => { box.hidden = true; });
  })();

  // Démarrage : affichage immédiat depuis le cache, puis mise à jour
  S.user = store.get('lr_user', null);
  const cache = store.get('lr_cache', null);
  if (S.user && tok() && cache && cache.recettes) { S.data = cache.recettes; S.listes = cache.listes || {}; S.maj = cache.maj || ''; marquerConnues(); render(); }
  majReseau(); majSync();
  load(false).then(() => synchroniser(true));

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
