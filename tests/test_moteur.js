// QuizzNSI : tests du barème et des outils communs, sans navigateur.
// Lancement, depuis la racine de QuizzNSI : node tests/test_moteur.js
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
globalThis.location = { search: '' };
require(path.join(__dirname, '..', 'js', 'commun.js'));
const B = require(path.join(__dirname, '..', 'js', 'bareme.js'));
const A = require(path.join(__dirname, '..', 'js', 'activites.js'));
const Q = globalThis.QuizzNSI;
let n = 0;
const essai = (nom, f) => { f(); n++; console.log('ok  ' + nom); };

essai('barème : une réponse fausse rapporte la participation seule', () => {
  assert.deepEqual(B.points({ juste: false, ms: 1000 }, { duree: 30, precedente: 'faux' }).total, 10);
});
essai('barème : pas de réponse, pas de point', () => assert.equal(B.points(null, {}).total, 0));
essai('barème : bonne réponse sans minuterie, sans bonus de rapidité', () => {
  const p = B.points({ juste: true, ms: 10 }, { duree: 0, precedente: 'juste' });
  assert.equal(p.total, 110); assert.equal(p.detail.rapidite, 0);
});
essai('barème : rapidité de 20 à 0 sur la durée de la minuterie', () => {
  assert.equal(B.points({ juste: true, ms: 0 }, { duree: 30 }).detail.rapidite, 20);
  assert.equal(B.points({ juste: true, ms: 15000 }, { duree: 30 }).detail.rapidite, 10);
  assert.equal(B.points({ juste: true, ms: 45000 }, { duree: 30 }).detail.rapidite, 0);
});
essai('barème : le rebond après une erreur', () => {
  const p = B.points({ juste: true, ms: 30000 }, { duree: 30, precedente: 'faux' });
  assert.equal(p.detail.rebond, 30); assert.equal(p.total, 140);
  assert.equal(B.points({ juste: true }, { precedente: null }).detail.rebond, 0); // sans réponse avant : pas de rebond
});
essai('barème : réfléchir rapporte plus que se presser', () => {
  assert.ok(B.points({ juste: true, ms: 29000 }, { duree: 30 }).total > B.points({ juste: false, ms: 0 }, { duree: 30 }).total + 80);
});
essai('classement : ex aequo à la même place', () => {
  const l = B.classer([{ pseudo: 'b', total: 200, justes: 2 }, { pseudo: 'a', total: 200, justes: 2 }, { pseudo: 'c', total: 300, justes: 2 }, { pseudo: 'd', total: 10, justes: 0 }]);
  assert.deepEqual(l.map(j => j.pseudo + j.place), ['c1', 'a2', 'b2', 'd4']);
});
essai('répartition des réponses', () => assert.deepEqual(B.repartition([0, 1, 1, 3, null, 7, -1, 1.5]), [1, 2, 0, 1]));
essai('progression : séries et rebonds', () => {
  const p = B.progression(['juste', 'faux', 'juste', 'juste', null, 'juste']);
  assert.deepEqual([p.justes, p.repondues, p.serie, p.meilleure, p.rebonds], [4, 5, 1, 2, 1]);
});

