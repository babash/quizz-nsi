/* QuizzNSI : validation stricte de tout ce qui arrive par le canal temps réel (MIT, Babash - NSI Tani Malandi).
   Le canal est public : n'importe qui qui connaît le code de séance peut y envoyer un message.
   Chaque message est donc contrôlé à l'entrée par un schéma strict : type, clés permises,
   entiers bornés, chaînes au format attendu, listes bornées. Un message non conforme est ignoré
   (null). Les pages n'affichent ensuite les valeurs reçues que par textContent ou par des éléments
   créés un à un, jamais par innerHTML ; le texte des questions vient du fichier du cours, pas du canal.
   Seule exception au « ni texte ni pseudo libre » : le message « nuage », qui porte les mots du nuage affichés au
   tableau (chacun repasse le filtre des mots, js/activites.js), sans leur auteur·rice.
   Ce que le canal diffuse se limite à ce que l'écran projeté montre déjà à toute la classe : la bonne
   réponse, la répartition des réponses (en nombres), le podium quand il est affiché, l'état de la minuterie (temps restant,
   pause) et le réglage « Afficher les séries » ; jamais la série d'un·e élève (chaque téléphone calcule la sienne). Chaque téléphone
   calcule ses propres points ; les réponses des élèves arrivent chiffrées pour la page projetée. À la fermeture et à la
   correction, la liste des nombres tirés au hasard des envois retenus (« retenus ») dit à chaque téléphone, et à lui seul,
   quel choix compte.
   Fonctions pures, testées par tests/test_messages.js. */
