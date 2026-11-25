/* QuizzNSI : le mode autonome (MIT, Babash - NSI Tani Malandi).
   Les diapositives et les questions, corrigées dans le navigateur. Rien n'est envoyé :
   la progression (première réponse à chaque question) reste dans le stockage de l'appareil.
   « Rejouer le quiz » (revision.html?cours=<id>&rejouer, proposé à la fin d'une séance) : les questions seules,
   dans un ordre mélangé, et les réponses de chaque question mélangées aussi. Rien n'est envoyé ; l'ordre et
   les réponses restent dans l'onglet (sessionStorage), effacés à sa fermeture. */
(function () {
  'use strict';
  const Q = window.QuizzNSI, $ = Q.$;
  const REJOUER = new URLSearchParams(location.search).has('rejouer');
  let cours, diapos = [], index = 0, etat;
  const cle = () => (REJOUER ? 'rejouer:' : 'revision:') + cours.id;
  // La signature du cours : une progression gardée pour une autre version du cours (questions renumérotées,
  // ajoutées ou retirées, options, paires ou lignes changées ou dans un autre ordre, code modifié) est ignorée.
  // Sur l'appareil, la progression est datée et gardée un jour au plus (Q.menage).
  let signature = 0;
  const signer = c => Q.graine((c.interactifs || []).map(q =>
    JSON.stringify([q.id, q.nom, q.type, q.options || null, q.paires || null, q.lignes || null, q.code || null, q.ligne || null])).join('|'));
  const sauver = () => REJOUER ? Q.session.ecrire(cle(), etat) : Q.stock.ecrire(cle(), Object.assign({}, etat, { t: Date.now(), sig: signature }));
  const nouvelleGraine = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; };

  /* Rejouer : les questions dans un ordre tiré au hasard (une graine par partie), et les quatre réponses de
     chaque question mélangées. Une copie de chaque question est faite : la lettre d'une réponse est sa place
     à l'écran, la bonne réponse est recalculée. */
  let original = null;
  function preparerRejouer() {
    // les autres types de questions aussi (sauf le nuage de mots, qui n'a de sens qu'en classe), avec un nouvel ordre
    // des éléments à relier et des lignes du puzzle
    let k = 0;
    const qs = Q.melanger(original.interactifs.filter(d => d.type !== 'nuage'), etat.graine).map(q => {
      const graine = (etat.graine ^ Q.graine(q.id)) >>> 0;
      if (q.type !== 'question') return Object.assign({}, q, { graine, numero: ++k });
      const ordre = Q.melanger([0, 1, 2, 3], graine);
      const c = Object.assign({}, q, { options: ordre.map(i => q.options[i]), numero: ++k });
      c.bonne = ordre.indexOf(q.bonne);
      return c;
    });
    const titre = { type: 'titre', titre: original.titre, conventions: original.diapositives[0] && original.diapositives[0].conventions,
      texte: ['Rejouer le quiz : les ' + qs.length + ' questions dans un nouvel ordre, les réponses mélangées.', 'Seul·e, sur ton téléphone : rien n\'est envoyé.'] };
    const bilan = original.diapositives.find(d => d.type === 'bilan') || { type: 'bilan', titre: 'Ton bilan' };
    cours = Object.assign({}, original, { diapositives: [titre].concat(qs, [bilan]), questions: qs.filter(q => q.type === 'question'), interactifs: qs });
  }

  // Le stockage a pu être modifié : on ne garde que des choix 0 à 3 pour des questions du cours.
  function etatRelu(v) {
    const e = { premiers: {}, essais: {}, vus: {}, act: {}, index: 0 }, ids = new Set(cours.questions.map(q => q.id));
    if (REJOUER) e.graine = v && Number.isSafeInteger(v.graine) && v.graine >= 0 && v.graine < 2 ** 32 ? v.graine : nouvelleGraine();
    const choix = c => Number.isInteger(c) && c >= 0 && c <= 3;
    if (!v || typeof v !== 'object') return e;
    for (const id of ids) {
      if (v.premiers && choix(v.premiers[id])) e.premiers[id] = v.premiers[id];
      if (v.essais && Array.isArray(v.essais[id])) e.essais[id] = v.essais[id].filter(choix).slice(0, 8);
      if (v.vus && v.vus[id] === true) e.vus[id] = true;
    }
    // les autres types : première tentative juste ou non, fini, dernière réponse (contrôlée contre la diapositive)
    for (const d of cours.interactifs) {
      if (d.type === 'question' || !v.act || !v.act[d.id] || typeof v.act[d.id] !== 'object') continue;
      const a = v.act[d.id], r = d.type === 'nuage' ? null : Q.activites.valider(d, a.r);
      e.act[d.id] = { premier: typeof a.premier === 'boolean' ? a.premier : null, fini: a.fini === true, r };
    }
    if (Number.isInteger(v.index) && v.index >= 0 && v.index < cours.diapositives.length) e.index = v.index;
    return e;
  }

  function liste() {
    // « Questions seules » : sans les notions, les parties, les questions à la classe ni l'humour
    return $('questionsSeules').checked && !REJOUER ? cours.diapositives.filter(d => d.type === 'titre' || Q.INTERACTIFS.includes(d.type) || d.type === 'bilan') : cours.diapositives;
  }

  let vus = 0, arriere = false;
  const reste = () => Q.nbFragments($('scene')) - vus;
  function majSuivante() {
    const r = reste();
    $('suiv').textContent = r > 0 ? 'Suite (' + r + ') →' : 'Suivante →';
    $('suiv').disabled = r <= 0 && index === diapos.length - 1;
  }
  // « Suivante » montre d'abord l'élément suivant de la diapositive, puis passe à la suivante
  function avancer(focus) {
    if (reste() > 0) { vus++; Q.montrerFragments($('scene'), vus); majSuivante(); return; }
    if (index < diapos.length - 1) afficher(index + 1, focus);
  }
  function reculer(focus) { if (index > 0) { arriere = true; afficher(index - 1, focus); } }

  function afficher(i, focus) {
    index = Math.max(0, Math.min(diapos.length - 1, i));
    const d = diapos[index];
    etat.index = cours.diapositives.indexOf(d); sauver();
    const scene = $('scene');
    scene.innerHTML = Q.rendreDiapo(cours, d, { boutons: true, interactif: true, fin: d.type === 'bilan' ? bilanPerso() : '' });
    // apparitions progressives : en arrivant par « Suivante », on les montre une à une ; en revenant en arrière, tout est montré
    vus = arriere ? Q.nbFragments(scene) : 0; arriere = false;
    Q.montrerFragments(scene, vus); majSuivante();
    const nq = d.type === 'question' ? ' · question ' + d.numero + ' sur ' + cours.total : Q.INTERACTIFS.includes(d.type) ? (d.type !== 'nuage' ? ' · question ' + d.numero + ' sur ' + cours.total : '') + ' · ' + Q.activites.NOMS[d.type].toLowerCase() : '';
    $('compteur').textContent = 'Diapositive ' + (index + 1) + ' sur ' + diapos.length + nq;
    $('barre').style.width = ((index + 1) / diapos.length * 100) + '%';
    $('prec').disabled = index === 0;
    if (d.type === 'question') brancherQuestion(d);
    else if (Q.INTERACTIFS.includes(d.type)) brancherActivite(d);
    if (d.type === 'bilan') brancherBilan();
    if (!REJOUER) try { history.replaceState(null, '', '#' + (cours.diapositives.indexOf(d) + 1)); } catch (e) { /* rien */ }
    if (focus !== false) scene.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function marquer(q, essais, corrige) {
    const sc = $('scene');
    sc.querySelectorAll('.option').forEach(b => {
      const i = +b.dataset.choix;
      b.classList.remove('choisie', 'bonne-rep');
      const vieux = b.querySelector('.etiquette'); if (vieux) vieux.remove();
      let etiq = '';
      if (corrige && i === q.bonne) { b.classList.add('bonne-rep'); etiq = '✓ Bonne réponse'; }
      else if (essais.includes(i)) { b.classList.add('choisie'); etiq = '✗ Déjà essayée'; b.disabled = true; }
      if (corrige) b.disabled = true;
      if (etiq) b.insertAdjacentHTML('beforeend', '<span class="etiquette">' + etiq + '</span>');
    });
    sc.querySelector('.options').classList.toggle('corrigees', corrige);
  }

  function brancherQuestion(q) {
    const sc = $('scene'), zone = sc.querySelector('.zone-correction');
    const e = etat.essais[q.id] || [];
    const corrige = e.includes(q.bonne) || etat.vus[q.id] === true;
    const montrer = (choix, tout) => {
      const essais = etat.essais[q.id] || [];
      const fini = tout || choix === q.bonne;
      marquer(q, essais, fini);
      if (fini) zone.innerHTML = Q.rendreCorrection(q, choix);
      else zone.innerHTML = '<div class="verdict ko" role="status"><span class="symbole" aria-hidden="true">✗</span><div><p class="v-titre">Pas encore : ta réponse est ' + Q.LETTRES[choix] + '.</p><p>' + Q.texte(q.options[choix].feedback) + '</p></div></div>'
        + '<p>Essaie une autre réponse, ou <button type="button" class="bouton petit" id="voirCorrection">affiche la correction</button></p>';
      const v = $('voirCorrection');
      if (v) v.addEventListener('click', () => { etat.vus[q.id] = true; sauver(); montrer(null, true); });
      Q.annoncer(fini ? (choix === q.bonne ? 'Bonne réponse.' : 'Correction affichée. La bonne réponse est ' + Q.LETTRES[q.bonne] + '.') : 'Ce n\'est pas la bonne réponse. Lis l\'explication puis essaie encore.');
    };
    sc.querySelectorAll('button.option').forEach(b => b.addEventListener('click', () => {
      const c = +b.dataset.choix;
      if (!(q.id in etat.premiers)) etat.premiers[q.id] = c;
      etat.essais[q.id] = (etat.essais[q.id] || []).concat(c);
      sauver();
      montrer(c, false);
    }));
    if (corrige) montrer(e.includes(q.bonne) ? q.bonne : null, true);
    else if (e.length) { marquer(q, e, false); }
  }

  /* Les autres types de questions : essais illimités, ce qui est juste est marqué, la correction quand on veut. */
  function brancherActivite(d) {
    const sc = $('scene'), zone = sc.querySelector('.zone-correction'), zoneO = sc.querySelector('.zone-options');
    const a = etat.act[d.id] || (etat.act[d.id] = { premier: null, fini: false, r: null });
    const corriger = r => {
      ui.bloquer(); a.fini = true; sauver();
      if (r != null) { const n = Q.activites.noter(d, r); ui.marquer(n.detail, r); }
      zone.innerHTML = Q.rendreCorrectionActivite(d, r);
    };
    const ui = Q.activiteUI(d, {
      reponse: a.r, libelle: d.type === 'nuage' ? 'Envoyer' : 'Vérifier',
      onValider(r) {
        if (d.type === 'nuage') {
          // en révision, le mot n'est envoyé nulle part et n'est pas gardé
          ui.bloquer(); a.fini = true; sauver();
          zone.innerHTML = '<div class="verdict neutre" role="status"><span class="symbole" aria-hidden="true">•</span><div><p class="v-titre">Merci ! En classe, ton mot s\'affiche dans le nuage de la classe.</p></div></div>' + Q.rendreCorrectionActivite(d, null);
          return;
        }
        const n = Q.activites.noter(d, r);
        if (a.premier === null) a.premier = n.juste;
        a.r = r; sauver();
        if (n.juste) { corriger(r); Q.annoncer('Tout est juste.'); return; }
        ui.marquer(n.detail, r);
        const ok = n.detail.filter(Boolean).length;
        const titre = d.type === 'ligne' ? 'Pas encore : la ligne ' + (r + 1) + ' est correcte.' : d.type === 'relier' ? 'Pas encore : ' + ok + ' paire' + (ok > 1 ? 's' : '') + ' sur ' + d.paires.length + ' bien reliée' + (ok > 1 ? 's' : '') + ' (marquées ✓).' : 'Pas encore : ' + ok + ' ligne' + (ok > 1 ? 's' : '') + ' sur ' + d.lignes.length + ' à leur place' + (Q.activites.avecIndent(d) ? ', avec la bonne indentation' : '') + ' (marquées en vert).';
        const fb = d.type === 'ligne' ? (d.pieges && d.pieges[String(r + 1)]) || d.feedback_autre : '';
        zone.innerHTML = '<div class="verdict ko" role="status"><span class="symbole" aria-hidden="true">✗</span><div><p class="v-titre">' + Q.echapper(titre) + '</p>' + (fb ? '<p>' + Q.texte(fb) + '</p>' : '') + '</div></div>'
          + '<p>Essaie encore, ou <button type="button" class="bouton petit" id="voirCorrection">affiche la correction</button></p>';
        $('voirCorrection').addEventListener('click', () => corriger(a.r));
        Q.annoncer('Pas encore tout juste. Essaie encore.');
      },
    });
    zoneO.appendChild(ui.noeud);
    if (a.fini) corriger(d.type === 'nuage' ? null : a.r);
  }

  function bilanPerso() {
    // toutes les questions notées comptent : les questions à choix et les autres types (pas le nuage de mots)
    const qs = (cours.interactifs || []).filter(d => d.type !== 'nuage');
    const fait = q => q.type === 'question' ? q.id in etat.premiers : !!(etat.act[q.id] && etat.act[q.id].premier !== null);
    const juste = q => q.type === 'question' ? etat.premiers[q.id] === q.bonne : etat.act[q.id].premier === true;
    const faites = qs.filter(fait), justes = faites.filter(juste), arevoir = faites.filter(q => !juste(q));
    let h = '<div class="ap ap-carte qz-bilan-perso"><h3 class="ap-sous">Ton bilan</h3>' + (qs.length ? '<p><strong>' + justes.length + ' sur ' + qs.length + '</strong> du premier coup'
      + (faites.length < qs.length ? ' (' + (qs.length - faites.length) + ' question' + (qs.length - faites.length > 1 ? 's' : '') + ' sans réponse)' : '') + '.</p>' : '');
    if (arevoir.length) h += '<p>À revoir :</p><ul class="qz-arevoir">' + arevoir.map(q => '<li><button class="ap-bt ap-bt-mini" type="button" data-aller="' + q.id + '">' + 'Question ' + q.numero + (q.type === 'question' ? '' : ' (' + Q.echapper(Q.activites.NOMS[q.type]).toLowerCase() + ')') + ' · ' + Q.texte(q.nom) + '</button></li>').join('') + '</ul>';
    else if (faites.length) h += '<p>Tout juste du premier coup : bravo ! Tu peux aider un·e camarade.</p>';
    h += REJOUER
      ? '<p class="ap-commandes"><button class="ap-bt ap-bt-principal" type="button" id="recommencer">Rejouer encore (nouvel ordre)</button> <a class="ap-bt" href="revision.html?cours=' + encodeURIComponent(cours.id) + '">Revoir le cours</a></p></div>'
      : '<p class="ap-commandes"><button class="ap-bt" type="button" id="recommencer">Recommencer à zéro</button> <a class="ap-bt" href="imprimer.html?cours=' + encodeURIComponent(cours.id) + '">Version à imprimer</a> <a class="ap-bt" href="revision.html?cours=' + encodeURIComponent(cours.id) + '&amp;rejouer">Rejouer le quiz (mélangé)</a></p></div>';
    return h;
  }
  function brancherBilan() {
    $('scene').querySelectorAll('[data-aller]').forEach(b => b.addEventListener('click', () => {
      $('questionsSeules').checked = false; diapos = liste();
      afficher(diapos.findIndex(d => d.id === b.dataset.aller));
    }));
    const r = $('recommencer');
    if (r) r.addEventListener('click', () => {
      etat = { premiers: {}, essais: {}, vus: {}, act: {}, index: 0 };
      if (REJOUER) { etat.graine = nouvelleGraine(); preparerRejouer(); diapos = liste(); }
      sauver(); afficher(0);
    });
  }

  document.addEventListener('keydown', ev => {
    if (ev.target.closest && ev.target.closest('input, textarea, select')) return;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); avancer(); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); reculer(); }
    else if (/^[abcd]$/i.test(ev.key)) {
      const b = $('scene').querySelector('button.option[data-choix="' + 'abcd'.indexOf(ev.key.toLowerCase()) + '"]');
      if (b && !b.disabled) { ev.preventDefault(); b.click(); }
    }
  });

  async function demarrer() {
    Q.theme();
    try { cours = await Q.chargerCours(Q.idCours()); }
    catch (e) { Q.erreurPage($('scene'), e.message); $('commandes').hidden = true; return; }
    const mode = REJOUER ? 'rejouer le quiz' : 'réviser seul·e';
    document.title = 'QuizzNSI · ' + cours.titre + ' · ' + mode;
    $('titreCours').textContent = cours.titre + ' · ' + mode;
    if (REJOUER) {
      original = cours;
      etat = etatRelu(Q.session.lire(cle(), null));
      preparerRejouer();
      etat = Object.assign(etatRelu(etat), { graine: etat.graine });
      $('questionsSeules').closest('label').hidden = true;
      $('noteRevision').textContent = 'Au clavier : flèches gauche et droite pour changer de question ; touches A, B, C, D pour répondre. Rien n\'est envoyé : l\'ordre des questions et tes réponses restent dans cet onglet, effacés à sa fermeture.';
      sauver();
      diapos = liste();
      $('prec').addEventListener('click', () => reculer(false));
      $('suiv').addEventListener('click', () => avancer(false));
      afficher(Math.min(etat.index, diapos.length - 1), false);
      return;
    }
    signature = signer(cours);
    const garde = Q.stock.lire(cle(), null);
    const valide = garde && typeof garde === 'object' && garde.sig === signature && Number.isFinite(garde.t) && Date.now() - garde.t <= Q.DUREE_REVISION;
    if (garde && !valide) Q.stock.oublier(cle());
    etat = etatRelu(valide ? garde : null);
    $('questionsSeules').checked = Q.stock.lire('questions-seules', false) === true;
    diapos = liste();
    $('questionsSeules').addEventListener('change', () => {
      Q.stock.ecrire('questions-seules', $('questionsSeules').checked);
      const actuelle = diapos[index]; diapos = liste();
      const k = diapos.indexOf(actuelle); afficher(k >= 0 ? k : 0, false);
    });
    $('prec').addEventListener('click', () => reculer(false));
    $('suiv').addEventListener('click', () => avancer(false));
    const h = parseInt(location.hash.slice(1), 10);
    const depart = Number.isInteger(h) && h >= 1 ? cours.diapositives[h - 1] : cours.diapositives[etat.index || 0];
    const k = diapos.indexOf(depart);
    afficher(k >= 0 ? k : 0, false);
    window.addEventListener('hashchange', () => {
      const n = parseInt(location.hash.slice(1), 10), d = cours.diapositives[n - 1];
      if (!d || d === diapos[index]) return;
      if (!diapos.includes(d)) { $('questionsSeules').checked = false; diapos = liste(); }
      afficher(diapos.indexOf(d), false);
    });
  }
  demarrer();
})();