/* La minuterie (T131) : + 15 s, pause, reprise ; la rapidité sur le temps écoulé hors pause, rapporté à la durée accordée. */
const MN = B.minuterie;
const q0 = (duree = 30) => ({ ouverte: 1000000, duree, ajouts: 0, pauseMs: 0, pauseDepuis: null });
essai('minuterie : temps écoulé et restant sans pause', () => {
  const e = q0(30);
  assert.equal(MN.ecoule(e, 1000000 + 12000), 12000);
  assert.equal(MN.reste(e, 1000000 + 12000), 18000);
  assert.equal(MN.reste(e, 1000000 + 99000), 0);
  assert.equal(MN.ecoule(e, 999000), 0); // jamais négatif
  assert.equal(MN.reste(q0(0), 1000000 + 5000), null); // sans minuterie
});
essai('minuterie : la pause arrête le temps, la reprise le relance', () => {
  const e = q0(30), t = 1000000;
  assert.ok(MN.pause(e, t + 10000));
  assert.equal(MN.ecoule(e, t + 50000), 10000); // 40 s de pause : rien ne s'écoule
  assert.equal(MN.reste(e, t + 50000), 20000);
  assert.equal(MN.pause(e, t + 51000), false); // déjà en pause
  assert.ok(MN.reprendre(e, t + 60000));
  assert.equal(e.pauseMs, 50000);
  assert.equal(MN.ecoule(e, t + 65000), 15000);
  assert.equal(MN.reprendre(e, t + 66000), false);
  assert.equal(MN.pause(q0(0), t), false); // sans minuterie, pas de pause
  assert.equal(MN.pause(e, t + 999000), false); // pas de pause après le zéro
});
essai('minuterie : + 15 s recule la fin, autant de fois que voulu (40 au plus)', () => {
  const e = q0(30), t = 1000000;
  assert.ok(MN.ajouter(e, t + 5000)); assert.ok(MN.ajouter(e, t + 6000));
  assert.equal(MN.accordee(e), 60);
  assert.equal(MN.reste(e, t + 10000), 50000);
  for (let k = 2; k < MN.MAX_AJOUTS; k++) assert.ok(MN.ajouter(e, t + 10000));
  assert.equal(MN.ajouter(e, t + 10000), false);
  assert.equal(MN.accordee(e), 30 + 15 * 40);
  assert.equal(MN.ajouter(q0(0), t), false); // sans minuterie
});
essai('minuterie : + 15 s après le zéro rouvre avec 15 s, le temps passé à zéro ne compte pas', () => {
  const e = q0(20), t = 1000000;
  assert.equal(MN.reste(e, t + 50000), 0); // 30 s après le zéro
  assert.ok(MN.ajouter(e, t + 50000));
  assert.equal(MN.reste(e, t + 50000), 15000);
  assert.equal(MN.ecoule(e, t + 50000), 20000);
  assert.equal(MN.accordee(e), 35);
  // en pause pendant l'ajout : le temps reste arrêté
  const f = q0(20); MN.pause(f, t + 10000); MN.ajouter(f, t + 30000);
  assert.equal(MN.reste(f, t + 40000), 25000);
});
essai('rapidité avec pause et ajouts : temps hors pause rapporté à la durée accordée', () => {
  const e = q0(30), t = 1000000;
  MN.pause(e, t + 10000); MN.reprendre(e, t + 70000); MN.ajouter(e, t + 75000); // 60 s de pause, puis + 15 s
  const ms = MN.ecoule(e, t + 85000); // 25 s réellement écoulées sur 45 accordées
  assert.equal(ms, 25000);
  assert.equal(B.points({ juste: true, ms }, { duree: MN.accordee(e) }).detail.rapidite, Math.round(20 * (1 - 25 / 45)));
  // une réponse pendant la pause : le temps du début de la pause, ni gain ni perte
  const f = q0(30); MN.pause(f, t + 6000);
  assert.equal(MN.ecoule(f, t + 6000), MN.ecoule(f, t + 600000));
  assert.equal(B.points({ juste: true, ms: MN.ecoule(f, t + 600000) }, { duree: 30 }).detail.rapidite, 16);
});
essai('rapidité : jamais plus de +20, jamais négative, quelles que soient pauses et ajouts', () => {
  const t = 1000000;
  let k = 0;
  for (const duree of MN.DUREES.filter(Boolean)) for (const ajouts of [0, 1, 3, 40]) for (const ms of [-1e9, -1, 0, 1, 7000, duree * 1000, 1e9, Infinity, NaN]) {
    const p = B.points({ juste: true, ms }, { duree: duree + 15 * ajouts });
    assert.ok(p.detail.rapidite >= 0 && p.detail.rapidite <= 20 && Number.isInteger(p.detail.rapidite), JSON.stringify([duree, ajouts, ms, p.detail.rapidite]));
    assert.ok(p.total <= 150 && p.total >= 0);
    k++;
  }
  // des pauses et des ajouts au hasard : le temps écoulé reste entre 0 et le temps réel, la rapidité entre 0 et 20
  let graine = 7; const hasard = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 500; i++) {
    const e = q0([20, 30, 45, 60, 90][i % 5]); let now = t;
    for (let j = 0; j < 12; j++) { now += Math.floor(hasard() * 20000); const a = hasard(); if (a < .3) MN.pause(e, now); else if (a < .6) MN.reprendre(e, now); else if (a < .75) MN.ajouter(e, now); }
    const ms = MN.ecoule(e, now);
    assert.ok(ms >= 0 && ms <= now - t, 'écoulé hors bornes');
    const r = B.points({ juste: true, ms }, { duree: MN.accordee(e) }).detail.rapidite;
    assert.ok(r >= 0 && r <= 20);
    assert.ok(MN.reste(e, now) >= 0 && MN.reste(e, now) <= MN.accordee(e) * 1000);
    k++;
  }
  assert.ok(k > 500);
});
essai('rapidité : ajouter du temps ne change pas l\'ordre des réponses', () => {
  const r = (ms, d) => B.points({ juste: true, ms }, { duree: d }).detail.rapidite;
  assert.ok(r(5000, 45) >= r(20000, 45) && r(5000, 30) >= r(20000, 30));
});
/* Changer d'avis : le dernier choix compte, la rapidité se mesure à l'instant du dernier changement. */
const egal = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const suivre = envois => envois.reduce((r, [v, k, ms]) => B.retenir(r, { v, k }, ms, egal), null);
const rap = (r, duree) => B.points({ juste: r.v === 1, ms: r.ms }, { duree }).detail.rapidite;
essai('changer d\'avis : faux puis juste, la rapidité à l\'instant du changement', () => {
  const r = suivre([[0, 0, 1000], [1, 1, 15000]]);
  assert.deepEqual(r, { v: 1, ms: 15000, k: 1 });
  assert.equal(rap(r, 30), 10); // et pas 19 : cliquer au hasard tout de suite puis corriger ne rapporte rien de plus
  assert.ok(rap(r, 30) < rap(suivre([[1, 0, 1000]]), 30));
});
essai('changer d\'avis : juste puis faux, la réponse finale est fausse', () => {
  const r = suivre([[1, 0, 2000], [3, 1, 9000]]);
  assert.equal(r.v, 3);
  assert.equal(B.points({ juste: r.v === 1, ms: r.ms }, { duree: 30, precedente: 'faux' }).total, 10); // ni rapidité ni rebond
});
essai('changer d\'avis : le même choix recliqué ne change ni la réponse ni l\'instant', () => {
  const r = suivre([[1, 0, 2000], [1, 1, 20000]]);
  assert.deepEqual([r.v, r.ms], [1, 2000]);
  const r2 = suivre([[1, 0, 2000], [1, 0, 20000]]); // un renvoi du même envoi
  assert.deepEqual(r2, { v: 1, ms: 2000, k: 0 });
});
essai('changer d\'avis : un envoi plus ancien, arrivé en retard, ne revient pas en arrière', () => {
  assert.deepEqual(suivre([[0, 0, 1000], [2, 2, 5000], [1, 1, 6000]]), { v: 2, ms: 5000, k: 2 });
});
essai('changer d\'avis : pas de « aucune réponse », 30 changements au plus', () => {
  const r = suivre([[1, 0, 1000]]);
  assert.equal(B.retenir(r, { v: null, k: 1 }, 2000, egal), r);
  assert.equal(B.retenir(r, { v: undefined, k: 1 }, 2000, egal), r);
  assert.equal(B.retenir(r, { v: 2, k: B.MAX_CHANGEMENTS + 1 }, 2000, egal), r);
  assert.equal(B.retenir(r, { v: 2, k: -1 }, 2000, egal), r);
  assert.equal(B.retenir(r, { v: 2, k: 1.5 }, 2000, egal), r);
  assert.equal(B.retenir(null, { v: null, k: 0 }, 2000, egal), null);
  assert.equal(B.retenir(r, { v: 2, k: B.MAX_CHANGEMENTS }, 2000, egal).v, 2);
});
essai('changer d\'avis pendant la pause : le temps du début de la pause', () => {
  const e = q0(30), t = 1000000;
  const r0 = B.retenir(null, { v: 0, k: 0 }, MN.ecoule(e, t + 4000), egal);
  MN.pause(e, t + 8000);
  const r1 = B.retenir(r0, { v: 1, k: 1 }, MN.ecoule(e, t + 40000), egal); // changé 32 s après le début de la pause
  assert.equal(r1.ms, 8000);
  assert.equal(rap(r1, MN.accordee(e)), Math.round(20 * (1 - 8 / 30)));
});
essai('changer d\'avis après un « + 15 s » : mesuré sur la durée accordée', () => {
  const e = q0(20), t = 1000000;
  const r0 = B.retenir(null, { v: 0, k: 0 }, MN.ecoule(e, t + 3000), egal);
  MN.ajouter(e, t + 50000); // après le zéro : la question rouvre avec 15 s, écoulé = 20 s
  const r1 = B.retenir(r0, { v: 1, k: 1 }, MN.ecoule(e, t + 55000), egal);
  assert.equal(r1.ms, 25000);
  assert.equal(rap(r1, MN.accordee(e)), Math.round(20 * (1 - 25 / 35)));
});
essai('changer d\'avis : les séries et le rebond se jugent sur la réponse finale', () => {
  const finales = [suivre([[0, 0, 1], [1, 1, 2]]), suivre([[1, 0, 1]]), suivre([[1, 0, 1], [2, 1, 2]])].map(r => r.v === 1 ? 'juste' : 'faux');
  assert.deepEqual(finales, ['juste', 'juste', 'faux']);
  assert.equal(B.serie(finales).casse, true);
  assert.equal(B.serie(finales.slice(0, 2)).n, 2);
});

