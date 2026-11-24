/* QuizzNSI : la page projetée par l'enseignant·e (MIT, Babash - NSI Tani Malandi).
   Elle tient la séance : elle diffuse les diapositives et les questions, reçoit les réponses,
   calcule les points (js/bareme.js) et renvoie la correction. Rien n'est enregistré en ligne ;
   l'état de la séance reste dans cet onglet (sessionStorage), pour survivre à un rechargement.
   Sécurité : tout ce qui vient du canal (présence, réponses) est validé par js/messages.js ; les
   pseudos ne s'affichent que par textContent ; l'état relu dans le stockage est contrôlé. */
(function () {
  'use strict';
  const Q = window.QuizzNSI, $ = Q.$, B = Q.bareme, el = Q.el, MN = Q.bareme.minuterie;
  let cours, seance = null, st, presents = new Map(), renvoi = null;
  const cle = () => 'animer:' + cours.id;
  const sauver = () => Q.session.ecrire(cle(), st);
  const diapo = () => cours.diapositives[st.index];
  const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');
  const envoyer = m => { if (seance) seance.envoyer(m); };
  // les diapositives où les élèves répondent : les questions à choix, et les autres types (js/activites.js)
  const inter = d => !!d && Q.INTERACTIFS.includes(d.type);
  const qcu = d => !!d && d.type === 'question';

  function etatNeuf(code) {
    return { code: code || Q.nouveauCode(), id: Q.nouvelId(), commence: false, index: 0, f: 0, duree: 45, podium: 'fin', series: true,
      joueurs: {}, bannis: [], q: {}, ordre: [], fini: false };
  }

  // L'état relu dans le stockage de l'onglet a pu être modifié : on ne garde que ce qui est conforme.
  const DUREES = [0, 20, 30, 45, 60, 90], PODIUMS = ['fin', 'chaque', 'jamais'];
  function etatRelu(v) {
    const ent = (x, a, b) => Number.isSafeInteger(x) && x >= a && x <= b;
    if (!v || typeof v !== 'object' || Q.lireCode(v.code) !== v.code || !Q.messages.estId(v.id)) return null;
    if (!ent(v.index, 0, cours.diapositives.length - 1) || !DUREES.includes(v.duree) || !PODIUMS.includes(v.podium)) return null;
    const qids = new Set(cours.interactifs.map(q => q.id)), parId = new Map(cours.interactifs.map(q => [q.id, q]));
    const st = etatNeuf(v.code);
    Object.assign(st, { id: v.id, commence: v.commence === true, fini: v.fini === true, index: v.index, f: ent(v.f, 0, 100) ? v.f : 0, duree: v.duree, podium: v.podium, series: v.series !== false });
    st.bannis = Array.isArray(v.bannis) ? v.bannis.filter(c => typeof c === 'string' && /^[a-z0-9]{0,64}$/.test(c)) : [];
    st.ordre = Array.isArray(v.ordre) ? v.ordre.filter(q => qids.has(q)) : [];
    if (v.q && typeof v.q === 'object') for (const [qid, e] of Object.entries(v.q)) {
      if (!qids.has(qid) || !e || typeof e !== 'object' || !ent(e.ouverte, 0, 1e14)) continue;
      // la minuterie de la question : durée de départ, ajouts de 15 s, pauses (un état d'avant T131 n'a que « fin »)
      const ancienne = ent(e.fin, 0, 1e14) ? Math.round((e.fin - e.ouverte) / 1000) : 0;
      const duree = DUREES.includes(e.duree) ? e.duree : DUREES.includes(ancienne) ? ancienne : e.fin === null ? 0 : v.duree;
      const pauseDepuis = ent(e.pauseDepuis, e.ouverte, 1e14) && duree > 0 && e.ferme !== true ? e.pauseDepuis : null;
      st.q[qid] = { ouverte: e.ouverte, duree, ajouts: ent(e.ajouts, 0, MN.MAX_AJOUTS) && duree > 0 ? e.ajouts : 0, pauseMs: ent(e.pauseMs, 0, 1e10) ? e.pauseMs : 0, pauseDepuis,
        parTemps: e.parTemps === true && e.ferme === true, ferme: e.ferme === true, revelee: e.revelee === true, raison: typeof e.raison === 'string' ? e.raison.slice(0, 40) : '',
        rebonds: Array.isArray(e.rebonds) ? e.rebonds.filter(p => Q.filtrerPseudo(p).ok) : [],
        seuil: e.seuil === 2 ? 2 : 1, nuage: parId.get(qid).type === 'nuage' ? nuageRelu(e.nuage) : undefined };
    }
    if (v.joueurs && typeof v.joueurs === 'object') for (const [id, j] of Object.entries(v.joueurs)) {
      if (!Q.messages.estId(id) || !j || typeof j !== 'object' || !Q.filtrerPseudo(j.pseudo).ok || !ent(j.total, 0, 1e7)) continue;
      const rep = {};
      if (j.rep && typeof j.rep === 'object') for (const [qid, r] of Object.entries(j.rep)) {
        if (!qids.has(qid) || !r || !ent(r.ms, -1e7, 1e9)) continue;
        const dq = parId.get(qid);
        if (dq.type === 'question') { if (!ent(r.c, 0, 3)) continue; rep[qid] = { c: r.c, ms: r.ms }; }
        else { const a = Q.activites.valider(dq, r.a); if (a === null) continue; rep[qid] = { a, ms: r.ms }; }
        if (typeof r.juste === 'boolean' && ent(r.gain, 0, 1000) && r.detail && typeof r.detail === 'object') {
          const d = {}; let ok = true;
          for (const k of ['participation', 'juste', 'rapidite', 'rebond']) { if (!ent(r.detail[k], 0, 1000)) ok = false; d[k] = r.detail[k]; }
          if (ok) Object.assign(rep[qid], { juste: r.juste, gain: r.gain, detail: d });
        }
      }
      st.joueurs[id] = { pseudo: j.pseudo, cle: Q.clePseudo(j.pseudo), rep, total: j.total, retire: j.retire === true };
    }
    return st;
  }

  // Le nuage relu : chaque mot repasse le filtre, les identifiants sont contrôlés, les empreintes sont des nombres.
  function nuageRelu(v) {
    const n = Q.activites.nuageVide(), ent = (x, a, b) => Number.isSafeInteger(x) && x >= a && x <= b, ids = l => Array.isArray(l) ? [...new Set(l.filter(Q.messages.estId))].slice(0, 100000) : [];
    if (!v || typeof v !== 'object') return n;
    if (Array.isArray(v.supprimes)) n.supprimes = v.supprimes.filter(x => ent(x, 0, 2 ** 32 - 1)).slice(0, 5000);
    if (Array.isArray(v.mots)) for (const w of v.mots.slice(0, 20000)) {
      const f = w && Q.activites.filtrerMot(w.m);
      if (!f || !f.ok || f.mot !== w.m || !ent(w.k, 0, 99999) || n.mots.some(x => x.k === w.k || x.cle === Q.clePseudo(w.m))) continue;
      n.mots.push({ k: w.k, m: w.m, cle: Q.clePseudo(w.m), de: ids(w.de), votes: ids(w.votes) });
    }
    n.suivant = Math.max(ent(v.suivant, 0, 99999) ? v.suivant : 0, ...n.mots.map(w => w.k + 1));
    return n;
  }

  /* ── Les élèves ─────────────────────────── */
  const joueursActifs = () => Object.entries(st.joueurs).filter(([, j]) => !j.retire).map(([id, j]) => Object.assign({ id }, j));
  const presentsActifs = () => [...presents.values()].filter(p => p.role === 'eleve' && st.joueurs[p.id] && !st.joueurs[p.id].retire);

  function onPresence(liste) {
    presents = new Map();
    let neuf = false;
    const toutes = (Array.isArray(liste) ? liste : []).map(Q.messages.presence).filter(Boolean);
    // une seule page projetée par séance : on prévient si une autre est dans la présence
    const autres = toutes.filter(p => p.role === 'hote' && !(p.id === st.id && p.cle && cleHote && p.cle.x === cleHote.publique.x));
    $('autreHote').hidden = !autres.length;
    $('autreHote').textContent = autres.length ? 'Attention : une autre page projetée est ouverte sur cette séance (onglet dupliqué, autre ordinateur ?). Ferme-la : les réponses des élèves risquent de n\'arriver qu\'à l\'une des deux.' : '';
    const valides = toutes.filter(p => p.role === 'eleve');
    for (const p of valides) {
      if (!p.pseudo) { envoyer({ t: 'refus', id: p.id, raison: 'invalide' }); continue; }
      const f = { pseudo: p.pseudo };
      const c = Q.clePseudo(f.pseudo);
      const j = st.joueurs[p.id];
      if (st.bannis.includes(c)) { if (!j || !j.retire || j.cle !== c) envoyer({ t: 'retire', id: p.id }); if (j) j.retire = true; continue; }
      const pris = Object.entries(st.joueurs).some(([id, k]) => id !== p.id && !k.retire && k.cle === c && (presents.has(id) || valides.some(x => x.id === id)));
      if (pris && (!j || j.cle !== c)) { envoyer({ t: 'refus', id: p.id, raison: 'pris' }); continue; }
      if (!j) { st.joueurs[p.id] = { pseudo: f.pseudo, cle: c, rep: {}, total: 0 }; neuf = true; }
      else { if (j.retire && j.cle !== c) { j.retire = false; neuf = true; } j.pseudo = f.pseudo; j.cle = c; }
      presents.set(p.id, p);
    }
    sauver();
    majEleves();
    if (neuf) planifierRenvoi();
  }

  function majEleves() {
    const l = joueursActifs().sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'));
    const enLigne = l.filter(j => presents.has(j.id));
    const txt = pluriel(enLigne.length, 'élève');
    $('nbEleves').textContent = enLigne.length; $('nbEleves2').textContent = enLigne.length; $('nbBarre').textContent = txt;
    if (!st.fini) $('qrNb').textContent = 'Dans la séance : ' + txt + '.';
    const items = () => l.map(j => el('li', { class: presents.has(j.id) ? '' : 'absent' },
      el('span', {}, j.pseudo, st.commence ? flammeDe(st.joueurs[j.id]) : null, presents.has(j.id) ? null : el('small', {}, ' (déconnecté·e)')),
      el('button', { type: 'button', class: 'retirer', 'data-retirer': j.id, 'aria-label': 'Retirer le pseudo ' + j.pseudo }, 'Retirer')));
    $('eleves').replaceChildren(...(l.length ? items() : [el('li', { class: 'vide' }, 'Personne pour l\'instant.')]));
    $('eleves2').replaceChildren(...items());
    majStatut();
  }

  function retirer(id) {
    const j = st.joueurs[id];
    if (!j) return;
    j.retire = true;
    if (!st.bannis.includes(j.cle)) st.bannis.push(j.cle);
    envoyer({ t: 'retire', id });
    sauver(); majEleves();
    Q.annoncer('Pseudo ' + j.pseudo + ' retiré.');
  }

  /* ── Les messages des élèves ─────────────── */
  let accuses = new Set(), accuseMinuterie = null;
  let cleHote = null; // la paire de clés de la page projetée (js/chiffre.js)
  async function onMessage(brut) {
    const env = Q.messages.versHote(brut);
    if (!env) return; // message non conforme : ignoré
    if (env.t === 'bonjour') { planifierRenvoi(); return; }
    if (env.t === 'rep') {
      if (!st.commence || !cleHote) return;
      const recu = Date.now();
      const m = Q.messages.reponse(await cleHote.dechiffrer(env)); // illisible ou forgée : ignorée
      if (!m) return;
      const d = diapo(), etat = inter(d) ? st.q[d.id] : null;
      if (!etat || m.qid !== d.id) return;
      const j = st.joueurs[m.id];
      if (!j || j.retire) return;
      if (d.type === 'nuage') { recevoirNuage(d, etat, m, recu); return; }
      if (etat.ferme) return;
      if (!j.rep[d.id]) {
        // le temps de réponse : écoulé hors pause (une réponse pendant la pause compte le temps du début de la pause)
        if (qcu(d)) { if (m.c === undefined) return; j.rep[d.id] = { c: m.c, ms: MN.ecoule(etat, recu) }; }
        else {
          // une réponse d'un autre type est contrôlée contre la diapositive du cours (longueur, indices, mot filtré)
          const a = m.r === undefined ? null : Q.activites.valider(d, m.r);
          if (a === null) return;
          j.rep[d.id] = { a, ms: MN.ecoule(etat, recu) };
        }
        sauver(); majStatut(); if (d.type === 'nuage') majNuage(d);
      }
      // l'accusé de réception ne porte qu'un nombre tiré au hasard par le téléphone, pas son identifiant
      accuses.add(m.n);
      if (!accuseMinuterie) accuseMinuterie = setTimeout(() => { envoyer({ t: 'recus', qid: d.id, n: [...accuses] }); accuses = new Set(); accuseMinuterie = null; }, 400);
      const repondu = presentsActifs().filter(p => st.joueurs[p.id].rep[d.id]).length;
      if (repondu > 0 && repondu === presentsActifs().length && !etat.ferme) fermer(d, 'Tout le monde a répondu.');
    }
  }

  /* Le nuage : autant de mots que voulu, et des voix. Frein contre l'inondation : un mot accepté toutes les
     2 secondes au plus par élève (un mot arrivé trop tôt n'a pas d'accusé de réception : le téléphone le renvoie),
     et 100 mots au plus par élève et par nuage. Un même envoi (même nombre tiré au hasard) n'est compté qu'une fois. */
  const dernierMot = new Map(), envoisVus = new Set();
  function accuser(qid, n) {
    accuses.add(n);
    if (!accuseMinuterie) accuseMinuterie = setTimeout(() => { envoyer({ t: 'recus', qid, n: [...accuses] }); accuses = new Set(); accuseMinuterie = null; }, 400);
  }
  function recevoirNuage(d, etat, m, recu) {
    if (envoisVus.has(m.n)) { accuser(d.id, m.n); return; }
    const a = m.r === undefined ? null : Q.activites.valider(d, m.r);
    if (a !== null && typeof a === 'object') {
      if (!etat.revelee) return; // on ne vote que pour un mot affiché
      Q.activites.voter(etat.nuage, m.id, a.vote);
    } else if (typeof a === 'string') {
      if (recu - (dernierMot.get(m.id) || 0) < 2000) return; // trop tôt : pas d'accusé, le téléphone renverra
      dernierMot.set(m.id, recu);
      Q.activites.proposer(etat.nuage, m.id, a);
    }
    // un mot refusé (filtre, mot supprimé, 100 mots déjà) reçoit aussi l'accusé : il ne sert à rien de le renvoyer
    if (envoisVus.size > 100000) envoisVus.clear();
    envoisVus.add(m.n); accuser(d.id, m.n);
    sauver(); majStatut(); majNuage(d); if ($('motsBoite').open) remplirMots(d);
    if (etat.revelee) planifierNuage(d);
  }
  let nuageMinuterie = null;
  function planifierNuage(d) { if (!nuageMinuterie) nuageMinuterie = setTimeout(() => { nuageMinuterie = null; const x = diapo(); if (x === d && st.q[d.id].revelee) envoyer(messageNuage(d)); }, 400); }
  // Ce que reçoivent les téléphones : seulement les mots affichés au tableau, leur numéro et leur nombre de voix.
  const messageNuage = d => ({ t: 'nuage', cours: cours.id, qid: d.id, mots: Q.activites.affiches(st.q[d.id].nuage, st.q[d.id].seuil) });

  // Un message renvoyé quand un·e élève arrive ou revient : il lui donne la phase en cours.
  function planifierRenvoi() {
    clearTimeout(renvoi);
    renvoi = setTimeout(() => { const m = messagePhase(); if (m) envoyer(m); }, 300);
  }

  // Les messages ne portent que des identifiants et des nombres : le texte est dans le fichier du cours.
  function messageQuestion(d) {
    const e = st.q[d.id];
    const t = Date.now(), duree = e ? MN.accordee(e) : 0, ferme = !!(e && e.ferme);
    return { t: 'question', cours: cours.id, qid: d.id, reste: duree ? Math.min(duree * 1000, Math.round(MN.reste(e, t))) : null, duree, ferme, pause: !!(e && duree && !ferme && MN.enPause(e)) };
  }
  // La correction ne diffuse que ce que l'écran projeté montre à toute la classe : la bonne réponse,
  // la répartition en nombres, le podium s'il est affiché. Chaque téléphone calcule ses points avec le
  // barème et la question corrigée juste avant (pour le rebond).
  const podiumPublic = () => podium().filter(j => j.place <= 3).slice(0, 20).map(j => ({ pseudo: j.pseudo, total: j.total, place: j.place }));
  function messageCorrection(d) {
    const k = st.ordre.indexOf(d.id);
    if (!qcu(d)) {
      // un autre type : seulement le nombre de réponses et de réponses tout à fait justes ; chaque téléphone compare
      // sa réponse à la solution du fichier du cours. Les mots du nuage ne sont jamais envoyés aux téléphones.
      const l = joueursActifs().filter(j => j.rep[d.id]);
      return { t: 'corrige', cours: cours.id, qid: d.id, precedente: k > 0 ? st.ordre[k - 1] : null, duree: MN.accordee(st.q[d.id]), nb: l.length,
        justes: l.filter(j => j.rep[d.id].juste === true).length, podium: st.podium === 'chaque' ? podiumPublic() : null, series: st.series };
    }
    return { t: 'correction', cours: cours.id, qid: d.id, precedente: k > 0 ? st.ordre[k - 1] : null, bonne: d.bonne, rep: repartition(d),
      bareme: Object.assign({}, B.BAREME), duree: MN.accordee(st.q[d.id]), podium: st.podium === 'chaque' ? podiumPublic() : null, series: st.series };
  }
  function messagePhase() {
    const d = diapo();
    if (st.fini) return messageFin();
    if (!st.commence) return { t: 'attente' };
    if (inter(d)) { const e = st.q[d.id]; return e && e.revelee ? (d.type === 'nuage' ? messageNuage(d) : messageCorrection(d)) : messageQuestion(d); }
    // toute autre diapositive (titre, partie, question à la classe, humour, notion, bilan) : le téléphone
    // l'affiche à partir du fichier du cours, avec le même nombre d'éléments déjà apparus
    return { t: 'notion', cours: cours.id, n: st.index, f: st.f };
  }

  /* ── Le score ───────────────────────────── */
  function bilanJoueur(j) {
    const resultats = st.ordre.map(qid => { const r = j.rep[qid]; return r ? (r.juste ? 'juste' : 'faux') : null; });
    const p = B.progression(resultats);
    return { justes: p.justes, repondues: p.repondues, serie: p.serie, meilleure: p.meilleure, rebonds: p.rebonds, suite: resultats };
  }
  // la série en cours d'un·e élève (les flammes) : bonnes réponses d'affilée dans cette séance
  const serieDe = j => B.serie(bilanJoueur(j).suite);
  // la flamme et « 3 d'affilée », à côté d'un pseudo, à partir de 2 d'affilée (si le réglage le permet)
  const flammeDe = j => { if (!st.series || !j) return null; const s = serieDe(j); return s.n >= 2 ? Q.flamme(s.n, false) : null; };
  const repartition = d => B.repartition(joueursActifs().map(j => j.rep[d.id] ? j.rep[d.id].c : null));
  const podium = () => B.classer(joueursActifs().map(j => ({ id: j.id, pseudo: j.pseudo, total: j.total, justes: bilanJoueur(j).justes })));

  function corriger(d) {
    const e = st.q[d.id];
    // le nuage n'est pas noté et reste ouvert : « Montrer le nuage » l'affiche au tableau et sur les téléphones
    if (d.type === 'nuage') { if (!e.revelee) { e.revelee = true; sauver(); envoyer(messageNuage(d)); } return; }
    if (!e.ferme) fermer(d, '');
    if (e.revelee) return;
    const precedente = st.ordre.length ? st.ordre[st.ordre.length - 1] : null;
    e.rebonds = [];
    for (const [, j] of Object.entries(st.joueurs)) {
      const r = j.rep[d.id];
      if (!r) continue;
      const pr = precedente && j.rep[precedente] ? (j.rep[precedente].juste ? 'juste' : 'faux') : null;
      let part;
      if (qcu(d)) r.juste = r.c === d.bonne;
      else { const n = Q.activites.noter(d, r.a); r.juste = n.juste; part = n.part; }
      // la rapidité : le temps écoulé hors pause, rapporté à la durée accordée (départ + ajouts)
      const p = B.points({ juste: r.juste, ms: r.ms, part }, { duree: MN.accordee(e), precedente: pr });
      r.gain = p.total; r.detail = p.detail; j.total += p.total;
      if (p.detail.rebond && !j.retire) e.rebonds.push(j.pseudo);
    }
    e.revelee = true;
    st.ordre.push(d.id);
    sauver();
    envoyer(messageCorrection(d));
    majEleves();
  }

  /* ── Ouvrir, fermer, corriger une question ── */
  function ouvrir(d) {
    if (st.q[d.id]) return;
    // la durée choisie au moment où la question s'ouvre (le nuage de mots n'a pas de minuterie)
    const duree = d.type === 'nuage' ? 0 : st.duree;
    st.q[d.id] = { ouverte: Date.now(), duree, ajouts: 0, pauseMs: 0, pauseDepuis: null, parTemps: false, ferme: false, revelee: false, seuil: 1, nuage: d.type === 'nuage' ? Q.activites.nuageVide() : undefined };
    sauver();
  }
  function fermer(d, raison, parTemps) {
    const e = st.q[d.id];
    if (!e || e.ferme) return;
    MN.reprendre(e, Date.now()); // une pause en cours s'arrête avec la question
    e.ferme = true; e.parTemps = !!parTemps; e.raison = raison || 'Réponses fermées.'; sauver();
    envoyer({ t: 'fermee', qid: d.id });
    majStatut(); majAction(); majMinuterie();
  }

  /* ── La minuterie : + 15 s, pause, reprise ──
     Pour toute la classe : la page projetée change l'état de la question et renvoie le message « question » (temps
     restant hors pause, durée accordée, pause), que chaque téléphone suit. Le barème compte le temps écoulé hors pause,
     rapporté à la durée accordée (js/bareme.js). */
  const minuterieQ = () => { const d = st && st.commence ? diapo() : null; return inter(d) && d.type !== 'nuage' && st.q[d.id] && !st.q[d.id].revelee ? d : null; };
  // + 15 s : possible tant que la question n'est pas corrigée, même après le zéro (elle rouvre avec 15 s), mais pas
  // quand tout le monde a déjà répondu (il n'y a plus personne à attendre)
  const peutAjouter = d => { const e = d && st.q[d.id]; return !!e && e.duree > 0 && e.ajouts < MN.MAX_AJOUTS && (!e.ferme || e.parTemps); };
  function plus15() {
    const d = minuterieQ(); if (!peutAjouter(d)) return;
    const e = st.q[d.id], t = Date.now();
    if (e.ferme) { e.ferme = false; e.parTemps = false; e.raison = ''; }
    MN.ajouter(e, t);
    sauver(); envoyer(messageQuestion(d)); majStatut(); majMinuterie(); majAction();
    Q.annoncer('15 secondes de plus : il reste ' + Math.ceil(MN.reste(e, t) / 1000) + ' s.');
  }
  function basculerPause() {
    const d = minuterieQ(); if (!d) return;
    const e = st.q[d.id], t = Date.now();
    if (e.ferme || !(e.duree > 0)) return;
    const ok = MN.enPause(e) ? MN.reprendre(e, t) : MN.pause(e, t);
    if (!ok) return;
    sauver(); envoyer(messageQuestion(d)); majStatut(); majMinuterie();
    Q.annoncer(MN.enPause(e) ? 'Minuterie en pause. Les élèves peuvent lire et répondre.' : 'Minuterie relancée.');
  }
  function majMinuterie() {
    const d = minuterieQ(), e = d ? st.q[d.id] : null, avec = !!e && e.duree > 0;
    $('plus15').disabled = !peutAjouter(d);
    const p = $('pause'), enP = avec && MN.enPause(e);
    p.disabled = !avec || e.ferme || (!enP && MN.reste(e, Date.now()) <= 0);
    p.setAttribute('aria-pressed', String(enP));
    p.textContent = enP ? '▶ Reprendre (S)' : '‖ Pause (S)';
    if ($('dureeSuite').value !== String(st.duree)) $('dureeSuite').value = String(st.duree);
  }

  /* ── L'affichage ────────────────────────── */
  function afficher() {
    const d = diapo();
    $('scene').innerHTML = Q.rendreDiapo(cours, d, { boutons: false });
    st.f = Math.min(st.f, Q.nbFragments($('scene'))); Q.montrerFragments($('scene'), st.f);
    $('compteur').textContent = (st.index + 1) + ' / ' + cours.diapositives.length + (qcu(d) ? ' · question ' + d.numero + ' sur ' + cours.total : inter(d) ? (d.type !== 'nuage' ? ' · question ' + d.numero + ' sur ' + cours.total : '') + ' · ' + Q.activites.NOMS[d.type].toLowerCase() : '');
    $('barre').style.width = ((st.index + 1) / cours.diapositives.length * 100) + '%';
    $('prec').disabled = st.index === 0;
    if (inter(d)) { ouvrir(d); if (st.q[d.id].revelee) montrerCorrection(d); else if (d.type === 'nuage') majNuage(d); }
    envoyer(messagePhase());
    majStatut(); majAction(); majMinuterie();
    $('scene').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function majStatut() {
    const d = cours && st && st.commence ? diapo() : null, z = $('statutQ');
    if (!inter(d) || !st.q[d.id]) { z.textContent = ''; return; }
    const e = st.q[d.id], n = joueursActifs().filter(j => j.rep[d.id]).length, total = presentsActifs().length;
    let t = 'Réponses : ' + n + ' / ' + total;
    if (d.type === 'nuage') {
      const nu = e.nuage, auteurs = new Set(nu.mots.flatMap(w => w.de)).size;
      z.textContent = pluriel(nu.mots.length, 'mot') + ' de ' + pluriel(auteurs, 'élève') + (e.revelee ? ' · nuage affiché' : '');
      return;
    }
    if (e.revelee) t = n + ' réponse' + (n > 1 ? 's' : '') + ' · correction affichée';
    else if (e.ferme) t += ' · ' + (e.raison || 'réponses fermées') + (e.parTemps ? ' (+ 15 s rouvre)' : '');
    else if (e.duree > 0) t = (MN.enPause(e) ? '‖ En pause · ' : '⏱ ') + Math.ceil(MN.reste(e, Date.now()) / 1000) + ' s · ' + t;
    z.textContent = t;
  }

  const fragmentsRestants = () => Q.nbFragments($('scene')) - st.f;
  function majAction() {
    const a = $('action'), d = diapo();
    if (d.type !== 'question' && fragmentsRestants() > 0) { a.textContent = 'Suite (' + fragmentsRestants() + ') →'; return; }
    if (st.index === cours.diapositives.length - 1) { a.textContent = st.fini ? 'Revoir le podium' : 'Terminer la séance'; return; }
    if (inter(d) && st.q[d.id] && !st.q[d.id].revelee) { a.textContent = d.type === 'nuage' ? 'Montrer le nuage' : 'Montrer la réponse'; return; }
    a.textContent = 'Suivante →';
  }

  function montrerCorrection(d) {
    if (!qcu(d)) { montrerCorrectionActivite(d); return; }
    const e = st.q[d.id], rep = repartition(d), total = rep.reduce((a, b) => a + b, 0);
    const sc = $('scene');
    sc.querySelectorAll('.option').forEach(o => {
      const i = +o.dataset.choix, pc = total ? Math.round(rep[i] / total * 100) : 0;
      if (i === d.bonne) { o.classList.add('bonne-rep'); o.appendChild(el('span', { class: 'etiquette' }, '✓ Bonne réponse')); }
      const barre = el('span', {}); barre.style.width = pc + '%';
      o.append(el('span', { class: 'rep-nb' }, rep[i] + ' réponse' + (rep[i] > 1 ? 's' : '') + ' ', el('small', {}, '(' + pc + ' %)')), el('span', { class: 'rep-barre', 'aria-hidden': 'true' }, barre));
    });
    sc.querySelector('.options').classList.add('corrigees', 'avec-barres');
    const justes = rep[d.bonne];
    let pire = -1;
    rep.forEach((n, i) => { if (i !== d.bonne && n > 0 && (pire < 0 || n > rep[pire])) pire = i; });
    const zone = sc.querySelector('.zone-correction');
    zone.replaceChildren(el('p', { class: 'bilan-q' }, el('strong', {}, justes + ' sur ' + total), ' ' + (justes > 1 ? 'ont' : 'a') + ' trouvé la bonne réponse, ' + Q.LETTRES[d.bonne] + '.',
      e.rebonds && e.rebonds.length ? el('span', { class: 'rebonds' }, ' Beaux rebonds : ' + e.rebonds.join(', ') + '.') : null));
    const ls = ligneSeries(); if (ls) zone.appendChild(ls);
    // le reste vient du fichier du cours (contenu local)
    if (pire >= 0) zone.appendChild(Q.fragmentCours('<div class="erreur-frequente">' + Q.pastille(pire) + '<div><p class="fb-titre">Erreur la plus fréquente</p><p>' + Q.texte(d.options[pire].feedback) + '</p></div></div>'));
    zone.appendChild(Q.fragmentCours(Q.rendreCorrection(d, null, { projection: true })));
    majStatut(); majAction();
    if (st.podium === 'chaque' && joueursActifs().length) setTimeout(montrerPodium, 50);
  }

  // Les séries en cours, à côté des pseudos (ordre alphabétique : ce n'est pas un classement), à partir de 2 d'affilée.
  function ligneSeries() {
    if (!st.series) return null;
    const l = joueursActifs().map(j => ({ j, s: serieDe(j) })).filter(x => x.s.n >= 2).sort((a, b) => a.j.pseudo.localeCompare(b.j.pseudo, 'fr'));
    if (!l.length) return null;
    return el('p', { class: 'series' }, el('strong', {}, 'En série : '), ...l.flatMap((x, i) => [i ? ', ' : '', el('span', { class: 'qui-serie' }, x.j.pseudo, ' ', Q.flamme(x.s.n, x.s.palier))]), '.');
  }

  /* ── Les autres types de questions, sur la page projetée ── */
  // Les réponses arrivent chiffrées pour cette page seule ; elle n'en montre que des nombres (et les mots du nuage).
  const barre = pc => { const b = el('span', {}); b.style.width = pc + '%'; return el('span', { class: 'rep-barre', 'aria-hidden': 'true' }, b); };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  function montrerCorrectionActivite(d) {
    const e = st.q[d.id], sc = $('scene'), zone = sc.querySelector('.zone-correction');
    if (d.type === 'nuage') { majNuage(d); zone.replaceChildren(Q.fragmentCours(Q.rendreCorrectionActivite(d, null))); majStatut(); majAction(); return; }
    const l = joueursActifs().filter(j => j.rep[d.id]), n = l.length, notes = l.map(j => Q.activites.noter(d, j.rep[d.id].a)), justes = notes.filter(x => x.juste).length;
    const quoi = d.type === 'relier' ? 'ont tout relié juste' : d.type === 'puzzle' ? 'ont remis tout le programme en ordre' : 'ont trouvé la ligne fautive';
    const stats = [el('p', { class: 'bilan-q' }, el('strong', {}, justes + ' sur ' + n), ' ' + quoi + '.',
      e.rebonds && e.rebonds.length ? el('span', { class: 'rebonds' }, ' Beaux rebonds : ' + e.rebonds.join(', ') + '.') : null)];
    if (n && d.type === 'relier') {
      const o = Q.activites.ordreDroite(d);
      stats.push(el('ol', { class: 'reussite' }, d.paires.map((p, i) => { const k = notes.filter(x => x.detail[i]).length; return el('li', {}, el('span', { class: 'q' }, (i + 1) + '→' + Q.LETTRES_LONGUES[o.indexOf(i)]), barre(pct(k, n)), el('span', {}, pct(k, n) + ' %')); })));
    } else if (n && d.type === 'puzzle') {
      const moy = notes.reduce((a, x) => a + x.detail.filter(Boolean).length, 0) / n;
      stats.push(el('p', {}, 'En moyenne, ' + (Math.round(moy * 10) / 10).toString().replace('.', ',') + ' ligne' + (moy >= 2 ? 's' : '') + ' sur ' + d.lignes.length + ' à leur place.'));
    } else if (n && d.type === 'ligne') {
      const c = d.code.map((_, i) => l.filter(j => j.rep[d.id].a === i).length);
      stats.push(el('ol', { class: 'reussite' }, c.map((k, i) => k || i === d.ligne - 1 ? el('li', { class: i === d.ligne - 1 ? 'bonne' : '' }, el('span', { class: 'q' }, 'L' + (i + 1)), barre(pct(k, n)), el('span', {}, k + ' (' + pct(k, n) + ' %)')) : null).filter(Boolean)));
    }
    const ls = ligneSeries(); if (ls) stats.push(ls);
    zone.replaceChildren(...stats);
    // la solution vient du fichier du cours (contenu local)
    zone.appendChild(Q.fragmentCours(Q.rendreCorrectionActivite(d, null, { tousOuverts: true })));
    if (d.type !== 'ligne') sc.querySelector('.zone-options').hidden = true;
    else sc.querySelector('.zone-options').replaceChildren();
    majStatut(); majAction();
    if (st.podium === 'chaque' && joueursActifs().length) setTimeout(montrerPodium, 50);
  }

  /* Le nuage de mots. Texte libre d'élèves, projeté en classe puis envoyé aux téléphones : chaque mot est filtré
     (js/activites.js), affiché par textContent, jamais avec son auteur·rice. L'enseignant·e garde la main : le nuage
     reste caché jusqu'à « Montrer le nuage » (les téléphones ne reçoivent rien avant), « Relire les mots » les montre
     en liste, et « Supprimer » retire un mot à tout moment, partout (tableau et téléphones), sans retour possible. */
  function supprimerMot(d, k) {
    const e = st.q[d.id];
    if (!Q.activites.supprimer(e.nuage, k)) return;
    sauver(); majNuage(d); majStatut(); if ($('motsBoite').open) remplirMots(d);
    if (e.revelee) envoyer(messageNuage(d)); // les téléphones l'effacent aussitôt
    Q.annoncer('Mot supprimé.');
  }
  function majNuage(d) {
    const z = $('scene').querySelector('.zone-nuage'); if (!z || !st.q[d.id] || !st.q[d.id].nuage) return;
    const e = st.q[d.id], nu = e.nuage, montres = Q.activites.affiches(nu, e.seuil);
    const reglages = el('div', { class: 'nuage-reglages' },
      el('label', { for: 'seuilNuage' }, 'Afficher'),
      (() => { const s = el('select', { id: 'seuilNuage' }, el('option', { value: '1' }, 'tous les mots'), el('option', { value: '2' }, 'les mots qui ont 2 voix au moins')); s.value = String(e.seuil); s.addEventListener('change', () => { e.seuil = s.value === '2' ? 2 : 1; sauver(); majNuage(d); if (e.revelee) envoyer(messageNuage(d)); }); return s; })(),
      (() => { const b = el('button', { type: 'button', class: 'bouton petit' }, 'Relire et supprimer (' + nu.mots.length + ')'); b.addEventListener('click', () => ouvrirMots(d)); return b; })());
    if (!e.revelee) {
      z.replaceChildren(el('p', { class: 'nuage-compte' }, el('strong', {}, pluriel(nu.mots.length, 'mot') + ' reçu' + (nu.mots.length > 1 ? 's' : '')), ' · le nuage s\'affiche au tableau et sur les téléphones quand tu cliques sur « Montrer le nuage ».'), reglages);
      return;
    }
    const max = montres.reduce((a, g) => Math.max(a, g.n), 1);
    const ordre = Q.melanger(montres, Q.graine(d.id)); // un nuage, pas un classement
    const ul = el('ul', { class: 'nuage', 'aria-label': 'Le nuage de mots de la classe' }, ordre.map((g, i) => {
      const b = el('button', { type: 'button', class: 'mot t' + Math.max(1, Math.round(g.n / max * 5)) + ' c' + (i % 4), 'aria-label': g.m + ', ' + pluriel(g.n, 'voix').replace('voixs', 'voix') + '. Supprimer ce mot', title: 'Supprimer ce mot' }, g.m, el('sup', { class: 'voix' }, String(g.n)));
      b.addEventListener('click', () => supprimerMot(d, g.k));
      return el('li', {}, b);
    }));
    z.replaceChildren(montres.length ? ul : el('p', { class: 'nuage-compte' }, e.seuil === 2 ? 'Aucun mot n\'a 2 voix pour l\'instant.' : 'Aucun mot pour l\'instant.'),
      el('p', { class: 'aide' }, 'La taille d\'un mot suit son nombre de voix (élèves qui l\'ont proposé ou qui ont voté pour). Un clic sur un mot le supprime, au tableau et sur les téléphones.'), reglages);
  }
  function remplirMots(d) {
    const nu = st.q[d.id].nuage, tous = nu.mots.slice().sort((a, b) => a.k - b.k);
    $('motsListe').replaceChildren(...(tous.length ? tous.map(w => {
      const b = el('button', { type: 'button', class: 'bouton petit', 'aria-label': 'Supprimer le mot ' + w.m }, 'Supprimer');
      b.addEventListener('click', () => supprimerMot(d, w.k));
      return el('li', {}, el('span', {}, w.m), el('small', {}, ' × ' + Q.activites.voix(w)), b);
    }) : [el('li', {}, 'Aucun mot pour l\'instant.')]));
  }
  function ouvrirMots(d) { remplirMots(d); const b = $('motsBoite'); if (!b.open) { try { b.showModal(); } catch (e) { b.setAttribute('open', ''); } } }

  function action() {
    const d = diapo();
    // d'abord les apparitions progressives de la diapositive, une à une
    if (d.type !== 'question' && fragmentsRestants() > 0) { st.f++; sauver(); Q.montrerFragments($('scene'), st.f); envoyer(messagePhase()); majAction(); return; }
    if (st.index === cours.diapositives.length - 1) { terminer(); return; }
    if (inter(d) && st.q[d.id] && !st.q[d.id].revelee) { corriger(d); montrerCorrection(d); majMinuterie(); Q.annoncer(d.type === 'nuage' ? 'Nuage affiché.' : 'Correction affichée.'); return; }
    aller(st.index + 1);
  }
  function aller(i) {
    const avant = st.index;
    st.index = Math.max(0, Math.min(cours.diapositives.length - 1, i));
    st.f = st.index < avant ? 100 : 0; // en revenant en arrière, tout est montré
    sauver(); afficher();
  }

  /* ── Podium et fin ──────────────────────── */
  function noeudsPodium(final) {
    const l = podium(), justes = cours.questions.filter(q => st.q[q.id] && st.q[q.id].revelee);
    if (!l.length) return [el('p', {}, 'Aucun·e élève connecté·e : pas de classement.')];
    const n = [];
    if (st.podium !== 'jamais' || final === 'force') {
      n.push(el('ol', { class: 'podium' }, l.filter(j => j.place <= 3).slice(0, 6).map(j => el('li', { class: 'place' + j.place },
        el('span', { class: 'rang' }, j.place + (j.place === 1 ? 're' : 'e')), el('span', { class: 'qui' }, j.pseudo, ' ', flammeDe(st.joueurs[j.id])), el('span', { class: 'pts' }, j.total + ' points')))));
    }
    // la progression de la classe : la réussite question par question
    if (justes.length) {
      n.push(el('h3', {}, 'La classe, question par question'), el('ol', { class: 'reussite' }, justes.map(q => {
        const rep = repartition(q), t = rep.reduce((a, b) => a + b, 0), pc = t ? Math.round(rep[q.bonne] / t * 100) : 0;
        const b = el('span', {}); b.style.width = pc + '%';
        return el('li', {}, el('span', { class: 'q' }, 'Q' + q.numero), el('span', { class: 'rep-barre' }, b), el('span', {}, pc + ' %'));
      })));
      const rebonds = l.map(j => ({ pseudo: j.pseudo, n: bilanJoueur(st.joueurs[j.id]).rebonds })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5);
      if (rebonds.length) n.push(el('p', { class: 'rebonds' }, el('strong', {}, 'Les rebonds'), ' (une bonne réponse juste après une erreur) : ' + rebonds.map(x => x.pseudo + ' (' + x.n + ')').join(', ') + '.'));
    }
    return n;
  }
  function montrerPodium(final) {
    $('podiumTitre').textContent = st.podium === 'jamais' && final !== 'force' ? 'Bilan de la classe' : 'Podium';
    $('podiumCorps').replaceChildren(...noeudsPodium(final));
    // à la fin de la séance : le QR code « rejouer » (lien fabriqué ici à partir de l'identifiant du cours)
    $('rejouerBloc').hidden = !st.fini;
    if (st.fini) { $('qrRejouer').innerHTML = qrSvg(Q.lienRejouer(cours.id)); $('lienRejouer').textContent = Q.lienRejouer(cours.id).replace(/^https?:\/\//, ''); }
    const b = $('podiumBoite');
    if (!b.open) { try { b.showModal(); } catch (e) { b.setAttribute('open', ''); } }
  }
  function messageFin() {
    return { t: 'fin', cours: cours.id, podium: st.podium === 'jamais' ? null : podiumPublic() };
  }
  function terminer() {
    st.fini = true; sauver();
    envoyer(messageFin());
    majAction();
    montrerPodium();
  }

  /* ── Le QR code en très grand ───────────── */
  // À tout moment (accueil, cours, question, fin) : le bouton ou la touche Q l'ouvre, Q, Échap ou « Fermer » le referme.
  // Un·e élève en retard rejoint en cours de route : la page projetée lui renvoie la diapositive ou la question en cours.
  // Après la fin de la séance, il montre le QR code « rejouer » : chaque élève rejoue le quiz seul·e.
  function qrSvg(lien) { try { const q = qrcode(0, 'M'); q.addData(lien); q.make(); return q.createSvgTag({ scalable: true, margin: 0 }); } catch (e) { return ''; } }
  function modeQrGrand() {
    const fin = !!(st && st.fini), sansProto = l => l.replace(/^https?:\/\//, '');
    $('qrTitre').textContent = fin ? 'Rejouer le quiz seul·e' : 'Rejoindre la séance';
    $('qrEtape2').hidden = $('codeGrand').hidden = fin;
    $('qrNb').textContent = fin ? 'Les questions dans un nouvel ordre, les réponses mélangées. Rien n\'est envoyé.' : 'Dans la séance : ' + pluriel(presentsActifs().length, 'élève') + '.';
    if (fin) { $('lienGrand').textContent = sansProto(Q.lienRejouer(cours.id)); $('qrGrand').innerHTML = qrSvg(Q.lienRejouer(cours.id)); $('qrGrand').setAttribute('aria-label', 'QR code pour rejouer le quiz seul·e'); }
    else { $('lienGrand').textContent = sansProto(Q.lienEleve(st.code)); $('qrGrand').innerHTML = qrSvg(Q.lienEleve(st.code)); $('qrGrand').setAttribute('aria-label', 'QR code du lien de la séance'); }
  }
  function basculerQrGrand() {
    const b = $('qrBoite');
    if (b.open) { b.close(); return; }
    modeQrGrand();
    if ($('podiumBoite').open) $('podiumBoite').close();
    try { b.showModal(); } catch (e) { b.setAttribute('open', ''); }
    $('qrFermer').focus();
  }

  /* ── La connexion ───────────────────────── */
  async function connecter() {
    if (seance) seance.fermer();
    seance = null;
    presents = new Map();
    const lien = Q.lienEleve(st.code);
    $('code').textContent = st.code; $('codePetit').textContent = st.code; $('codeBarre').textContent = st.code;
    $('lien').textContent = lien.replace(/^https?:\/\//, ''); $('lienPetit').textContent = lien.replace(/^https?:\/\//, '');
    $('codeGrand').textContent = st.code; $('lienGrand').textContent = lien.replace(/^https?:\/\//, '');
    try {
      const q = qrcode(0, 'M'); q.addData(lien); q.make();
      const svgQr = q.createSvgTag({ scalable: true, margin: 0 });
      // le SVG vient du générateur de QR codes, à partir du lien de la séance (fabriqué ici, pas reçu du canal)
      $('qr').innerHTML = svgQr; $('qrPetit').innerHTML = svgQr; $('qrGrand').innerHTML = svgQr;
    } catch (e) { $('qr').textContent = ''; }
    const z = $('etatConnexion');
    if (!Q.chiffre.disponible()) { z.className = 'etat ko'; z.textContent = 'Ce navigateur ne peut pas chiffrer les réponses (page à ouvrir en https). Le cours marche sans les téléphones.'; return; }
    try { cleHote = await Q.chiffre.hote(); } catch (e) { z.className = 'etat ko'; z.textContent = 'Le chiffrement des réponses est impossible dans ce navigateur.'; return; }
    seance = Q.ouvrirSeance(st.code, { id: st.id, role: 'hote', cle: cleHote.publique }, {
      onMessage, onPresence,
      onEtat(e) {
        if (e === 'connexion') { z.className = 'etat'; z.textContent = 'Connexion à la séance en direct…'; }
        else if (e === 'connecte') { z.className = 'etat ok'; z.textContent = seance && seance.demo ? 'Mode démo : la séance passe entre les onglets de ce navigateur.' : 'Séance ouverte : les élèves peuvent rejoindre.'; planifierRenvoi(); }
        else if (e === 'erreur' || e === 'ferme') { z.className = 'etat ko'; z.replaceChildren('Pas de connexion à la séance en direct : vérifie le réseau, puis recharge la page. Tu peux projeter le cours sans les téléphones, et proposer aux élèves de ', el('a', { href: 'revision.html?cours=' + encodeURIComponent(cours.id) }, 'réviser seul·e·s'), ', sans réseau de classe.'); }
      },
    });
  }

  function demarrerCours() {
    const du = +$('duree').value, po = $('podium').value;
    st.duree = DUREES.includes(du) ? du : 45; st.podium = PODIUMS.includes(po) ? po : 'fin'; st.series = $('series').value !== 'non';
    st.commence = true; sauver();
    $('accueil').hidden = true; $('scene').hidden = false; $('commandes').hidden = false;
    $('pastilleSeance').hidden = false; $('btnRejoindre').hidden = false; $('btnPodium').hidden = false;
    afficher();
  }

  /* ── Démarrage ──────────────────────────── */
  async function demarrer() {
    Q.theme();
    try { cours = await Q.chargerCours(Q.idCours()); }
    catch (e) { $('scene').hidden = false; Q.erreurPage($('scene'), e.message); return; }
    document.title = 'QuizzNSI · ' + cours.titre + ' · animer la séance';
    $('titreCours').textContent = cours.titre + ' · animer la séance';
    st = etatRelu(Q.session.lire('animer:' + cours.id, null));
    const reprise = st && st.commence;
    if (!st) st = etatNeuf();
    $('duree').value = String(st.duree); $('podium').value = st.podium; $('series').value = st.series ? 'oui' : 'non'; $('dureeSuite').value = String(st.duree);
    $('accueil').hidden = false;
    if (reprise) { $('reprendre').hidden = false; $('commencer').textContent = 'Recommencer au début'; }
    connecter();
    majEleves();

    $('commencer').addEventListener('click', () => {
      if (reprise) { const code = st.code, id = st.id; st = etatNeuf(code); st.id = id; }
      demarrerCours();
    });
    $('reprendre').addEventListener('click', demarrerCours);
    $('nouvelle').addEventListener('click', () => { st = etatNeuf(); sauver(); connecter(); majEleves(); $('reprendre').hidden = true; $('commencer').textContent = 'Commencer le cours'; });
    $('copier').addEventListener('click', async () => { try { await navigator.clipboard.writeText(Q.lienEleve(st.code)); $('copier').textContent = 'Lien copié'; } catch (e) { $('copier').textContent = 'Copie impossible'; } setTimeout(() => { $('copier').textContent = 'Copier le lien'; }, 1800); });
    document.addEventListener('click', ev => { const b = ev.target.closest('[data-retirer]'); if (b && Q.messages.estId(b.dataset.retirer)) retirer(b.dataset.retirer); });
    $('prec').addEventListener('click', () => aller(st.index - 1));
    $('action').addEventListener('click', action);
    $('plus15').addEventListener('click', plus15);
    $('pause').addEventListener('click', basculerPause);
    // le temps des questions suivantes : modifiable en cours de séance ; la question déjà ouverte garde le sien
    $('dureeSuite').addEventListener('change', () => {
      const v = +$('dureeSuite').value; if (!DUREES.includes(v)) return;
      st.duree = v; $('duree').value = String(v); sauver();
      Q.annoncer(v ? 'Questions suivantes : ' + v + ' s.' : 'Questions suivantes : sans minuterie.');
    });
    $('btnPodium').addEventListener('click', () => montrerPodium('force'));
    $('btnRejoindre').addEventListener('click', () => { const c = $('carteRejoindre'); c.hidden = !c.hidden; $('btnRejoindre').setAttribute('aria-expanded', String(!c.hidden)); });
    $('btnPleinEcran').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); });
    $('btnQrGrand').addEventListener('click', basculerQrGrand);
    $('btnRejouerGrand').addEventListener('click', basculerQrGrand);
    $('qrBoite').addEventListener('close', () => { $('btnQrGrand').focus({ preventScroll: true }); });
    document.addEventListener('keydown', ev => {
      if ((ev.key === 'q' || ev.key === 'Q') && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !(ev.target.closest && ev.target.closest('input, select, textarea'))) { ev.preventDefault(); basculerQrGrand(); return; }
      if (!st.commence || $('podiumBoite').open || $('qrBoite').open || $('motsBoite').open) return;
      if (ev.target.closest && ev.target.closest('input, select, textarea')) return;
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      // la minuterie : + 15 s (touche + ou T), pause et reprise (touche S), même quand un bouton a le focus
      if (ev.key === '+' || ev.key === 't' || ev.key === 'T') { ev.preventDefault(); plus15(); return; }
      if (ev.key === 's' || ev.key === 'S') { ev.preventDefault(); basculerPause(); return; }
      if (ev.target.closest && ev.target.closest('button, a, summary')) return;
      if (ev.key === 'ArrowRight' || ev.key === 'Enter' || ev.key === ' ' || ev.key === 'PageDown') { ev.preventDefault(); action(); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); aller(st.index - 1); }
      else if (ev.key === 'p' || ev.key === 'P') montrerPodium('force');
      else if (ev.key === 'j' || ev.key === 'J') $('btnRejoindre').click();
    });
    setInterval(() => {
      if (!st.commence) return;
      const d = diapo();
      const e = inter(d) && d.type !== 'nuage' ? st.q[d.id] : null;
      if (e && !e.ferme && e.duree > 0 && !MN.enPause(e) && MN.reste(e, Date.now()) <= 0) fermer(d, 'Temps écoulé.', true);
      majStatut(); majMinuterie();
    }, 500);
  }
  demarrer();
})();
