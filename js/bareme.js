/* QuizzNSI : le barème du mode « en classe » (MIT, Babash - NSI Tani Malandi).
   Fonctions pures, sans page ni réseau : elles sont testées par tests/test_bareme.js (node).

   Barème proposé (à valider par l'enseignant·e) :
   - répondre, même faux : +10 (on ose répondre) ;
   - bonne réponse : +100 ;
   - rapidité : jusqu'à +20, seulement avec une minuterie, et seulement pour une bonne réponse
     (réfléchir rapporte toujours plus que se presser : 100 contre 20 au plus) ;
   - rebond : +30 pour une bonne réponse juste après une erreur à la question précédente
     (on valorise la progression, pas seulement les meilleur·e·s).
   Une question rapporte donc de 10 à 150 points.
   Les autres types de questions (js/activites.js) :
   - relier, puzzle de code : la bonne réponse est notée en proportion de ce qui est juste (3 paires bien
     reliées sur 4 : 75 points sur 100) ; rapidité et rebond seulement si tout est juste ;
   - ligne fautive : comme une question à choix (juste ou faux) ;
   - nuage de mots : non noté (aucune bonne réponse), il ne compte ni pour les points ni pour les rebonds.

   La minuterie (T131) : l'enseignant·e peut ajouter 15 s (autant de fois que voulu, 40 fois au plus), mettre en pause
   et reprendre. La part de rapidité se calcule sur le temps réellement écoulé hors pause, rapporté à la durée totale
   accordée (durée de départ + ajouts) : rapidité = 20 × (1 − écoulé / accordée), arrondie, toujours entre 0 et 20.
   Une réponse donnée pendant la pause compte le temps écoulé au début de la pause (ni gain ni perte). Un ajout fait
   après le zéro rouvre la question avec 15 s ; le temps passé à zéro n'est pas compté. */