/* T131b, défaut 1 : aucun téléphone ne touche à la réponse d'un·e autre. La page projetée relie l'identifiant à la clé
   publique de son appareil ; un envoi d'une autre clé (un faussaire qui a lu l'identifiant dans la présence) est ignoré,
   sans accusé ; l'accusé ne part que pour un envoi retenu. */
const ILYES = 'I'.repeat(86), FAUX = 'F'.repeat(86);
const recevoirTous = (lien, envois) => envois.reduce((e, [de, v, k, n, ms]) => { const x = B.recevoir(e.lien, e.rep, { de, v, k, n }, ms, egal); e.accuses.push(x.accuse); return { lien: x.lien, rep: x.rep, accuses: e.accuses }; }, { lien, rep: null, accuses: [] });
essai('défaut 1 : un faux envoi au nom d\'un·e autre, k = 30, après sa réponse : ignoré, sans accusé ; son vrai changement compte', () => {
  const e = recevoirTous(ILYES, [[ILYES, 1, 0, 'n0', 11000], [FAUX, 2, 30, 'nf', 11500], [ILYES, 3, 1, 'n1', 12000]]);
  assert.deepEqual(e.rep, { v: 3, ms: 12000, k: 1, n: 'n1' });
  assert.deepEqual(e.accuses, [true, false, true]);
  assert.equal(e.lien, ILYES);
});
essai('défaut 1 : devancer un·e élève (avant sa réponse, clé reliée par la présence) : ignoré', () => {
  const e = recevoirTous(ILYES, [[FAUX, 2, 30, 'nf', 1000], [FAUX, 2, 0, 'nf2', 1000], [ILYES, 1, 0, 'n0', 3000]]);
  assert.deepEqual(e.rep, { v: 1, ms: 3000, k: 0, n: 'n0' });
  assert.deepEqual(e.accuses, [false, false, true]);
});
essai('défaut 1 : une clé pas encore reliée l\'est au premier envoi accepté, puis tient', () => {
  const e = recevoirTous(null, [[ILYES, 1, 0, 'n0', 1000], [FAUX, 2, 30, 'nf', 2000]]);
  assert.equal(e.lien, ILYES); assert.deepEqual(e.accuses, [true, false]); assert.equal(e.rep.v, 1);
  assert.deepEqual(B.recevoir(null, null, { de: '', v: 1, k: 0, n: 'x' }, 0, egal), { lien: null, rep: null, accuse: false });
  assert.deepEqual(B.recevoir(null, null, { de: ILYES, v: null, k: 0, n: 'x' }, 0, egal), { lien: null, rep: null, accuse: false }); // refusé : ne relie rien
});
essai('défaut 1 : pas d\'accusé pour un changement ignoré ; le même envoi reçu deux fois en reçoit un', () => {
  const e = recevoirTous(ILYES, [[ILYES, 0, 0, 'n0', 1000], [ILYES, 2, 2, 'n2', 5000], [ILYES, 1, 1, 'n1', 6000], [ILYES, 2, 2, 'n2', 7000], [ILYES, 3, 2, 'n9', 7500]]);
  assert.deepEqual(e.rep, { v: 2, ms: 5000, k: 2, n: 'n2' });
  assert.deepEqual(e.accuses, [true, true, false, true, false]);
});
/* T131b, défaut 2 : le téléphone affiche et compte le choix que la page projetée a retenu (liste « retenus »). */
essai('défaut 2 : un changement arrivé après la fermeture : le téléphone retrouve le choix retenu et les mêmes points', () => {
  const envois = [['n0', 0, 2000], ['n1', 1, 19500]]; // faux à 2 s, puis la bonne réponse (1) à 19,5 s, arrivée trop tard
  const r = B.retenuParmi(envois, ['aaaaaaaaaaaaaaaa', 'n0']);
  assert.deepEqual(r, { v: 0, ms: 2000 });
  assert.equal(B.points({ juste: r.v === 1, ms: r.ms }, { duree: 20 }).total, 10); // comme la page projetée, et pas 110
  assert.deepEqual(B.retenuParmi(envois, ['n1']), { v: 1, ms: 19500 });
});
essai('défaut 2 : la première réponse arrivée trop tard : aucun choix retenu, 0 point des deux côtés', () => {
  assert.equal(B.retenuParmi([['n0', 1, 19900]], ['bbbbbbbbbbbbbbbb']), null);
  assert.equal(B.points(null, { duree: 20 }).total, 0);
  assert.equal(B.retenuParmi([], ['n0']), null); assert.equal(B.retenuParmi(null, ['n0']), null); assert.equal(B.retenuParmi([['n0', 1, 0]], null), null);
});
essai('défaut 2 : accusé perdu (A reçu, B retenu sans accusé, C trop tard) : le téléphone retrouve B', () => {
  assert.deepEqual(B.retenuParmi([['nA', 0, 1000], ['nB', 1, 5000], ['nC', 2, 19800]], ['nB']), { v: 1, ms: 5000 });
});

