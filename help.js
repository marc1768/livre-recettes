/* Aide du livre de recettes : écran complet avec sommaire, ouvert directement sur la rubrique demandée.
 * Utilisation : window.ouvrirAide('ingredients')  — ou un bouton <button data-help="ingredients">?</button> */
(function () {
  'use strict';
  const AIDE = [
    { groupe: 'Démarrer' },
    { id: 'installer', titre: 'Installer l\'appli sur le téléphone', html:
      '<p><b>iPhone</b> : ouvre le lien dans <b>Safari</b>, touche <b>Partager</b> ⬆︎ puis <b>« Sur l\'écran d\'accueil »</b>. Ouvre ensuite l\'icône « Recettes » et connecte-toi <u>dans l\'appli</u> (elle ne partage pas la connexion de Safari).</p>' +
      '<p>Si le lien s\'ouvre dans l\'appli Mail ou Gmail, choisis d\'abord « Ouvrir dans Safari ».</p>' +
      '<p><b>Android</b> : dans Chrome, bouton <b>Installer</b> du bandeau, ou menu <b>⋮</b> → « Installer l\'application ».</p>' },
    { id: 'connexion', titre: 'Connexion et mot de passe', html:
      '<p>Entre ton nom et ton mot de passe. <b>« Rester connecté »</b> garde la session sur ce téléphone ; décoche-le sur un appareil partagé.</p>' +
      '<p>À la première connexion avec un mot de passe provisoire, l\'appli te demande d\'en choisir un nouveau. Ensuite : avatar (rond avec ton initiale) → <b>🔑 Changer mon mot de passe</b>.</p>' },
    { id: 'maj', titre: 'Mises à jour de l\'appli', html:
      '<p>Le numéro de version est affiché dans la carte d\'accueil (« appli v5.x ») et dans Mon compte.</p>' +
      '<p>Pour recevoir une nouvelle version : <b>ferme complètement l\'appli</b> puis rouvre-la (au besoin deux fois).</p>' },

    { groupe: 'La liste des recettes' },
    { id: 'recherche', titre: 'Rechercher et filtrer', html:
      '<p><b>Recherche</b> : tape un mot du titre, d\'un ingrédient ou des notes (les accents ne comptent pas). Plusieurs mots = toutes les recettes qui contiennent tous ces mots.</p>' +
      '<p><b>Catégories</b> : les pastilles colorées (Entrée, Plat, Dessert…). « Toutes » enlève le filtre.</p>' +
      '<p><b>Menus déroulants</b> : mode de cuisson, statut (À tester, Testée…) et <b>« Ajoutées par »</b> (une personne, Severin…). Les filtres se combinent.</p>' },
    { id: 'nouvelles', titre: 'Nouvelles recettes (en rouge)', html:
      '<p>Quand quelqu\'un d\'autre a ajouté une recette depuis ta dernière ouverture de l\'appli : bandeau rouge <b>« 🔴 N nouvelles recettes »</b> et badge <b>NOUVELLE</b> sur les fiches.</p>' +
      '<p>Toucher le bandeau n\'affiche que les nouvelles ; le retoucher affiche tout. À l\'ouverture suivante de l\'appli, elles ne sont plus marquées. Tes propres ajouts ne sont jamais marqués.</p>' },
    { id: 'boutons', titre: 'Boutons du haut', html:
      '<ul><li><b>↻</b> : recharge la liste depuis le serveur (pour voir tout de suite les ajouts des autres).</li>' +
      '<li><b>⬆ n</b> (orange) : n modifications attendent d\'être envoyées ; touche-le pour les envoyer maintenant.</li>' +
      '<li><b>📖 Livre</b> : le livre complet à imprimer ou enregistrer en PDF.</li>' +
      '<li><b>+ Recette</b> : nouvelle recette.</li><li><b>Avatar</b> : ton compte, l\'aide, la déconnexion.</li></ul>' },

    { groupe: 'La fiche recette' },
    { id: 'fiche', titre: 'Lire une fiche', html:
      '<p>En haut : catégorie, titre, personnes, temps total, auteur, modes de cuisson et statut.</p>' +
      '<p><b>Réglages</b> : chaque étape de cuisson avec sa température et son temps.</p>' +
      '<p><b>Ingrédients</b> : chaque ligne a une <b>case à cocher</b> ; cochée, elle est barrée. Ça sert à suivre où tu en es en cuisinant. Les cases ne sont pas enregistrées et n\'apparaissent pas à l\'impression.</p>' +
      '<p><b>Préparation</b> : les étapes numérotées dans l\'ordre.</p>' },
    { id: 'notes', titre: 'Noter une recette (étoiles)', html:
      '<p>« Ma note » : touche de 1 à 5 étoiles. Retoucher la même étoile retire ta note. La <b>moyenne</b> de tout le monde s\'affiche à côté et sur les cartes de la liste.</p>' },
    { id: 'maversion', titre: '« Ma version » d\'une recette', html:
      '<p>Chacun peut modifier n\'importe quelle recette, mais <b>les modifications ne sont visibles que par lui</b>. Les autres continuent à voir la recette d\'origine.</p>' +
      '<p>Une recette modifiée affiche le bandeau « ✎ Ma version » et le badge « ma version » dans la liste. Le bouton <b>↺ Revenir à l\'original</b> efface ta version.</p>' +
      '<p>Une recette <b>ajoutée</b> par quelqu\'un est visible par tout le monde.</p>' },
    { id: 'imprimer', titre: 'Imprimer / PDF', html:
      '<p><b>🖨 Imprimer</b> sur une fiche : imprime cette recette seule. <b>📖 Livre</b> : toutes les recettes affichées (selon les filtres actifs), avec couverture et sommaire.</p>' +
      '<p>Pour un PDF : dans la fenêtre d\'impression, choisis « Enregistrer en PDF » (sur iPhone : écarter deux doigts sur l\'aperçu, puis Partager).</p>' },

    { groupe: 'Encoder une recette' },
    { id: 'titre', titre: 'Titre, catégorie, personnes, temps', html:
      '<p><b>Titre</b> : seul champ obligatoire.</p><p><b>Catégorie</b> : range la recette et choisit sa couleur.</p>' +
      '<p><b>Personnes</b> : nombre de parts. <b>Temps total</b> : préparation + cuisson, en minutes.</p>' },
    { id: 'modes', titre: 'Modes de cuisson', html:
      '<p>Cases à cocher : coche <b>tous</b> les appareils utilisés (par ex. Air fryer + Poêle). Ils servent au filtre « modes de cuisson » de la liste.</p>' },
    { id: 'reglages', titre: 'Réglages de cuisson', html:
      '<p>Choisis d\'abord l\'<b>appareil</b>. Ensuite <b>une ligne par étape</b> :</p>' +
      '<ul><li><b>Nom</b> de l\'étape : Préchauffage, Cuisson 1, Gratiner…</li>' +
      '<li><b>Température</b> : boutons − / + par pas de 5 °C (60 à 200 °C pour la Severin / air fryer).</li>' +
      '<li><b>Temps</b> : − / + par pas de 1 minute.</li>' +
      '<li><b>Remarque</b> (facultatif) : « secouer à mi-cuisson », « retourner »…</li></ul>' +
      '<p><b>+ Ajouter une étape</b> pour une ligne de plus, <b>×</b> pour en retirer une.</p>' },
    { id: 'ingredients', titre: 'Ingrédients', html:
      '<p><b>Un ingrédient par ligne</b>, quantité comprise : « 200 g de farine ».</p>' +
      '<p>Une ligne qui commence par <b>#</b> devient un <b>sous-titre</b> qui regroupe les lignes suivantes :</p>' +
      '<pre># Pâte\n200 g de farine\n1 œuf\n# Sauce\n20 cl de crème</pre>' +
      '<p>Un tiret « - » ou « • » en début de ligne est retiré automatiquement. Sur la fiche, chaque ingrédient aura sa case à cocher.</p>' },
    { id: 'preparation', titre: 'Préparation (étapes numérotées)', html:
      '<p><b>Une étape par ligne</b> : la numérotation est <b>automatique</b>. N\'écris pas « 1. », il serait de toute façon retiré pour éviter « 1. 1. ».</p>' +
      '<pre>Préchauffer l\'air fryer.\nMélanger la farine et l\'œuf.\nCuire 12 min en secouant à mi-cuisson.</pre>' +
      '<p>Les lignes vides sont ignorées. Pour couper une longue étape, passe simplement à la ligne.</p>' },
    { id: 'statut', titre: 'Statut, sources, notes', html:
      '<p><b>Statut</b> : À tester, Testée… (sert de filtre).</p>' +
      '<p><b>Sources</b> : livre, site, personne… Sépare-les par « ; ». Les liens web deviennent cliquables sur la fiche.</p>' +
      '<p><b>Notes</b> : réglages réellement utilisés, ajustements, idées.</p>' },
    { id: 'photo', titre: 'Photo', html:
      '<p><b>📷 Choisir / prendre une photo</b> : appareil photo ou galerie ; elle est réduite (~300 Ko) avant l\'envoi.</p>' +
      '<p>Ou <b>colle un lien</b> (image web ou Google Drive). <b>🗑 Supprimer la photo</b> la retire ; sans photo, une casserole aux couleurs de la catégorie s\'affiche.</p>' },
    { id: 'enregistrer', titre: 'Enregistrer et envoi', html:
      '<p><b>Enregistrer</b> est immédiat : la recette est mise à jour sur le téléphone.</p>' +
      '<p>L\'envoi au serveur se fait au <b>retour à la liste</b>, avec le bouton orange <b>⬆</b>, au retour du réseau ou quand l\'appli passe en arrière-plan. Une fiche pas encore envoyée affiche « ⏳ Enregistrée sur le téléphone ». Hors ligne, rien n\'est perdu.</p>' },
    { id: 'supprimer', titre: 'Supprimer une recette', html:
      '<p>Réservé à l\'<b>administrateur</b> : dans le formulaire de modification, encadré rouge <b>« 🗑 Supprimer cette recette »</b>, à toucher deux fois pour confirmer. La recette disparaît pour tout le monde, versions personnelles comprises.</p>' },

    { groupe: 'Compte et administration' },
    { id: 'compte', titre: 'Mon compte', html:
      '<p>Avatar en haut à droite : changer de mot de passe, livre / PDF, aide, déconnexion, numéro de version.</p>' },
    { id: 'utilisateurs', titre: 'Gérer les utilisateurs (admin)', html:
      '<p>Mon compte → <b>👥 Gérer les utilisateurs</b> : nom, mot de passe provisoire, rôle et <b>e-mail</b>. Avec un e-mail, la personne reçoit le lien de l\'appli et les étapes d\'installation.</p>' +
      '<p><b>Réinitialiser + mail</b> : nouveau mot de passe provisoire (à changer à la connexion). <b>Désactiver</b> bloque le compte sans le supprimer.</p>' }
  ];

  let box = null;
  function construire() {
    box = document.createElement('div');
    box.className = 'help'; box.id = 'help'; box.hidden = true;
    let toc = '', corps = '';
    AIDE.forEach(a => {
      if (a.groupe) { toc += '<h4>' + a.groupe + '</h4>'; corps += '<h3 class="hgrp">' + a.groupe + '</h3>'; return; }
      toc += '<a href="#" data-goto="' + a.id + '">' + a.titre + '</a>';
      corps += '<section class="hsec" id="aide-' + a.id + '"><h2>' + a.titre + '</h2>' + a.html +
        '<a href="#" class="htop" data-goto="__top">↑ Sommaire</a></section>';
    });
    box.innerHTML = '<div class="hbar"><b>❓ Aide</b><button type="button" class="hclose" aria-label="Fermer l\'aide">✕ Fermer</button></div>' +
      '<div class="hscroll"><nav class="htoc" id="aide-__top"><h2>Sommaire</h2>' + toc + '</nav>' + corps + '</div>';
    document.body.appendChild(box);
    box.addEventListener('click', e => {
      const g = e.target.closest('[data-goto]');
      if (g) { e.preventDefault(); aller(g.dataset.goto); return; }
      if (e.target.closest('.hclose')) fermer();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) fermer(); });
    window.addEventListener('popstate', () => { if (!box.hidden) fermer(true); });
  }
  function aller(id) {
    const cible = document.getElementById('aide-' + id) || document.getElementById('aide-__top');
    box.querySelectorAll('.hsec.on').forEach(s => s.classList.remove('on'));
    if (id !== '__top' && cible) cible.classList.add('on');
    const sc = box.querySelector('.hscroll');
    sc.scrollTop = cible ? cible.offsetTop - 8 : 0;
  }
  function ouvrir(id) {
    if (!box) construire();
    box.hidden = false; document.body.classList.add('noscroll');
    try { history.pushState({ aide: 1 }, ''); } catch (e) { /* ignoré */ }   // bouton « retour » du téléphone = fermer l'aide
    requestAnimationFrame(() => aller(id || '__top'));
  }
  function fermer(depuisRetour) {
    box.hidden = true; document.body.classList.remove('noscroll');
    if (!depuisRetour && history.state && history.state.aide) { try { history.back(); } catch (e) { /* ignoré */ } }
  }
  window.ouvrirAide = ouvrir;
  // Tout élément portant data-help="rubrique" ouvre l'aide sur cette rubrique
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-help]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    ouvrir(b.getAttribute('data-help'));
  }, true);
})();