(function (racine) {
  'use strict';
  const BAREME = { participation: 10, juste: 100, rapidite: 20, rebond: 30 };

  /* Points d'une réponse.
     r : { juste: booléen, ms: temps de réponse en millisecondes, part: de 0 à 1 (facultatif, ce qui est juste) }
     ctx : { duree: durée de la minuterie en secondes (0 ou absente : sans minuterie),
             precedente: 'juste' | 'faux' | null (la réponse de l'élève à la question jouée juste avant) } */
  function points(r, ctx, b) {
    b = b || BAREME; ctx = ctx || {};
    const detail = { participation: 0, juste: 0, rapidite: 0, rebond: 0 };
    if (!r) return { total: 0, detail };
    detail.participation = b.participation;
    if (r.juste) {
      detail.juste = b.juste;
      if (ctx.duree > 0 && Number.isFinite(r.ms)) {
        const part = 1 - Math.min(Math.max(r.ms, 0), ctx.duree * 1000) / (ctx.duree * 1000);
        detail.rapidite = Math.round(b.rapidite * part);
      }
      if (ctx.precedente === 'faux') detail.rebond = b.rebond;
    } else if (Number.isFinite(r.part) && r.part > 0) {
      detail.juste = Math.round(b.juste * Math.min(1, r.part));
    }
    return { total: detail.participation + detail.juste + detail.rapidite + detail.rebond, detail };
  }

  /* Classement : un tableau [{ id, pseudo, total, justes }], trié par points, puis bonnes réponses,
     puis pseudo (ordre stable et prévisible). Les ex aequo partagent la même place. */
  function classer(joueurs) {
    const l = joueurs.slice().sort((a, b) => b.total - a.total || b.justes - a.justes || String(a.pseudo).localeCompare(String(b.pseudo), 'fr'));
    let place = 0, avant = null;
    l.forEach((j, i) => { if (!avant || j.total !== avant.total || j.justes !== avant.justes) place = i + 1; j.place = place; avant = j; });
    return l;
  }

  /* Répartition des réponses d'une question : [nA, nB, nC, nD]. */
  function repartition(reponses) {
    const n = [0, 0, 0, 0];
    for (const c of reponses) if (Number.isInteger(c) && c >= 0 && c < 4) n[c]++;
    return n;
  }

  /* La progression d'un·e élève : séries et rebonds, à partir de ses résultats dans l'ordre joué
     ('juste', 'faux' ou null quand il ou elle n'a pas répondu). */
  function progression(resultats) {
    let serie = 0, meilleure = 0, rebonds = 0, justes = 0, repondues = 0, prec = null;
    for (const r of resultats) {
      if (r) repondues++;
      if (r === 'juste') { justes++; serie++; meilleure = Math.max(meilleure, serie); if (prec === 'faux') rebonds++; }
      else serie = 0;
      prec = r;
    }
    return { justes, repondues, serie, meilleure, rebonds };
  }

  /* ── La minuterie d'une question (fonctions pures, temps t en millisecondes) ──
     e : { ouverte: instant d'ouverture, duree: durée de départ en s (0 : sans minuterie), ajouts: nombre de « + 15 s »,
           pauseMs: temps déjà passé en pause, pauseDepuis: début de la pause en cours (null : la minuterie tourne) } */
  const DUREES = [0, 20, 30, 45, 60, 90], AJOUT = 15, MAX_AJOUTS = 40, PALIERS = [3, 5, 10];
  const accordee = e => e && e.duree > 0 ? e.duree + AJOUT * e.ajouts : 0;            // en secondes
  function ecoule(e, t) {                                                               // hors pause, en ms
    const pause = e.pauseMs + (e.pauseDepuis != null ? Math.max(0, t - e.pauseDepuis) : 0);
    return Math.max(0, t - e.ouverte - pause);
  }
  const reste = (e, t) => e.duree > 0 ? Math.max(0, accordee(e) * 1000 - ecoule(e, t)) : null;
  const enPause = e => e.pauseDepuis != null;
  function pause(e, t) { if (e.duree > 0 && !enPause(e) && reste(e, t) > 0) { e.pauseDepuis = t; return true; } return false; }
  function reprendre(e, t) { if (!enPause(e)) return false; e.pauseMs += Math.max(0, t - e.pauseDepuis); e.pauseDepuis = null; return true; }
  // + 15 s : la fin recule de 15 s. Après le zéro, le temps passé à zéro est compté comme une pause : il reste 15 s.
  function ajouter(e, t) {
    if (!(e.duree > 0) || e.ajouts >= MAX_AJOUTS) return false;
    const trop = ecoule(e, t) - accordee(e) * 1000;
    if (trop > 0) e.pauseMs += trop;
    e.ajouts++;
    return true;
  }
  // une durée accordée possible (ce que les messages peuvent annoncer) : 0, ou une durée de départ + k × 15 s
  const dureeAccordeeValide = d => d === 0 || DUREES.some(b => b > 0 && Number.isSafeInteger(d) && d >= b && (d - b) % AJOUT === 0 && (d - b) / AJOUT <= MAX_AJOUTS);
  const minuterie = { DUREES, AJOUT, MAX_AJOUTS, accordee, ecoule, reste, enPause, pause, reprendre, ajouter, dureeAccordeeValide };

  /* La série en cours (les flammes) : le nombre de bonnes réponses d'affilée dans la séance, à partir des résultats
     dans l'ordre joué ; une erreur ou une non-réponse la remet à zéro. Rien n'est gardé d'une séance à l'autre.
     palier : vrai quand la série vient d'atteindre 3, 5 ou 10 (petite animation). casse : la série d'au moins 2
     vient de s'arrêter (on écrit « nouvelle série à la prochaine », sans message négatif). */
  function serie(resultats) {
    const n = progression(resultats).serie, avant = resultats.length ? progression(resultats.slice(0, -1)).serie : 0;
    return { n, palier: n > avant && PALIERS.includes(n), casse: n === 0 && avant >= 2 };
  }

  const api = { BAREME, points, classer, repartition, progression, serie, PALIERS, minuterie };
  racine.QuizzNSI = racine.QuizzNSI || {};
  racine.QuizzNSI.bareme = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