essai('durées accordées possibles', () => {
  for (const d of [0, 20, 30, 35, 45, 60, 90, 105, 620, 690]) assert.ok(MN.dureeAccordeeValide(d), d);
  for (const d of [-15, 1, 10, 15, 21, 46, 91, 635, 691, 3600, 2.5, NaN, '45']) assert.equal(MN.dureeAccordeeValide(d), false, String(d));
});
essai('séries : bonnes réponses d\'affilée, remises à zéro par une erreur ou une non-réponse', () => {
  assert.deepEqual(B.serie([]), { n: 0, palier: false, casse: false });
  assert.deepEqual(B.serie(['juste', 'juste']), { n: 2, palier: false, casse: false });
  assert.deepEqual(B.serie(['juste', 'juste', 'juste']), { n: 3, palier: true, casse: false });
  assert.deepEqual(B.serie(['juste', 'juste', 'juste', 'faux']), { n: 0, palier: false, casse: true });
  assert.deepEqual(B.serie(['juste', 'juste', null]), { n: 0, palier: false, casse: true });
  assert.deepEqual(B.serie(['juste', 'faux']), { n: 0, palier: false, casse: false }); // une série de 1 : rien à dire
  assert.equal(B.serie(Array(5).fill('juste')).palier, true);
  assert.equal(B.serie(Array(6).fill('juste')).palier, false);
  assert.equal(B.serie(Array(10).fill('juste')).palier, true);
  assert.equal(B.serie(['faux', 'juste', 'juste', 'juste']).n, 3);
});
essai('séries : le barème ne change pas (une série ne rapporte aucun point)', () => {
  assert.deepEqual(B.BAREME, { participation: 10, juste: 100, rapidite: 20, rebond: 30 });
  assert.equal(B.points({ juste: true, ms: 0 }, { duree: 0, precedente: 'juste' }).total, 110);
});

