/* QuizzNSI : la page élève, pensée pour un téléphone (MIT, Babash - NSI Tani Malandi).
   L'élève entre le code de la séance et un prénom ou un pseudo, puis répond aux questions.
   Points : le téléphone calcule lui-même ses points (js/bareme.js) à partir de sa réponse, de son temps,
   de la bonne réponse et du barème reçus à la correction ; personne d'autre ne les reçoit. Sa réponse
   part chiffrée pour la page projetée (js/chiffre.js).
   Sécurité : chaque message reçu est validé par js/messages.js (schéma strict) ; le texte des
   notions et des questions vient du fichier du cours (cours/<id>.json, même site), jamais du canal ;
   les valeurs reçues (points, séries, pseudos du podium) s'affichent par textContent seulement.
   Rien n'est enregistré en ligne. Sur l'appareil : le code, le pseudo et un identifiant de séance,
   effacés à la fin de la séance, et sinon au premier chargement d'une page après 12 heures, pour revenir après une coupure avec ses points (même code et même pseudo). */
(function () {
  'use strict';
  const Q = window.QuizzNSI, $ = Q.$, el = Q.el;
  const DOUZE_HEURES = 12 * 3600 * 1000;
  let moi = null, seance = null, phase = null, question = null, attenteHote = null, hoteVu = false, renvoi = null, chrono = null, total = 0, numero = 0;
  let clesHote = [], chiffreur = null, essais = 0;
  let seriesVisibles = true; // le réglage « Afficher les séries » de l'enseignant·e, reçu avec chaque correction
  const ESSAIS_AVANT_ALERTE = 4; // 4 envois, toutes les 2 s, sans accusé de réception : on prévient
  const lesCours = new Map();

  function obtenirCours(id) {
    if (!lesCours.has(id)) lesCours.set(id, Q.chargerCours(id).catch(() => { lesCours.delete(id); return null; }));
    return lesCours.get(id);
  }

  /* ── L'entrée ───────────────────────────── */
  function afficherEntree(message) {
    if (seance) { seance.fermer(); seance = null; }
    clearInterval(renvoi); clearInterval(chrono); chrono = null; clearTimeout(attenteHote);
    $('jeu').hidden = true; $('entree').hidden = false; $('quitter').hidden = true;
    $('moi').textContent = ''; $('points').textContent = '';
    $('erreurPseudo').textContent = message || '';
    phase = null; question = null; total = 0;
    if (message) $('champPseudo').focus();
  }

  function rejoindre(ev) {
    if (ev) ev.preventDefault();
    const code = Q.lireCode($('champCode').value), f = Q.filtrerPseudo($('champPseudo').value);
    $('erreurCode').textContent = code ? '' : 'Le code de la séance a 4 lettres (sans I ni O), comme ABCD.';
    $('erreurPseudo').textContent = f.ok ? '' : f.raison;
    if (!code) { $('champCode').focus(); return; }
    if (!f.ok) { $('champPseudo').focus(); return; }
    const ancien = lireAncien();
    // même code et même pseudo dans les 12 heures : on garde son identifiant, donc ses points
    const memes = ancien && ancien.code === code && Q.clePseudo(ancien.pseudo) === Q.clePseudo(f.pseudo);
    const id = memes ? ancien.id : Q.nouvelId();
    moi = { id, pseudo: f.pseudo, code };
    Q.stock.ecrire('eleve', { id, pseudo: f.pseudo, code, jusqua: Date.now() + DOUZE_HEURES });
    Q.session.ecrire('eleve', moi);
    entrer();
  }

  // Le stockage peut avoir été modifié : chaque valeur relue est contrôlée.
  function lireAncien() {
    const a = Q.stock.lire('eleve', null);
    if (!a || typeof a !== 'object' || !Number.isFinite(a.jusqua) || a.jusqua < Date.now()) return null;
    const f = Q.filtrerPseudo(a.pseudo);
    return Q.lireCode(a.code) === a.code && f.ok && f.pseudo === a.pseudo && Q.messages.estId(a.id) ? { id: a.id, pseudo: a.pseudo, code: a.code } : null;
  }
  function lireOnglet() {
    const a = Q.session.lire('eleve', null);
    if (!a || typeof a !== 'object') return null;
    const f = Q.filtrerPseudo(a.pseudo);
    return Q.lireCode(a.code) === a.code && f.ok && f.pseudo === a.pseudo && Q.messages.estId(a.id) ? { id: a.id, pseudo: a.pseudo, code: a.code } : null;
  }

  // Sans chiffrement, le téléphone ne peut pas envoyer de réponse : on le dit dès l'entrée.
  function sansChiffrement() {
    if (seance) { seance.fermer(); seance = null; }
    $('connexion').className = 'etat ko'; $('connexion').textContent = '';
    ecran(el('div', { class: 'alerte', role: 'alert' },
      el('p', {}, el('strong', {}, 'Ce navigateur ne peut pas participer à la séance en direct'), ' : il ne sait pas chiffrer les réponses (il faut une page en https et un navigateur à jour).'),
      el('p', {}, 'Tu peux suivre le même cours seul·e, avec les mêmes questions corrigées : ', el('a', { href: 'revision.html' }, 'réviser seul·e'), '.')));
  }

  async function entrer() {
    $('entree').hidden = true; $('jeu').hidden = false; $('quitter').hidden = false;
    $('moi').textContent = moi.pseudo;
    majPoints();
    ecran(el('div', { class: 'attente' }, el('p', { class: 'grand' }, 'Connexion…'), el('p', {}, 'Séance ' + moi.code)));
    hoteVu = false; clesHote = [];
    total = historique().total; majPoints();
    if (!chiffreur) {
      try { if (!Q.chiffre.disponible()) throw new Error('crypto.subtle absent'); chiffreur = await Q.chiffre.eleve(); }
      catch (e) { chiffreur = null; sansChiffrement(); return; }
    }
    seance = Q.ouvrirSeance(moi.code, { id: moi.id, pseudo: moi.pseudo, role: 'eleve' }, { onMessage, onPresence, onEtat });
  }

  function onEtat(e) {
    const z = $('connexion');
    if (e === 'connexion') { z.className = 'etat'; z.textContent = 'Connexion à la séance…'; }
    else if (e === 'connecte') {
      z.className = 'etat ok'; z.textContent = 'Connecté·e à la séance ' + moi.code + '.';
      seance.envoyer({ t: 'bonjour', id: moi.id });
      clearTimeout(attenteHote);
      attenteHote = setTimeout(() => {
        if (!hoteVu) ecran(el('div', { class: 'attente' }, el('p', { class: 'grand' }, 'En attente de l\'enseignant·e'),
          el('p', {}, 'Vérifie le code de la séance : ', el('strong', {}, moi.code), '. S\'il est faux, quitte et entre le bon code.')));
      }, 9000);
    } else if (e === 'erreur' || e === 'ferme') {
      z.className = 'etat ko'; z.textContent = '';
      const b = el('button', { type: 'button', class: 'bouton petit' }, 'Réessayer');
      b.addEventListener('click', () => { if (seance) seance.fermer(); entrer(); });
      z.append('Pas de connexion à la séance : vérifie le réseau (wifi ou données mobiles), puis réessaie. ', b,
        ' Tu peux aussi suivre le cours seul·e : ', el('a', { href: 'revision.html' }, 'réviser seul·e'), '.');
    }
  }

  function onPresence(liste) {
    const hotes = (Array.isArray(liste) ? liste : []).map(Q.messages.presence).filter(v => v && v.role === 'hote');
    // la réponse est chiffrée pour chaque page projetée présente (en pratique, une seule)
    clesHote = hotes.filter(h => h.cle).slice(0, 50).map(h => h.cle);
    const vu = hotes.length > 0;
    if (vu && !hoteVu) { hoteVu = true; if (!phase) ecran(attente('L\'enseignant·e est là. Regarde l\'écran : le cours va commencer.')); seance.envoyer({ t: 'bonjour', id: moi.id }); }
  }

  /* ── Les messages de la séance ──────────── */
  function onMessage(brut) {
    if (!moi) return;
    const m = Q.messages.versEleve(brut, moi.id);
    if (!m) return; // message non conforme : ignoré
    hoteVu = true; clearTimeout(attenteHote);
    if (m.t === 'retire') { if (m.pourMoi) { Q.stock.oublier('eleve'); Q.session.oublier('eleve'); Q.stock.oublier('hist:' + moi.id); afficherEntree('L\'enseignant·e a retiré ce pseudo. Choisis-en un autre : ton prénom ou un pseudo, jamais ton nom de famille.'); } return; }
    if (m.t === 'refus') { if (m.pourMoi) { Q.session.oublier('eleve'); afficherEntree(m.raison === 'pris' ? 'Ce pseudo est déjà pris dans la séance : choisis-en un autre.' : 'Ce pseudo n\'est pas accepté : choisis-en un autre.'); } return; }
    if (m.t === 'recus') {
      if (nuage && m.qid === nuage.qid) { for (const x of m.n) if (nuage.envois.has(x)) { nuage.envois.get(x).fait(); nuage.envois.delete(x); } majNuageTel(); }
      if (question && m.qid === question.qid && question.n && m.n.includes(question.n)) { question.recu = true; clearInterval(renvoi); majEnvoyee(); }
      return;
    }
    if (m.t === 'attente') { phase = 'attente'; question = null; ecran(attente('Regarde l\'écran : la suite arrive.')); return; }
    if (m.t === 'fermee') { if (question && m.qid === question.qid) { question.ferme = true; question.pause = false; clearInterval(chrono); chrono = null; if ($('pauseInfo')) $('pauseInfo').textContent = ''; if (question.choix == null) ecran(attente('Temps écoulé : la correction arrive à l\'écran.')); else { bloquer(); majEnvoyee(); } } return; }
    const n = ++numero; // seul le dernier message reçu s'affiche, même si son cours arrive plus tard
    obtenirCours(m.cours).then(cours => {
      if (!cours || n !== numero) return;
      if (m.t === 'notion') afficherNotion(cours, m);
      else if (m.t === 'question') afficherQuestion(cours, m);
      else if (m.t === 'correction') afficherCorrection(cours, m);
      else if (m.t === 'corrige') afficherCorrige(cours, m);
      else if (m.t === 'nuage') afficherNuage(cours, trouverQuestion(cours, m.qid), m.mots);
      else if (m.t === 'fin') afficherFin(cours, m);
    });
  }

  function ecran(noeud) {
    if (nuage && phase !== 'nuage') nuage = null; // on quitte le nuage : ses envois en cours s'arrêtent
    const z = $('ecran'); z.textContent = ''; delete z.dataset.n; z.appendChild(noeud); }
  const attente = texte => el('div', { class: 'attente' }, el('p', { class: 'grand' }, moi.pseudo + ', tu es dans la séance.'), el('p', {}, texte));
  function majPoints() { $('points').textContent = total + ' pts'; }
  const trouverQuestion = (cours, qid) => cours.interactifs.find(q => q.id === qid) || null;
  const qcu = q => q.type === 'question';

  function afficherNotion(cours, m) {
    const d = cours.diapositives[m.n];
    if (!d || Q.INTERACTIFS.includes(d.type)) return;
    // même diapositive : on ne montre que les éléments apparus en plus (pas de clignotement)
    if (phase === 'notion' && question === null && $('ecran').dataset.n === String(m.n)) { Q.montrerFragments($('ecran'), m.f); return; }
    phase = 'notion'; question = null;
    const z = el('div', {}, el('p', { class: 'aide' }, 'Le cours, en même temps que l\'écran :'));
    z.appendChild(Q.fragmentCours(Q.rendreDiapo(cours, d, { fin: '' })));
    ecran(z);
    $('ecran').dataset.n = String(m.n);
    Q.montrerFragments($('ecran'), m.f);
  }

  function afficherQuestion(cours, m) {
    const q = trouverQuestion(cours, m.qid);
    if (!q) return;
    if (q.type === 'nuage') { afficherNuage(cours, q, null); return; }
    if (question && question.qid === q.id && phase === 'question') {
      // déjà affichée : la minuterie suit la page projetée (+ 15 s, pause, reprise) ; une question fermée au zéro
      // puis rouverte par « + 15 s » se réaffiche, pour répondre
      if (!(question.ferme && !m.ferme)) { if (m.ferme) { question.ferme = true; clearInterval(chrono); chrono = null; bloquer(); majEnvoyee(); } else synchroniser(m); majChrono(); return; }
    }
    phase = 'question';
    const ancienne = historique().reps[q.id] || null; // la page rouverte retrouve la réponse déjà donnée
    // une réponse déjà donnée (page rouverte) : contrôlée de nouveau contre la question du cours
    const avant = !ancienne ? null : qcu(q) ? (Number.isInteger(ancienne.c) ? ancienne.c : null) : Q.activites.valider(q, ancienne.r);
    question = { qid: q.id, q, choix: avant, ms: ancienne ? ancienne.ms : null, n: ancienne ? ancienne.n : null, k: ancienne ? ancienne.k : 0, recu: false, ferme: m.ferme };
    synchroniser(m);
    const s = el('section', { class: 'd-question' + (qcu(q) ? '' : ' d-activite d-' + q.type) });
    if (qcu(q)) {
      s.appendChild(Q.fragmentCours(Q.rendreEnonce(q, cours.total)));
      s.append(el('p', { class: 'chrono', id: 'chrono', 'aria-live': 'off' }), el('p', { class: 'pause-info', id: 'pauseInfo', role: 'status' }));
      s.appendChild(Q.fragmentCours(Q.rendreOptions(q, { boutons: true })));
    } else {
      s.appendChild(Q.fragmentCours(Q.rendreEnonceActivite(q, cours.total)));
      s.append(el('p', { class: 'chrono', id: 'chrono', 'aria-live': 'off' }), el('p', { class: 'pause-info', id: 'pauseInfo', role: 'status' }));
      question.ui = Q.activiteUI(q, { reponse: avant, libelle: avant != null ? 'Changer ma réponse' : 'Valider', onValider: choisir });
      s.appendChild(question.ui.noeud);
    }
    s.append(el('p', { class: 'envoyee', id: 'envoyee', role: 'status' }), el('p', { class: 'aide changer', id: 'changer' }));
    ecran(s);
    $('ecran').querySelectorAll('button.option').forEach(b => b.addEventListener('click', () => choisir(+b.dataset.choix)));
    if (question.ferme || question.k >= Q.bareme.MAX_CHANGEMENTS) bloquer(); else marquerChoix();
    if (question.choix != null) { majEnvoyee(); envoyerReponse(); }
    clearInterval(chrono); chrono = null;
    if (question.duree > 0 && !question.ferme) { majChrono(); chrono = setInterval(majChrono, 500); }
    $('ecran').focus({ preventScroll: true }); window.scrollTo(0, 0);
    Q.annoncer('Question ' + q.numero + ' : ' + q.nom.replace(/`/g, ''));
  }
  /* La minuterie, d'après le dernier message « question » de la page projetée : le temps déjà écoulé hors pause
     (durée accordée moins le temps restant), puis le temps qui court depuis la réception, sauf en pause. */
  function synchroniser(m) {
    if (!question) return;
    question.duree = m.duree; question.pause = m.pause;
    question.base = m.duree > 0 && m.reste != null ? Math.max(0, m.duree * 1000 - m.reste) : 0;
    question.depuis = m.pause ? null : Date.now();
    if (m.duree > 0 && !question.ferme && !chrono) chrono = setInterval(majChrono, 500);
  }
  const ecouleIci = () => !question ? 0 : (question.base || 0) + (question.depuis ? Date.now() - question.depuis : 0);
  function majChrono() {
    const z = $('chrono'); if (!z || !question || !(question.duree > 0)) return;
    const s = Math.max(0, Math.ceil((question.duree * 1000 - ecouleIci()) / 1000));
    // la pause se lit sans la couleur : le symbole, le mot et une phrase
    z.textContent = (question.pause ? '‖ En pause · ' : '⏱ ') + s + ' s';
    z.classList.toggle('en-pause', !!question.pause);
    const p = $('pauseInfo');
    if (p) p.textContent = question.pause && !question.ferme ? (question.choix == null ? 'Le temps est arrêté : tu peux lire et répondre, sans gain ni perte de rapidité.' : 'Le temps est arrêté : tu peux encore changer d\'avis.') : '';
    if (s === 0 && !question.pause) { clearInterval(chrono); chrono = null; }
  }
  /* Changer d'avis (règle du 24/11) : tant que la question est ouverte (pause comprise), le premier choix est
     envoyé tout de suite comme réponse, reste sélectionné (étiquette « Ta réponse » et bouton enfoncé, pas la couleur
     seule), et un autre choix le remplace ; on ne peut pas revenir à « pas de réponse ». Seul le dernier choix reçu
     par la page projetée compte, avec son instant pour la rapidité (js/bareme.js, retenir). */
  function marquerChoix() {
    const z = $('changer');
    if (z) z.textContent = question.ferme || question.k >= Q.bareme.MAX_CHANGEMENTS ? '' : question.duree > 0 ? 'Tu peux changer d\'avis jusqu\'à la fin du temps.' : 'Tu peux changer d\'avis jusqu\'à la correction.';
    if (question.ui) return;
    $('ecran').querySelectorAll('button.option').forEach(b => {
      const moi = +b.dataset.choix === question.choix, et = b.querySelector('.etiquette');
      b.classList.toggle('choisie', moi); b.setAttribute('aria-pressed', String(moi));
      if (moi && !et) b.appendChild(el('span', { class: 'etiquette' }, 'Ta réponse'));
      if (!moi && et) et.remove();
    });
  }
  function bloquer() {
    if (!question) return;
    if (question.ui) question.ui.bloquer();
    else $('ecran').querySelectorAll('button.option').forEach(b => { b.disabled = true; });
    const ferme = question.ferme; question.ferme = true; marquerChoix(); question.ferme = ferme;
  }
  function choisir(c) {
    if (!question || question.ferme) return;
    const q = question.q;
    if (qcu(q) ? !(Number.isInteger(c) && c >= 0 && c <= 3) : Q.activites.valider(q, c) === null) return;
    if (!qcu(q)) c = Q.activites.valider(q, c);
    // le même choix recliqué ne change rien (ni la réponse, ni l'instant)
    if (question.choix != null && JSON.stringify(c) === JSON.stringify(question.choix)) return;
    const k = question.choix == null ? 0 : (question.k || 0) + 1;
    if (k > Q.bareme.MAX_CHANGEMENTS) return;
    question.choix = c; question.k = k; question.ms = Math.round(ecouleIci()); question.n = Q.nouvelId(); question.recu = false;
    const h = historique(); h.reps[question.qid] = qcu(q) ? { c, ms: question.ms, n: question.n, k } : { r: c, ms: question.ms, n: question.n, k }; ecrireHistorique(h);
    // 30 changements au plus : ensuite, la réponse est gardée telle quelle (frein contre l'inondation, sans reproche)
    if (k >= Q.bareme.MAX_CHANGEMENTS) bloquer(); else marquerChoix();
    if (question.ui && question.ui.renommer) question.ui.renommer('Changer ma réponse');
    majEnvoyee(); envoyerReponse();
    Q.annoncer(qcu(q) ? 'Réponse ' + Q.LETTRES[c] + ' choisie.' + (k ? '' : ' Tu peux encore changer d\'avis.') : 'Réponse envoyée.');
  }
  function envoyerReponse() {
    const envoi = async () => {
      if (!(question && question.choix != null && !question.recu && !question.ferme)) { clearInterval(renvoi); return; }
      if (!chiffreur || !clesHote.length) { majEnvoyee(); return; } // pas encore de page projetée : on réessaie dans 2 s
      const clair = qcu(question.q) ? { id: moi.id, qid: question.qid, c: question.choix, n: question.n, k: question.k } : { id: moi.id, qid: question.qid, r: question.choix, n: question.n, k: question.k };
      let parti = false;
      // chiffrée pour chaque page projetée présente (en principe, une seule)
      for (const k of clesHote) { try { const env = await chiffreur.chiffrer(clair, k); if (seance) { seance.envoyer(Object.assign({ t: 'rep' }, env)); parti = true; } } catch (e) { /* clé illisible : ignorée */ } }
      if (parti) essais++;
      majEnvoyee();
    };
    essais = 0;
    clearInterval(renvoi); envoi(); renvoi = setInterval(envoi, 2000);
  }
  // « reçue » seulement après l'accusé de réception de la page projetée.
  function majEnvoyee() {
    const z = $('envoyee'); if (!z || !question || question.choix == null) return;
    const l = qcu(question.q) ? Q.LETTRES[question.choix] : '';
    if (question.ferme) { z.className = 'envoyee'; z.textContent = 'C\'est ' + (l ? 'ta réponse ' + l : 'ta dernière réponse') + ' qui compte. La correction arrive à l\'écran.'; }
    else if (question.recu) { z.className = 'envoyee'; z.textContent = (l ? 'Réponse ' + l : 'Ta réponse') + ' reçue par la page projetée.'; }
    else if (!clesHote.length) { z.className = 'envoyee'; z.textContent = (l ? 'Réponse ' + l + ' choisie' : 'Réponse prête') + ' : en attente de la page projetée…'; }
    else if (essais >= ESSAIS_AVANT_ALERTE) { z.className = 'envoyee alerte'; z.textContent = 'La page projetée n\'a pas encore reçu ta réponse' + (l ? ' ' + l : '') + ' : vérifie le réseau (wifi ou données). Le téléphone continue d\'essayer.'; }
    else { z.className = 'envoyee'; z.textContent = (l ? 'Réponse ' + l + ' choisie' : 'Réponse prête') + ' : envoi à la page projetée…'; }
  }

  /* ── Mes points, calculés ici ───────────── */
  // L'historique de la séance, sur l'appareil (comme l'entrée « eleve » : effacé à la fin de la séance, et sinon
  // au premier chargement d'une page de QuizzNSI après 12 heures) : les questions corrigées dans l'ordre,
  // mes résultats, mes réponses données.
  // Il permet de rouvrir la page (onglet fermé, QR code scanné de nouveau) sans perdre ses points.
  function historique() {
    const v = moi ? Q.stock.lire('hist:' + moi.id, null) : null, h = { ordre: [], res: {}, reps: {}, total: 0 };
    if (!v || typeof v !== 'object' || v.code !== moi.code || v.id !== moi.id || !Number.isFinite(v.jusqua) || v.jusqua < Date.now()
      || !Array.isArray(v.ordre) || !v.res || typeof v.res !== 'object') return h;
    if (v.reps && typeof v.reps === 'object') for (const [qid, a] of Object.entries(v.reps)) {
      if (!Q.messages.estQid(qid) || !a || typeof a !== 'object' || !Number.isFinite(a.ms) || a.ms < 0 || a.ms >= 1e8 || typeof a.n !== 'string' || !/^[0-9a-f]{16}$/.test(a.n)) continue;
      const k = Number.isInteger(a.k) && a.k >= 0 && a.k <= Q.bareme.MAX_CHANGEMENTS ? a.k : 0; // le numéro du dernier choix
      if (Number.isInteger(a.c) && a.c >= 0 && a.c <= 3) h.reps[qid] = { c: a.c, ms: a.ms, n: a.n, k };
      else if (a.r !== undefined && Q.messages.formeReponse(a.r) !== undefined) h.reps[qid] = { r: Q.messages.formeReponse(a.r), ms: a.ms, n: a.n, k }; // contrôlée contre la question à l'usage
    }
    for (const qid of v.ordre.slice(0, 1000)) {
      const r = v.res[qid];
      if (!Q.messages.estQid(qid) || !r || typeof r !== 'object' || h.res[qid]) continue;
      const ok = (r.c === null || (Number.isInteger(r.c) && r.c >= 0 && r.c <= 3)) && Number.isInteger(r.gain) && r.gain >= 0 && r.gain <= 1000;
      if (!ok) continue;
      h.ordre.push(qid); h.res[qid] = { c: r.c, juste: r.juste === true, gain: r.gain, rebond: r.rebond === true, p: r.p === null || Q.messages.estQid(r.p) ? r.p : undefined }; h.total += r.gain;
    }
    return h;
  }
  function ecrireHistorique(h) {
    Q.stock.ecrire('hist:' + moi.id, { code: moi.code, id: moi.id, jusqua: Date.now() + DOUZE_HEURES, ordre: h.ordre, res: h.res, reps: h.reps });
  }
  function noter(m) {
    const h = historique();
    if (h.res[m.qid]) return { h, r: h.res[m.qid], detail: null };
    const rep = question && question.qid === m.qid && question.choix != null ? { c: question.choix, ms: question.ms } : (h.reps[m.qid] || null);
    const pr = m.precedente && h.res[m.precedente] && h.res[m.precedente].c !== null ? (h.res[m.precedente].juste ? 'juste' : 'faux') : null;
    const juste = rep ? rep.c === m.bonne : false;
    // le barème est celui du moteur (js/bareme.js), jamais celui reçu : une correction forgée ne gonfle pas les points
    const p = Q.bareme.points(rep ? { juste, ms: rep.ms } : null, { duree: m.duree, precedente: pr }, Q.bareme.BAREME);
    const r = { c: rep ? rep.c : null, juste, gain: p.total, rebond: p.detail.rebond > 0, p: m.precedente };
    h.ordre.push(m.qid); h.res[m.qid] = r; h.total += p.total;
    ecrireHistorique(h);
    return { h, r, detail: rep ? p.detail : null };
  }
  const bilanDe = h => {
    const suite = h.ordre.map(q => h.res[q].c === null ? null : h.res[q].juste ? 'juste' : 'faux');
    // pour la série : une correction manquée (téléphone hors ligne) compte comme une question sans réponse, comme
    // sur la page projetée ; on la repère à la question corrigée juste avant, notée avec chaque résultat
    const pourSerie = [];
    h.ordre.forEach((q, i) => { const p = h.res[q].p; if (typeof p === 'string' && p !== h.ordre[i - 1]) pourSerie.push(null); pourSerie.push(suite[i]); });
    return Object.assign(Q.bareme.progression(suite), { suite, flamme: Q.bareme.serie(pourSerie) });
  };
  // La flamme après la correction (à partir de 2 d'affilée), ou « nouvelle série à la prochaine », jamais un reproche.
  function blocSerie(b) {
    if (!seriesVisibles) return null;
    if (b.flamme.n >= 2) return el('p', { class: 'serie' }, Q.flamme(b.flamme.n, b.flamme.palier), ' ', el('span', { class: 'serie-mot' }, b.flamme.palier ? 'Bravo, ça chauffe !' : 'Continue comme ça.'));
    if (b.flamme.casse) return el('p', { class: 'serie neutre' }, 'Nouvelle série à la prochaine.');
    return null;
  }

  function suite(s) {
    if (!s.length) return null;
    return el('ol', { class: 'suite', 'aria-label': 'Tes réponses, question par question' }, s.map((r, i) =>
      el('li', { class: r === 'juste' ? 'j' : r === 'faux' ? 'f' : '', title: 'Question jouée n° ' + (i + 1) },
        el('span', { 'aria-hidden': 'true' }, r === 'juste' ? '✓' : r === 'faux' ? '✗' : '–'),
        el('span', { class: 'visuel-cache' }, r === 'juste' ? 'juste' : r === 'faux' ? 'faux' : 'sans réponse'))));
  }
  const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

  function afficherCorrection(cours, m) {
    const q = trouverQuestion(cours, m.qid);
    if (!q) return;
    if (q.bonne !== m.bonne) return; // la bonne réponse annoncée doit être celle du fichier du cours
    clearInterval(renvoi); clearInterval(chrono); chrono = null;
    phase = 'correction';
    seriesVisibles = m.series;
    const note = noter(m), r = note.r;
    const choix = r.c;
    question = { qid: q.id, q, choix, recu: true, ferme: true };
    total = note.h.total; majPoints();
    const s = el('section', { class: 'd-question' },
      el('header', { class: 'q-tete' }, el('p', { class: 'q-num' }, 'Question ' + q.numero + ' sur ' + cours.total + ' · correction'),
        (() => { const h = el('h2', { class: 'q-nom' }); h.appendChild(Q.fragmentCours(Q.texte(q.nom))); return h; })()));
    if (choix == null) s.appendChild(el('div', { class: 'verdict neutre', role: 'status' }, el('span', { class: 'symbole', 'aria-hidden': 'true' }, '•'),
      el('div', {}, el('p', { class: 'v-titre' }, 'Pas de réponse cette fois. La bonne réponse est ' + Q.LETTRES[q.bonne] + '.'))));
    s.appendChild(Q.fragmentCours(Q.rendreCorrection(q, choix)));
    if (note.detail && r.gain > 0) {
      const d = note.detail, parts = [];
      if (d.juste) parts.push(d.juste + ' bonne réponse'); if (d.participation) parts.push(d.participation + ' participation');
      if (d.rapidite) parts.push(d.rapidite + ' rapidité'); if (d.rebond) parts.push(d.rebond + ' rebond');
      s.appendChild(el('p', { class: 'gains' }, '+' + r.gain + ' points ', el('small', {}, '(' + parts.join(', ') + ')')));
      if (d.rebond) s.appendChild(el('p', { class: 'rebonds' }, 'Beau rebond : tu t\'es repris·e juste après une erreur.'));
    }
    {
      const b = bilanDe(note.h);
      s.appendChild(el('div', { class: 'cadre' }, blocSerie(b), el('p', {}, el('strong', {}, pluriel(b.justes, 'juste')), ' sur ' + pluriel(b.repondues, 'réponse')
        + (b.rebonds ? ' · rebonds : ' + b.rebonds : '')), suite(b.suite)));
    }
    if (m.podium && m.podium.some(p => p.pseudo === moi.pseudo)) s.appendChild(el('p', { class: 'rebonds' }, 'Tu es sur le podium en ce moment.'));
    ecran(s);
    $('ecran').focus({ preventScroll: true }); window.scrollTo(0, 0);
    Q.annoncer(choix == null ? 'Correction : pas de réponse.' : choix === q.bonne ? 'Bonne réponse.' : 'Pas cette fois. Lis l\'explication.');
  }

  // La correction d'une question d'un autre type : le téléphone compare sa propre réponse à la solution du
  // fichier du cours et calcule ses points (js/activites.js et js/bareme.js) ; le nuage de mots n'est pas noté.
  function afficherCorrige(cours, m) {
    const q = trouverQuestion(cours, m.qid);
    if (!q || qcu(q)) return;
    clearInterval(renvoi); clearInterval(chrono); chrono = null;
    phase = 'correction';
    seriesVisibles = m.series;
    const h0 = historique();
    const brute = question && question.qid === q.id && question.choix != null ? question.choix : (h0.reps[q.id] ? h0.reps[q.id].r : null);
    const reponse = brute == null ? null : Q.activites.valider(q, brute), ms = question && question.qid === q.id && question.ms != null ? question.ms : (h0.reps[q.id] ? h0.reps[q.id].ms : 0);
    question = { qid: q.id, q, choix: reponse, recu: true, ferme: true };
    const s = el('section', { class: 'd-question d-activite d-' + q.type },
      el('header', { class: 'q-tete' }, el('p', { class: 'q-num' }, (q.type !== 'nuage' ? 'Question ' + q.numero + ' sur ' + cours.total + ' · ' : '') + Q.activites.NOMS[q.type] + ' · correction'),
        (() => { const t = el('h2', { class: 'q-nom' }); t.appendChild(Q.fragmentCours(Q.texte(q.nom))); return t; })()));
    if (q.type === 'nuage') {
      s.appendChild(reponse ? el('div', { class: 'verdict neutre', role: 'status' }, el('span', { class: 'symbole', 'aria-hidden': 'true' }, '•'),
        el('div', {}, el('p', { class: 'v-titre' }, 'Ton mot : ', el('strong', {}, reponse)), el('p', {}, 'Regarde le nuage de la classe à l\'écran. Non noté.')))
        : el('p', { class: 'v-titre' }, 'Regarde le nuage de la classe à l\'écran.'));
      s.appendChild(Q.fragmentCours(Q.rendreCorrectionActivite(q, null)));
      ecran(s); Q.annoncer('Le nuage de mots est à l\'écran.');
      return;
    }
    let r = null, gain = 0, detail = null;
    if (!h0.res[q.id]) {
      const pr = m.precedente && h0.res[m.precedente] && h0.res[m.precedente].c !== null ? (h0.res[m.precedente].juste ? 'juste' : 'faux') : null;
      const n = reponse == null ? null : Q.activites.noter(q, reponse);
      const p = Q.bareme.points(n ? { juste: n.juste, ms, part: n.part } : null, { duree: m.duree, precedente: pr }, Q.bareme.BAREME);
      r = { c: n ? 0 : null, juste: !!(n && n.juste), gain: p.total, rebond: p.detail.rebond > 0, p: m.precedente };
      h0.ordre.push(q.id); h0.res[q.id] = r; h0.total += p.total; ecrireHistorique(h0);
      gain = p.total; detail = n ? p.detail : null;
    } else r = h0.res[q.id];
    total = h0.total; majPoints();
    if (reponse == null) s.appendChild(el('div', { class: 'verdict neutre', role: 'status' }, el('span', { class: 'symbole', 'aria-hidden': 'true' }, '•'), el('div', {}, el('p', { class: 'v-titre' }, 'Pas de réponse cette fois. Voici la correction.'))));
    s.appendChild(Q.fragmentCours(Q.rendreCorrectionActivite(q, reponse)));
    if (detail && gain > 0) {
      const parts = [];
      if (detail.juste) parts.push(detail.juste + (r.juste ? ' tout juste' : ' en partie juste')); if (detail.participation) parts.push(detail.participation + ' participation');
      if (detail.rapidite) parts.push(detail.rapidite + ' rapidité'); if (detail.rebond) parts.push(detail.rebond + ' rebond');
      s.appendChild(el('p', { class: 'gains' }, '+' + gain + ' points ', el('small', {}, '(' + parts.join(', ') + ')')));
      if (detail.rebond) s.appendChild(el('p', { class: 'rebonds' }, 'Beau rebond : tu t\'es repris·e juste après une erreur.'));
    }
    const b = bilanDe(h0);
    s.appendChild(el('div', { class: 'cadre' }, blocSerie(b), el('p', {}, el('strong', {}, pluriel(b.justes, 'juste')), ' sur ' + pluriel(b.repondues, 'réponse')
      + (b.rebonds ? ' · rebonds : ' + b.rebonds : '')), suite(b.suite)));
    if (m.podium && m.podium.some(p => p.pseudo === moi.pseudo)) s.appendChild(el('p', { class: 'rebonds' }, 'Tu es sur le podium en ce moment.'));
    ecran(s);
    $('ecran').focus({ preventScroll: true }); window.scrollTo(0, 0);
    Q.annoncer(reponse == null ? 'Correction : pas de réponse.' : r.juste ? 'Tout est juste.' : 'Pas tout à fait. Lis la correction.');
  }

  /* ── Le nuage de mots, au téléphone ─────────
     Proposer autant de mots qu'on veut (un toutes les 3 secondes au plus), puis, une fois le nuage montré au
     tableau, voter pour les mots des camarades (une voix par mot ; pas pour ses propres mots). Les mots reçus sont
     ceux du tableau, sans auteur·rice ; ils passent le filtre (js/messages.js) et s'affichent par textContent.
     Rien n'est gardé sur le téléphone : ni ses mots, ni ses voix. */
  let nuage = null;
  const ATTENTE_MOT = 3000;
  function envoyerNuage(r, quoi) {
    const n = Q.nouvelId(), clair = { id: moi.id, qid: nuage.qid, r, n, k: 0 }, ici = nuage;
    let essais = 0;
    const envoi = async () => {
      if (nuage !== ici || !ici.envois.has(n)) { clearInterval(t); return; }
      if (++essais > 8) { clearInterval(t); ici.envois.delete(n); ici.erreur = 'Un envoi n\'est pas arrivé à la page projetée : vérifie le réseau, puis réessaie.'; majNuageTel(); return; }
      if (!chiffreur || !clesHote.length) return;
      for (const k of clesHote) { try { const env = await chiffreur.chiffrer(clair, k); if (seance) seance.envoyer(Object.assign({ t: 'rep' }, env)); } catch (e) { /* clé illisible */ } }
    };
    ici.envois.set(n, { fait: quoi });
    const t = setInterval(envoi, 2200); envoi();
  }
  function afficherNuage(cours, q, mots) {
    if (!q || q.type !== 'nuage') return;
    clearInterval(renvoi); clearInterval(chrono); chrono = null;
    if (!nuage || nuage.qid !== q.id || phase !== 'nuage') {
      phase = 'nuage'; question = null;
      nuage = { qid: q.id, q, mots: null, miens: new Map(), votes: new Set(), envois: new Map(), pret: 0, erreur: '' };
      const s = el('section', { class: 'd-question d-activite d-nuage' });
      s.appendChild(Q.fragmentCours(Q.rendreEnonceActivite(q, cours.total)));
      const champ = el('input', { type: 'text', id: 'motNuage', maxlength: String(Q.activites.MOT_MAX + 6), autocomplete: 'off', spellcheck: 'false', autocapitalize: 'none', 'aria-describedby': 'motAide motErreur' });
      const f = el('form', { class: 'nuage-form', novalidate: '' }, el('label', { for: 'motNuage' }, 'Un mot (ou deux)'), champ,
        el('p', { class: 'aide', id: 'motAide' }, 'Autant de mots que tu veux, un à la fois. Ils s\'affichent au tableau et sur les téléphones de la classe, sans ton pseudo.'),
        el('p', { class: 'erreur-champ', id: 'motErreur', role: 'alert' }), el('button', { type: 'submit', class: 'bouton fort', id: 'motEnvoyer' }, 'Envoyer'));
      f.addEventListener('submit', ev => {
        ev.preventDefault();
        const r = Q.activites.filtrerMot(champ.value);
        nuage.erreur = r.ok ? '' : r.raison;
        if (r.ok && Date.now() < nuage.pret) nuage.erreur = 'Attends un peu avant le mot suivant.';
        if (nuage.erreur) { majNuageTel(); champ.focus(); return; }
        const cle = Q.clePseudo(r.mot);
        nuage.miens.set(cle, { m: r.mot, recu: false });
        nuage.pret = Date.now() + ATTENTE_MOT;
        envoyerNuage(r.mot, () => { const x = nuage.miens.get(cle); if (x) x.recu = true; });
        champ.value = ''; champ.focus();
        Q.annoncer('Mot envoyé.');
        majNuageTel();
        setTimeout(majNuageTel, ATTENTE_MOT + 50);
      });
      s.append(f, el('div', { id: 'nuageMiens', class: 'nuage-miens', 'aria-live': 'polite' }), el('div', { id: 'nuageClasse' }));
      ecran(s);
    }
    if (mots) nuage.mots = mots;
    majNuageTel();
  }
  function majNuageTel() {
    if (!nuage || phase !== 'nuage' || !$('nuageClasse')) return;
    $('motErreur').textContent = nuage.erreur;
    const attente = nuage.pret - Date.now();
    $('motEnvoyer').disabled = attente > 0;
    $('motEnvoyer').textContent = attente > 0 ? 'Mot suivant dans un instant…' : 'Envoyer';
    const miens = [...nuage.miens.values()];
    $('nuageMiens').replaceChildren(...(miens.length ? [el('p', {}, 'Tes mots : ', ...miens.flatMap((w, i) => [i ? ', ' : '', el('strong', {}, w.m), w.recu ? '' : ' (envoi…)']))] : []));
    if (!nuage.mots) { $('nuageClasse').replaceChildren(el('p', { class: 'aide' }, 'Le nuage de la classe s\'affichera ici quand l\'enseignant·e le montrera au tableau ; tu pourras alors voter pour les mots de tes camarades.')); return; }
    const max = nuage.mots.reduce((a, w) => Math.max(a, w.n), 1);
    const ul = el('ul', { class: 'nuage nuage-tel', 'aria-label': 'Le nuage de la classe : vote pour les mots de tes camarades' }, nuage.mots.map(w => {
      const mien = nuage.miens.has(Q.clePseudo(w.m)), vote = nuage.votes.has(w.k);
      const b = el('button', { type: 'button', class: 'bouton petit', 'aria-pressed': String(vote), 'aria-label': (mien ? 'Ton mot ' : vote ? 'Tu as voté pour ' : 'Voter pour ') + w.m + ' (' + w.n + ' voix)' }, mien ? 'à toi' : vote ? '✓ voté' : '+1');
      if (mien || vote) b.disabled = true;
      b.addEventListener('click', () => { nuage.votes.add(w.k); envoyerNuage({ vote: w.k }, () => {}); Q.annoncer('Voix envoyée pour ' + w.m + '.'); majNuageTel(); });
      return el('li', {}, el('span', { class: 'mot t' + Math.max(1, Math.round(w.n / max * 5)) }, w.m), el('small', { class: 'voix' }, String(w.n)), b);
    }));
    $('nuageClasse').replaceChildren(el('h3', {}, 'Le nuage de la classe'), nuage.mots.length ? ul : el('p', { class: 'aide' }, 'Aucun mot pour l\'instant.'));
  }

  function afficherFin(cours, m) {
    phase = 'fin'; question = null; clearInterval(renvoi); clearInterval(chrono); chrono = null;
    const h = historique(), s = el('section', { class: 'attente' }, el('p', { class: 'grand' }, 'Fin de la séance'));
    if (h.ordre.length) {
      total = h.total; majPoints();
      const b = bilanDe(h);
      s.append(el('p', { class: 'gains' }, total + ' points'),
        el('p', {}, el('strong', {}, b.justes + ' sur ' + cours.interactifs.filter(q => q.type !== 'nuage').length), ' bonnes réponses' + (seriesVisibles ? ' · meilleure série : ' + b.meilleure : '') + ' · rebonds : ' + b.rebonds));
      const sv = suite(b.suite); if (sv) s.appendChild(sv);
      // la place n'est connue que sur le podium affiché à toute la classe ; aucune autre place n'est envoyée
      const pl = m.podium ? m.podium.find(p => p.pseudo === moi.pseudo) : null;
      if (pl) s.appendChild(el('p', { class: 'rebonds' }, 'Bravo, tu es sur le podium : ' + pl.place + (pl.place === 1 ? 're' : 'e') + ' place.'));
      const arevoir = h.ordre.filter(q => !h.res[q].juste).map(q => (cours.questions.find(x => x.id === q) || {}).numero).filter(Number.isInteger);
      const autres = h.ordre.filter(q => !h.res[q].juste).map(q => cours.interactifs.find(x => x.id === q)).filter(q => q && !qcu(q));
      if (autres.length) s.appendChild(el('p', {}, 'À revoir aussi : ' + autres.map(q => Q.activites.brut(q.nom)).join(' ; ') + '.'));
      s.appendChild(arevoir.length ? el('p', {}, 'À revoir : question' + (arevoir.length > 1 ? 's' : '') + ' ' + arevoir.join(', ') + '.') : el('p', {}, 'Tout juste : tu peux aider un·e camarade.'));
    } else s.appendChild(el('p', {}, 'Merci d\'avoir suivi le cours.'));
    // rejouer le quiz seul·e, sans l'enseignant·e : questions et réponses mélangées, rien n'est envoyé
    s.appendChild(el('p', { class: 'fin-liens' }, el('a', { class: 'bouton fort', href: 'revision.html?cours=' + encodeURIComponent(cours.id) + '&rejouer' }, 'Rejouer le quiz seul·e'),
      ' ', el('a', { class: 'bouton', href: 'revision.html?cours=' + encodeURIComponent(cours.id) }, 'Revoir le cours')));
    s.appendChild(el('p', { class: 'aide' }, 'Rejouer : les questions dans un nouvel ordre, les réponses mélangées, corrigées tout de suite. Rien n\'est envoyé.'));
    ecran(s);
    // la séance est finie : le code, le pseudo, l'identifiant et l'historique gardés sur l'appareil sont effacés
    Q.stock.oublier('eleve'); Q.stock.oublier('hist:' + moi.id);
  }

  /* ── Démarrage ──────────────────────────── */
  function demarrer() {
    Q.theme();
    const p = new URLSearchParams(location.search), code = Q.lireCode(p.get('s'));
    const ancien = lireAncien();
    if (code) $('champCode').value = code;
    else if (ancien) $('champCode').value = ancien.code;
    if (ancien) $('champPseudo').value = ancien.pseudo;
    $('entree').addEventListener('submit', rejoindre);
    $('quitter').addEventListener('click', () => { Q.stock.oublier('eleve'); Q.session.oublier('eleve'); if (moi) Q.stock.oublier('hist:' + moi.id); afficherEntree(''); $('champPseudo').value = ''; });
    // la page rechargée dans le même onglet revient directement dans la séance
    const onglet = lireOnglet();
    if (onglet && (!code || code === onglet.code)) { moi = onglet; entrer(); }
  }
  demarrer();
})();