(function (racine) {
  'use strict';
  const Q = racine.QuizzNSI = racine.QuizzNSI || {};

  const objet = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
  const cles = (v, permises) => objet(v) && Object.keys(v).every(k => permises.includes(k));
  const entier = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  const ID = /^[0-9a-f]{16}$/, QID = /^[a-z0-9-]{1,20}$/, COURS = /^[a-z0-9-]{1,60}$/;
  const estId = v => typeof v === 'string' && ID.test(v);
  const estQid = v => typeof v === 'string' && QID.test(v);
  const estCours = v => typeof v === 'string' && COURS.test(v);
  const MAX_POINTS = 10000000, MAX_Q = 1000, MAX_ELEVES = 100000, MAX_POINTS_Q = 1000;

  function pseudo(v) {
    if (!Q.filtrerPseudo) return null;
    const f = Q.filtrerPseudo(v);
    return f.ok && f.pseudo === v ? v : null;
  }

  function podium(v) {
    if (v === null || v === undefined) return null;
    if (!Array.isArray(v) || v.length > 20) return undefined;
    const l = [];
    for (const p of v) {
      if (!cles(p, ['pseudo', 'total', 'place']) || !pseudo(p.pseudo) || !entier(p.total, 0, MAX_POINTS) || !entier(p.place, 1, MAX_ELEVES)) return undefined;
      l.push({ pseudo: p.pseudo, total: p.total, place: p.place });
    }
    return l;
  }
  function bareme(v) {
    const k = ['participation', 'juste', 'rapidite', 'rebond'];
    if (!cles(v, k) || !k.every(x => entier(v[x], 0, MAX_POINTS_Q))) return null;
    return { participation: v.participation, juste: v.juste, rapidite: v.rapidite, rebond: v.rebond };
  }
  const NONCE = /^[0-9a-f]{16}$/;
  /* Les choix retenus par la page projetée, à la fermeture et à la correction : la liste des nombres tirés au hasard
     (n) des envois retenus, un par élève qui a répondu, triée. Chaque téléphone y reconnaît le sien (lui seul sait
     quel envoi porte quel n) ; personne d'autre n'y lit ni qui a répondu ni quoi. Toute valeur hors format, ou un
     même nombre deux fois, fait rejeter le message. */
  function retenus(v) {
    if (!Array.isArray(v) || v.length > MAX_ELEVES || !v.every(x => typeof x === 'string' && NONCE.test(x))) return null;
    return new Set(v).size === v.length ? v.slice() : null;
  }
  /* Une durée accordée à une question, en secondes : 0 (sans minuterie), ou une durée de départ (20, 30, 45, 60, 90)
     plus k fois 15 s, k de 0 à 40 (« + 15 s », js/bareme.js : minuterie). Toute autre valeur fait rejeter le message. */
  const DEPARTS = [20, 30, 45, 60, 90], AJOUT = 15, MAX_AJOUTS = 40;
  const dureeAccordee = d => d === 0 || (Number.isSafeInteger(d) && DEPARTS.some(b => d >= b && (d - b) % AJOUT === 0 && (d - b) / AJOUT <= MAX_AJOUTS));

  /* Messages de la page projetée vers les élèves. Ils ne portent que ce que l'écran projeté montre
     déjà à toute la classe : jamais la réponse ni les points d'un·e élève. */
  function versEleve(m, moiId) {
    if (!objet(m) || typeof m.t !== 'string') return null;
    switch (m.t) {
      case 'attente':
        return cles(m, ['t']) ? { t: 'attente' } : null;
      case 'notion':
        return cles(m, ['t', 'cours', 'n', 'f']) && estCours(m.cours) && entier(m.n, 0, MAX_Q) && entier(m.f, 0, 100) ? { t: 'notion', cours: m.cours, n: m.n, f: m.f } : null;
      // reste : le temps restant hors pause (ms), jamais plus que la durée accordée ; pause : la minuterie est arrêtée
      // (seulement avec une minuterie et une question ouverte)
      case 'question':
        if (!cles(m, ['t', 'cours', 'qid', 'reste', 'duree', 'ferme', 'pause']) || !estCours(m.cours) || !estQid(m.qid) || typeof m.ferme !== 'boolean' || typeof m.pause !== 'boolean' || !dureeAccordee(m.duree)) return null;
        if (m.duree === 0 ? m.reste !== null : !entier(m.reste, 0, m.duree * 1000)) return null;
        if (m.pause && (m.duree === 0 || m.ferme)) return null;
        return { t: 'question', cours: m.cours, qid: m.qid, reste: m.reste, duree: m.duree, ferme: m.ferme, pause: m.pause };
      case 'fermee':
      { if (!cles(m, ['t', 'qid', 'retenus']) || !estQid(m.qid)) return null; const rt = retenus(m.retenus); return rt ? { t: 'fermee', qid: m.qid, retenus: rt } : null; }
      case 'recus':
        if (!cles(m, ['t', 'qid', 'n']) || !estQid(m.qid) || !Array.isArray(m.n) || m.n.length > MAX_ELEVES || !m.n.every(x => typeof x === 'string' && NONCE.test(x))) return null;
        return { t: 'recus', qid: m.qid, n: m.n.slice() };
      case 'retire':
        return cles(m, ['t', 'id']) && estId(m.id) ? { t: 'retire', pourMoi: m.id === moiId } : null;
      case 'refus':
        return cles(m, ['t', 'id', 'raison']) && estId(m.id) && (m.raison === 'pris' || m.raison === 'invalide') ? { t: 'refus', pourMoi: m.id === moiId, raison: m.raison } : null;
      case 'correction': {
        if (!cles(m, ['t', 'cours', 'qid', 'precedente', 'bonne', 'rep', 'bareme', 'duree', 'podium', 'series', 'retenus']) || !estCours(m.cours) || !estQid(m.qid) || typeof m.series !== 'boolean') return null;
        const rt = retenus(m.retenus); if (!rt) return null;
        if (!(m.precedente === null || estQid(m.precedente)) || !entier(m.bonne, 0, 3) || !dureeAccordee(m.duree)) return null;
        if (!Array.isArray(m.rep) || m.rep.length !== 4 || !m.rep.every(n => entier(n, 0, MAX_ELEVES))) return null;
        const b = bareme(m.bareme); if (!b) return null;
        const pd = podium(m.podium); if (pd === undefined) return null;
        return { t: 'correction', cours: m.cours, qid: m.qid, precedente: m.precedente, bonne: m.bonne, rep: m.rep.slice(), bareme: b, duree: m.duree, podium: pd, series: m.series, retenus: rt };
      }
      // la correction d'une question d'un autre type (relier, puzzle, ligne fautive, nuage de mots) : seulement le
      // nombre de réponses et le nombre de réponses tout à fait justes, comme à l'écran ; la solution vient du fichier du cours
      case 'corrige': {
        if (!cles(m, ['t', 'cours', 'qid', 'precedente', 'duree', 'nb', 'justes', 'podium', 'series', 'retenus']) || !estCours(m.cours) || !estQid(m.qid) || typeof m.series !== 'boolean') return null;
        const rt = retenus(m.retenus); if (!rt || rt.length > m.nb) return null;
        if (!(m.precedente === null || estQid(m.precedente)) || !dureeAccordee(m.duree) || !entier(m.nb, 0, MAX_ELEVES) || !entier(m.justes, 0, MAX_ELEVES) || m.justes > m.nb) return null;
        const pd = podium(m.podium); if (pd === undefined) return null;
        return { t: 'corrige', cours: m.cours, qid: m.qid, precedente: m.precedente, duree: m.duree, nb: m.nb, justes: m.justes, podium: pd, series: m.series, retenus: rt };
      }
      // le nuage de mots, une fois montré par l'enseignant·e : les mots affichés au tableau et leur nombre de voix,
      // jamais l'auteur·rice ; chaque mot doit passer le filtre des mots (js/activites.js) sans être modifié
      case 'nuage': {
        if (!cles(m, ['t', 'cours', 'qid', 'mots']) || !estCours(m.cours) || !estQid(m.qid) || !Array.isArray(m.mots) || m.mots.length > 200) return null;
        if (!Q.activites) return null;
        const vus = new Set(), mots = [];
        for (const w of m.mots) {
          if (!cles(w, ['k', 'm', 'n']) || !entier(w.k, 0, 99999) || vus.has(w.k) || !entier(w.n, 1, MAX_ELEVES) || typeof w.m !== 'string' || w.m.length > 64) return null;
          const f = Q.activites.filtrerMot(w.m);
          if (!f.ok || f.mot !== w.m) return null;
          vus.add(w.k); mots.push({ k: w.k, m: w.m, n: w.n });
        }
        return { t: 'nuage', cours: m.cours, qid: m.qid, mots };
      }
      case 'fin': {
        if (!cles(m, ['t', 'cours', 'podium']) || !estCours(m.cours)) return null;
        const pd = podium(m.podium); if (pd === undefined) return null;
        return { t: 'fin', cours: m.cours, podium: pd };
      }
      default:
        return null;
    }
  }

  /* Messages des élèves vers la page projetée. */
  function versHote(m) {
    if (!objet(m) || typeof m.t !== 'string') return null;
    if (m.t === 'bonjour') return cles(m, ['t', 'id']) && estId(m.id) ? { t: 'bonjour', id: m.id } : null;
    // une réponse arrive chiffrée (js/chiffre.js) : on ne contrôle ici que l'enveloppe
    if (m.t === 'rep') return cles(m, ['t', 'de', 'iv', 'donnees']) && Q.chiffre && Q.chiffre.estClePublique(m.de) && typeof m.iv === 'string' && /^[A-Za-z0-9_-]{16}$/.test(m.iv)
      && typeof m.donnees === 'string' && /^[A-Za-z0-9_-]{1,400}$/.test(m.donnees) ? { t: 'rep', de: { x: m.de.x, y: m.de.y }, iv: m.iv, donnees: m.donnees } : null;
    return null;
  }
  /* Le contenu déchiffré d'une réponse : { id, qid, c, n } pour une question à choix (c de 0 à 3),
     { id, qid, r, n } pour un autre type. Ici, on ne contrôle que la forme de r ; la page projetée la contrôle
     ensuite contre la diapositive du cours (js/activites.js, valider). */
  function formeReponse(r) {
    if (typeof r === 'string') return r.length >= 1 && r.length <= 64 ? r : undefined;          // nuage de mots : un mot proposé
    if (objet(r)) return cles(r, ['vote']) && entier(r.vote, 0, 99999) ? { vote: r.vote } : undefined; // nuage : une voix
    if (entier(r, 0, 199)) return r;                                                          // ligne fautive
    if (!Array.isArray(r) || r.length < 1 || r.length > 16) return undefined;
    if (r.every(x => entier(x, -1, 15))) return r.slice();                                     // relier
    if (r.every(x => Array.isArray(x) && x.length === 2 && entier(x[0], 0, 15) && entier(x[1], 0, 6))) return r.map(x => [x[0], x[1]]); // puzzle
    return undefined;
  }
  // k : le numéro du choix (0 pour le premier, +1 à chaque changement d'avis, 30 au plus : js/bareme.js, retenir)
  const MAX_CHANGEMENTS = 30;
  function reponse(m) {
    if (!objet(m) || !estId(m.id) || !estQid(m.qid) || typeof m.n !== 'string' || !NONCE.test(m.n) || !entier(m.k, 0, MAX_CHANGEMENTS)) return null;
    if (cles(m, ['id', 'qid', 'c', 'n', 'k']) && 'c' in m) return entier(m.c, 0, 3) ? { id: m.id, qid: m.qid, c: m.c, n: m.n, k: m.k } : null;
    if (cles(m, ['id', 'qid', 'r', 'n', 'k']) && 'r' in m) { const r = formeReponse(m.r); return r === undefined ? null : { id: m.id, qid: m.qid, r, n: m.n, k: m.k }; }
    return null;
  }

  /* Une entrée de présence. Les élèves : { id, pseudo, role: 'eleve', cle } ; l'hôte : { id, role: 'hote', cle }.
     cle : la clé publique de l'appareil (déjà lisible dans chaque réponse envoyée) ; la page projetée y relie
     l'identifiant de l'élève (js/animer.js) : un autre appareil ne peut pas se faire passer pour lui ou elle.
     Supabase ajoute presence_ref : c'est la seule clé de plus permise. */
  function presence(p) {
    if (!objet(p) || !estId(p.id)) return null;
    if (p.role === 'hote') return cles(p, ['id', 'role', 'cle', 'presence_ref']) && (p.cle === undefined || (Q.chiffre && Q.chiffre.estClePublique(p.cle))) ? { id: p.id, role: 'hote', cle: p.cle ? { x: p.cle.x, y: p.cle.y } : null } : null;
    if (p.role !== 'eleve' || !cles(p, ['id', 'pseudo', 'role', 'cle', 'presence_ref']) || typeof p.pseudo !== 'string' || p.pseudo.length > 64) return null;
    if (p.cle !== undefined && !(Q.chiffre && Q.chiffre.estClePublique(p.cle))) return null;
    const f = Q.filtrerPseudo(p.pseudo);
    return { id: p.id, role: 'eleve', pseudo: f.ok ? f.pseudo : null, cle: p.cle ? { x: p.cle.x, y: p.cle.y } : null };
  }

  Q.messages = { versEleve, versHote, reponse, formeReponse, presence, retenus, estId, estQid, estCours, dureeAccordee };
  if (typeof module !== 'undefined' && module.exports) module.exports = Q.messages;
})(typeof window !== 'undefined' ? window : globalThis);