essai('pseudo : prénoms et pseudos acceptés', () => {
  for (const p of ['Kobalt', 'Zéphyr', 'Ixo', 'Pixel-42', "L'Orque", 'kiki_976', 'Néon M.', 'Кобальт', 'Ζέφυρος', 'نجمة']) assert.ok(Q.filtrerPseudo(p).ok, p);
  assert.equal(Q.filtrerPseudo('  Ixo   Neo  ').pseudo, 'Ixo Neo');
});
essai('pseudo : longueur bornée', () => {
  assert.equal(Q.filtrerPseudo('A').ok, false);
  assert.equal(Q.filtrerPseudo('Abcdefghijklmnopq').ok, false);
  assert.equal(Q.filtrerPseudo('Abcdefghijklmnop').ok, true);
});
essai('pseudo : caractères invisibles refusés', () => {
  for (const c of [0x200B, 0x200D, 0x202E, 0x2066, 0xFEFF, 0x00AD, 0x0007]) assert.equal(Q.filtrerPseudo('Ko' + String.fromCharCode(c) + 'balt').ok, false, c.toString(16));
});
essai('pseudo : rien d\'injectable', () => {
  for (const p of ['<b>Ixo</b>', 'Ixo"><img', '{{x}}', 'a&b', 'Ixo;drop', '../x', '😀😀']) assert.equal(Q.filtrerPseudo(p).ok, false, p);
});
essai('pseudo : la clé de comparaison ignore accents et casse', () => assert.equal(Q.clePseudo('Zéphyr'), Q.clePseudo('ZEPHYR')));
essai('pseudo : les autres écritures gardent une clé propre (jamais vide)', () => {
  assert.notEqual(Q.clePseudo('Кобальт'), ''); assert.notEqual(Q.clePseudo('Ζέφυρος'), ''); assert.notEqual(Q.clePseudo('نجمة'), '');
  assert.notEqual(Q.clePseudo('Кобальт'), Q.clePseudo('Ζέφυρος')); assert.notEqual(Q.clePseudo('نجمة'), Q.clePseudo('نور'));
});
essai('pseudo : mélange d\'écritures refusé, sosies ramenés à la même clé', () => {
  const a = String.fromCharCode(0x430), o = String.fromCharCode(0x43E); // а et о cyrilliques
  assert.equal(Q.filtrerPseudo('Kob' + a + 'lt').ok, false);           // un double visuel de « Kobalt »
  assert.equal(Q.clePseudo(String.fromCharCode(0x410, 0x412, 0x421)), Q.clePseudo('ABC')); // « АВС » tout cyrillique
  assert.equal(Q.clePseudo(String.fromCharCode(0x391, 0x392, 0x395)), Q.clePseudo('abe')); // « ΑΒΕ » tout grec
  assert.equal(Q.clePseudo('c' + o + 'l'), Q.clePseudo('col'));
});
essai('stockage : une entrée « eleve » périmée ou mal formée est effacée', () => {
  const m = new Map();
  globalThis.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
  const t = Date.now();
  m.set('quizz-nsi:eleve', JSON.stringify({ id: '0123456789abcdef', pseudo: 'Ixo', code: 'ABCD', jusqua: t - 1 }));
  assert.equal(Q.menage(t), true); assert.equal(m.has('quizz-nsi:eleve'), false);
  m.set('quizz-nsi:eleve', '{pas du json'); Q.menage(t); assert.equal(m.has('quizz-nsi:eleve'), false);
  m.set('quizz-nsi:eleve', JSON.stringify({ jusqua: t + 400 * 24 * 3600 * 1000 })); Q.menage(t); assert.equal(m.has('quizz-nsi:eleve'), false); // plus de 12 h : impossible
  m.set('quizz-nsi:eleve', JSON.stringify({ jusqua: t + 3600 * 1000 })); assert.equal(Q.menage(t), false); assert.equal(m.has('quizz-nsi:eleve'), true);
  // l'historique de séance suit les mêmes règles
  m.set('quizz-nsi:hist:0123456789abcdef', JSON.stringify({ id: '0123456789abcdef', jusqua: t - 1, ordre: [] })); Q.menage(t); assert.equal(m.has('quizz-nsi:hist:0123456789abcdef'), false);
  m.set('quizz-nsi:hist:0123456789abcdef', JSON.stringify({ id: 'autre', jusqua: t + 1000 })); Q.menage(t); assert.equal(m.has('quizz-nsi:hist:0123456789abcdef'), false);
  m.set('quizz-nsi:hist:0123456789abcdef', JSON.stringify({ id: '0123456789abcdef', jusqua: t + 1000 })); Q.menage(t); assert.equal(m.has('quizz-nsi:hist:0123456789abcdef'), true);
  m.set('theme', 'dark'); Q.menage(t); assert.equal(m.has('theme'), true); // les réglages ne sont pas concernés
  delete globalThis.localStorage;
});
essai('stockage : la progression du mode révision est gardée un jour au plus', () => {
  const m = new Map();
  globalThis.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
  const t = Date.now(), jour = 24 * 3600 * 1000;
  m.set('quizz-nsi:revision:piles-files', JSON.stringify({ t: t - jour - 1, sig: 1, premiers: {} })); Q.menage(t); assert.equal(m.has('quizz-nsi:revision:piles-files'), false);
  m.set('quizz-nsi:revision:piles-files', JSON.stringify({ premiers: {} })); Q.menage(t); assert.equal(m.has('quizz-nsi:revision:piles-files'), false); // sans date : d'avant la renumérotation
  m.set('quizz-nsi:revision:piles-files', JSON.stringify({ t: t + jour, sig: 1 })); Q.menage(t); assert.equal(m.has('quizz-nsi:revision:piles-files'), false); // date dans le futur
  m.set('quizz-nsi:revision:piles-files', JSON.stringify({ t: t - 3600 * 1000, sig: 1 })); Q.menage(t); assert.equal(m.has('quizz-nsi:revision:piles-files'), true);
  delete globalThis.localStorage;
});
essai('console : compacte, nom de l\'erreur en gras, tout est échappé', () => {
  const h = Q.console(["AttributeError: 'Pile' object has no attribute 'enfiler'. Did you mean: 'empiler'?", '<img src=x onerror=1>']);
  assert.ok(h.startsWith('<pre class="console"'));
  assert.ok(h.includes('<span class="c-err">AttributeError</span>'));
  assert.ok(h.includes('<span class="c-ch">&#39;empiler&#39;</span>'));
  assert.ok(!h.includes('<img') && h.includes('&lt;img'));
  assert.equal(Q.console([]), ''); assert.equal(Q.console(undefined), '');
});
essai('numérotation : toutes les questions notées comptent, pas le nuage de mots', () => {
  const c = { diapositives: [] }, l = [{ type: 'nuage' }, { type: 'question' }, { type: 'ligne' }, { type: 'question' }];
  Q.numeroter(c, l);
  assert.equal(c.total, 3); assert.deepEqual(l.map(d => d.numero), [undefined, 1, 2, 3]);
  assert.equal(Q.numQuestion(l[2], c), 'Question 2 sur 3'); assert.equal(Q.numQuestion(l[0], c), '');
});
essai('code de séance : lecture tolérante', () => {
  assert.equal(Q.lireCode(' abcd '), 'ABCD'); assert.equal(Q.lireCode('ab-cd'), 'ABCD');
  assert.equal(Q.lireCode('ABIO'), null); assert.equal(Q.lireCode('ABC'), null);
  for (let i = 0; i < 50; i++) assert.ok(Q.lireCode(Q.nouveauCode()));
});
essai('texte : tout est échappé', () => {
  assert.equal(Q.texte('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!Q.texte('`<script>`').includes('<script>'));
  assert.equal(Q.texte('**gras** et *it*'), '<strong>gras</strong> et <em>it</em>');
});
essai('coloration : mots-clés, chaînes, nombres, échappement', () => {
  const h = Q.colorerLigne('if x == "<b>": return 3 # fin');
  assert.ok(h.includes('<span class="c-mot">if</span>'));
  assert.ok(h.includes('<span class="c-ch">&quot;&lt;b&gt;&quot;</span>'));
  assert.ok(h.includes('<span class="c-nb">3</span>'));
  assert.ok(h.includes('<span class="c-com"># fin</span>'));
});
essai('schéma svg brut : script refusé', () => {
  assert.ok(!Q.schema({ type: 'svg', code: '<svg onload="alert(1)"></svg>' }).includes('onload'));
  assert.ok(Q.schema({ type: 'pile', elements: ['<a>'] }).includes('&lt;a&gt;'));
});
essai('schémas Python : les valeurs comme repr', () => {
  assert.equal(Q.enPython([1, 'chat', 2.36, 'a', true, false, null]), '[1, "chat", 2.36, "a", True, False, None]');
  const h = Q.schema({ type: 'liste', elements: ['a', true] });
  assert.ok(h.includes('&quot;a&quot;') && h.includes('True') && !h.includes('>true<'));
  assert.ok(Q.schema({ type: 'pile', elements: ['copie 1'] }).includes('>copie 1<')); // une étiquette reste sans guillemets
});
essai('contrôle léger d\'un cours', () => {
  const c = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'cours', 'piles-files.json'), 'utf8'));
  assert.deepEqual(Q.controlerCours(c), []);
  c.diapositives.find(d => d.type === 'question').options[0].juste = true;
  assert.equal(Q.controlerCours(c).length, 1);
});
essai('mélange : même graine, même ordre ; toutes les valeurs gardées ; graines différentes, ordres différents', () => {
  const l = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(Q.melanger(l, 42), Q.melanger(l, 42));
  assert.deepEqual(Q.melanger(l, 42).slice().sort((a, b) => a - b), l);
  assert.notDeepEqual(Q.melanger(l, 42), Q.melanger(l, 43));
  assert.deepEqual(l, Array.from({ length: 20 }, (_, i) => i)); // la liste d'origine n'est pas touchée
  assert.equal(Q.graine('q01'), Q.graine('q01')); assert.notEqual(Q.graine('q01'), Q.graine('q02'));
  // chaque place est à peu près équiprobable (4 réponses, 4000 tirages)
  const n0 = [0, 0, 0, 0];
  for (let g = 0; g < 4000; g++) n0[Q.melanger([0, 1, 2, 3], g * 2654435761 >>> 0).indexOf(0)]++;
  assert.ok(n0.every(x => x > 850 && x < 1150), n0.join(' '));
});
essai('mélange : le même que le vérificateur Python (outils/verifier_cours.py)', () => {
  assert.equal(Q.graine('a02'), 3771486418);
  assert.deepEqual(Q.melanger([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], Q.graine('a02')), [8, 5, 1, 3, 4, 7, 0, 6, 9, 2]);
});

/* ── Les autres types de questions (js/activites.js) ── */
const REL = { type: 'relier', id: 'a02', paires: [{ gauche: 'a', droite: '1' }, { gauche: 'b', droite: '2' }, { gauche: 'c', droite: '3' }, { gauche: 'd', droite: '4' }] };
const PUZ = { type: 'puzzle', id: 'a03', lignes: ['total = 0', 'for i in range(3):', '    total = total + i', 'print(total)'] };
const LIG = { type: 'ligne', id: 'a04', code: ['a = 1', 'b = 2', 'print(a + c)'], ligne: 3 };
const NUA = { type: 'nuage', id: 'a01' };
essai('nuage : un mot ou deux, filtrés', () => {
  assert.deepEqual(A.filtrerMot('  Répéter  '), { ok: true, mot: 'répéter' });
  assert.equal(A.filtrerMot('tant que').ok, true);
  assert.equal(A.filtrerMot("l'itération").ok, true);
  assert.equal(A.filtrerMot('Ζ').ok, false);
  for (const m of ['un deux trois', 'x'.repeat(25), '<b>x</b>', 'a&b', 'http://x.fr', 'javascript:x', '"x"', '😀😀', 'répé' + String.fromCharCode(0x200B) + 'ter', 'Nаdia' /* а cyrillique */, 42, null, {}, ['x']])
    assert.equal(A.filtrerMot(m).ok, false, String(m));
});
essai('nuage : proposer sans limite de nombre, les doublons deviennent des voix, un mot supprimé ne revient pas', () => {
  const n = A.nuageVide(), K = '0123456789abcdef', I = 'fedcba9876543210', Z = '00112233aabbccdd';
  assert.equal(A.proposer(n, K, 'Répéter'), 'ajoute');
  assert.equal(A.proposer(n, I, 'REPETER'), 'voix'); // même clé : une voix de plus, pas un doublon
  assert.equal(A.proposer(n, K, 'boucle'), 'ajoute');
  assert.equal(A.proposer(n, K, '<b>'), 'refuse');
  assert.deepEqual(A.affiches(n, 1), [{ k: 0, m: 'répéter', n: 2 }, { k: 1, m: 'boucle', n: 1 }]);
  assert.equal(A.voter(n, K, 1), false, 'pas de voix pour son propre mot');
  assert.equal(A.voter(n, I, 1), true); assert.equal(A.voter(n, I, 1), false, 'une voix par élève et par mot');
  assert.equal(A.voter(n, Z, 99), false, 'mot inconnu');
  assert.deepEqual(A.affiches(n, 2).map(w => w.m), ['répéter', 'boucle']);
  assert.equal(A.supprimer(n, 0), true);
  assert.deepEqual(A.affiches(n, 1).map(w => w.m), ['boucle']);
  assert.equal(A.proposer(n, Z, 'répéter'), 'supprime'); assert.equal(A.voter(n, Z, 0), false);
  assert.ok(n.supprimes.every(Number.isInteger), 'seule une empreinte du mot supprimé reste');
  for (let i = 0; i < 150; i++) A.proposer(n, Z, 'mot' + String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26)));
  assert.equal(n.mots.filter(w => w.de.includes(Z)).length, A.PAR_ELEVE_MAX, 'frein : 100 mots au plus par élève');
  assert.ok(A.affiches(n, 1).length <= A.AFFICHES_MAX);
  assert.deepEqual(A.valider({ type: 'nuage' }, { vote: 3 }), { vote: 3 });
  for (const r of [{ vote: -1 }, { vote: 3, x: 1 }, { vote: '3' }, {}]) assert.equal(A.valider({ type: 'nuage' }, r), null);
});
essai('autres types : réponses forgées refusées', () => {
  for (const r of [null, undefined, 1, 'x', [0, 1, 2], [0, 1, 2, 3, 4], [0, 0, 1, 2], [0, 1, 2, 9], [0, 1, 2, 1.5], [0, 1, 2, '3'], [-2, 1, 2, 3], { 0: 0 }])
    assert.equal(A.valider(REL, r), null, JSON.stringify(r));
  assert.deepEqual(A.valider(REL, [-1, 1, -1, 3]), [-1, 1, -1, 3]); // incomplète, sans doublon : acceptée, notée 2 sur 4
  for (const r of [[[0, 0], [1, 0], [2, 1]], [[0, 0], [0, 0], [2, 1], [3, 0]], [[0, 0], [1, 0], [2, 7], [3, 0]], [[0, 0], [1, 0], [2, 1], [4, 0]], [[0, 0, 0], [1, 0], [2, 1], [3, 0]], [0, 1, 2, 3]])
    assert.equal(A.valider(PUZ, r), null, JSON.stringify(r));
  for (const r of [-1, 3, 1.5, '1', [1], null]) assert.equal(A.valider(LIG, r), null, String(r));
  assert.equal(A.valider(NUA, '<script>'), null);
});
essai('autres types : la note (part juste) et le barème', () => {
  assert.deepEqual(A.noter(REL, [0, 1, 2, 3]), { juste: true, part: 1, detail: [true, true, true, true] });
  const n = A.noter(REL, [1, 0, 2, 3]);
  assert.equal(n.juste, false); assert.equal(n.part, 0.5);
  assert.equal(B.points({ juste: false, ms: 0, part: n.part }, { duree: 30, precedente: 'faux' }).total, 60); // 10 + 50, sans rapidité ni rebond
  assert.equal(B.points({ juste: true, ms: 0, part: 1 }, { duree: 30, precedente: 'faux' }).total, 160);
  assert.equal(A.noter(PUZ, [[0, 0], [1, 0], [2, 1], [3, 0]]).juste, true);
  assert.equal(A.noter(PUZ, [[0, 0], [1, 0], [2, 0], [3, 0]]).part, 0.75); // une ligne mal indentée
  assert.equal(A.noter(PUZ, [[1, 0], [0, 0], [2, 1], [3, 0]]).part, 0.5);
  assert.equal(A.noter(Object.assign({}, PUZ, { indentation: false }), [[0, 0], [1, 0], [2, 0], [3, 0]]).juste, true);
  assert.equal(A.noter(LIG, 2).juste, true); assert.equal(A.noter(LIG, 0).part, 0);
  assert.equal(A.noter(NUA, 'boucle'), null); // non noté
  assert.deepEqual(A.noter(REL, 'x'), { juste: false, part: 0, detail: [] });
});
essai('autres types : l\'ordre affiché n\'est jamais la solution du puzzle', () => {
  for (let k = 0; k < 300; k++) {
    const d = Object.assign({}, PUZ, { id: 'p' + k });
    assert.notDeepEqual(A.ordrePuzzle(d).map(i => d.lignes[i]), d.lignes);
  }
});
console.log(n + ' tests réussis');
