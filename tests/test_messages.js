// QuizzNSI : tests de la validation des messages du canal (js/messages.js), sans navigateur.
// Pour chaque type de message et chaque champ, y compris les champs imbriqués, une valeur forgée
// (balise, nombre énorme, négatif, décimal, objet, liste, chaîne très longue, booléen) fait rejeter
// le message entier. Lancement : node tests/test_messages.js
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
globalThis.location = { search: '' };
require(path.join(__dirname, '..', 'js', 'commun.js'));
require(path.join(__dirname, '..', 'js', 'chiffre.js'));
require(path.join(__dirname, '..', 'js', 'activites.js'));
const M = require(path.join(__dirname, '..', 'js', 'messages.js'));

const MOI = '0123456789abcdef', AUTRE = 'fedcba9876543210';
const BALISE = '<img src=x onerror="globalThis.__pwned=1">XSSMARK';
const FORGES = [BALISE, 1e300, -1, 2.5, Number.NaN, {}, { a: '<b>' }, [BALISE], 'x'.repeat(100000), true, undefined];
const bilan = () => ({ justes: 2, repondues: 3, serie: 1, meilleure: 2, rebonds: 1, suite: ['juste', 'faux', null] });

const CLE = { x: 'A'.repeat(43), y: 'B'.repeat(43) };
const VERS_ELEVE = {
  attente: { t: 'attente' },
  notion: { t: 'notion', cours: 'piles-files', n: 3, f: 2 },
  question: { t: 'question', cours: 'piles-files', qid: 'q01', reste: 30000, duree: 45, ferme: false, pause: false },
  fermee: { t: 'fermee', qid: 'q01' },
  recus: { t: 'recus', qid: 'q01', n: ['00112233aabbccdd', 'ffeeddccbbaa9988'] },
  retire: { t: 'retire', id: MOI },
  refus: { t: 'refus', id: MOI, raison: 'pris' },
  correction: { t: 'correction', cours: 'piles-files', qid: 'q02', precedente: 'q01', bonne: 3, rep: [1, 2, 0, 0],
    bareme: { participation: 10, juste: 100, rapidite: 20, rebond: 30 }, duree: 45, podium: [{ pseudo: 'Kobalt', total: 400, place: 1 }], series: true },
  fin: { t: 'fin', cours: 'piles-files', podium: [{ pseudo: 'Ixo', total: 500, place: 1 }] },
  nuage: { t: 'nuage', cours: 'demo-types-de-questions', qid: 'a01', mots: [{ k: 0, m: 'boucle', n: 3 }, { k: 4, m: 'tant-que', n: 1 }] },
  corrige: { t: 'corrige', cours: 'revision-conditions-boucles', qid: 'a02', precedente: 'q05', duree: 0, nb: 3, justes: 1, podium: [{ pseudo: 'Kobalt', total: 400, place: 1 }], series: false },
};
const VERS_HOTE = { bonjour: { t: 'bonjour', id: MOI }, rep: { t: 'rep', de: CLE, iv: 'abcdefghijklmnop', donnees: 'QUJDRA' } };

// tous les chemins des feuilles d'un objet (les champs à forger)
function chemins(o, base = []) {
  if (o === null || typeof o !== 'object') return [base];
  const l = [];
  for (const k of Object.keys(o)) l.push(...chemins(o[k], base.concat(k)));
  return l.length ? l : [base];
}
const copie = o => JSON.parse(JSON.stringify(o));
function remplacer(o, chemin, v) { const c = copie(o); let x = c; for (const k of chemin.slice(0, -1)) x = x[k]; x[chemin[chemin.length - 1]] = v; return c; }
// toutes les chaînes d'une sortie validée : elles doivent venir de listes permises ou de formats stricts
function chaines(o, l = []) { if (typeof o === 'string') l.push(o); else if (o && typeof o === 'object') Object.values(o).forEach(v => chaines(v, l)); return l; }

let n = 0;
for (const [type, m] of Object.entries(VERS_ELEVE)) {
  const ok = M.versEleve(copie(m), MOI);
  assert.ok(ok, 'message valide refusé : ' + type);
  for (const s of chaines(ok)) assert.ok(/^[a-z0-9-]{1,60}$/.test(s) || ['pris', 'invalide'].includes(s) || s === 'Kobalt' || s === 'Ixo', 'chaîne inattendue : ' + s);
  // ce qu'un message diffuse : jamais l'identifiant, la réponse ni les points d'un·e élève
  assert.ok(!('res' in ok) && !('moi' in ok), type + ' : des résultats individuels');
  for (const ch of chemins(m)) {
    if (ch.length === 1 && ch[0] === 't') continue;
    const lire = (o, c) => c.reduce((x, k) => x[k], o);
    for (const v of typeof lire(m, ch) === 'number' ? FORGES.concat(['3']) : FORGES) {
      if (typeof v === 'boolean' && typeof lire(m, ch) === 'boolean') continue; // un booléen reste un booléen permis
      const forge = remplacer(m, ch, v);
      const r = M.versEleve(forge, MOI);
      // un champ facultatif retiré (undefined) peut rester valide s'il est permis absent : jamais ici
      assert.equal(r, null, `${type}.${ch.join('.')} = ${String(v).slice(0, 30)} accepté`);
      n++;
    }
  }
  // une clé inconnue fait rejeter le message
  assert.equal(M.versEleve(Object.assign(copie(m), { html: BALISE }), MOI), null, type + ' avec une clé en plus');
  n++;
}
for (const [type, m] of Object.entries(VERS_HOTE)) {
  assert.ok(M.versHote(copie(m)), 'message valide refusé : ' + type);
  for (const ch of chemins(m)) {
    if (ch[0] === 't') continue;
    for (const v of FORGES) { assert.equal(M.versHote(remplacer(m, ch, v)), null, `${type}.${ch.join('.')} accepté`); n++; }
  }
}
// l'ancien format, avec les résultats de chaque élève, est refusé
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.correction), { res: { [AUTRE]: { c: 1 } } }), MOI), null);
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.fin), { res: {} }), MOI), null);
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.recus), { ids: [MOI] }), MOI), null);
// le contenu déchiffré d'une réponse
assert.deepEqual(M.reponse({ id: MOI, qid: 'q01', c: 2, n: '00112233aabbccdd' }), { id: MOI, qid: 'q01', c: 2, n: '00112233aabbccdd' });
for (const f of FORGES) for (const k of ['id', 'qid', 'c', 'n']) { assert.equal(M.reponse(Object.assign({ id: MOI, qid: 'q01', c: 2, n: '00112233aabbccdd' }, { [k]: f })), null); n++; }
n += 3;
// les autres types : r est un mot (nuage), un entier (ligne), une liste d'entiers (relier) ou de paires (puzzle)
const R = { id: MOI, qid: 'a02', n: '00112233aabbccdd' };
for (const r of ['boucle', 2, [0, 1, -1], [[0, 0], [1, 1]], { vote: 3 }]) assert.deepEqual(M.reponse(Object.assign({}, R, { r })), Object.assign({}, R, { r }), JSON.stringify(r));
for (const r of [1e300, -1, 2.5, 200, {}, { a: '<b>' }, 'x'.repeat(65), '', true, null, [], ['<b>'], [[0, 0, 0]], [[0, 9]], [1, [0, 0]], Array(17).fill(0), [16], [{}], { vote: -1 }, { vote: '3' }, { vote: 1e6 }, { vote: 1, html: '<b>' }, { voter: 1 }]) {
  assert.equal(M.reponse(Object.assign({}, R, { r })), null, JSON.stringify(r)); n++;
}
assert.equal(M.reponse(Object.assign({}, R, { r: 1, c: 1 })), null); // jamais les deux
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.corrige), { justes: 4 }), MOI), null); // plus de justes que de réponses
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.corrige), { mots: ['boucle'] }), MOI), null); // aucun mot du nuage
// le nuage : un mot qui ne passe pas le filtre tel quel (majuscule, balise, invisible, trois mots), un numéro en double,
// une voix nulle, l'auteur·rice d'un mot, une liste trop longue : tout le message est rejeté
const nuageAvec = mots => Object.assign(copie(VERS_ELEVE.nuage), { mots });
for (const mots of [[{ k: 0, m: 'Boucle', n: 1 }], [{ k: 0, m: '<b>x</b>', n: 1 }], [{ k: 0, m: 'bou' + String.fromCharCode(0x200B) + 'cle', n: 1 }], [{ k: 0, m: 'un deux trois', n: 1 }],
  [{ k: 0, m: 'boucle', n: 1 }, { k: 0, m: 'tant', n: 1 }], [{ k: 0, m: 'boucle', n: 0 }], [{ k: 0, m: 'boucle', n: 1, de: 'Kobalt' }], [{ k: 0, m: 'boucle', n: 1, pseudo: 'Ixo' }],
  Array.from({ length: 201 }, (_, k) => ({ k, m: 'mot', n: 1 }))]) { assert.equal(M.versEleve(nuageAvec(mots), MOI), null, JSON.stringify(mots).slice(0, 80)); n++; }
assert.deepEqual(M.versEleve(nuageAvec([]), MOI).mots, []); // un mot supprimé : la liste suivante ne le porte plus
n += 3;
// la minuterie (T131) : durée accordée = 0 ou une durée de départ + k × 15 s (k de 0 à 40) ; reste borné par cette durée ;
// la pause seulement avec une minuterie et une question ouverte
const questionAvec = c => Object.assign(copie(VERS_ELEVE.question), c);
for (const c of [{ pause: true }, { duree: 60, reste: 60000 }, { duree: 90, reste: 0 }, { duree: 620, reste: 1 }, { duree: 0, reste: null }, { duree: 75, reste: 75000, pause: true }])
  assert.ok(M.versEleve(questionAvec(c), MOI), 'question valide refusée : ' + JSON.stringify(c));
for (const c of [{ pause: true, ferme: true }, { pause: true, duree: 0, reste: null }, { duree: 635 }, { duree: 46 }, { duree: 91 }, { duree: 3600 }, { duree: 10 }, { duree: 15 },
  { duree: 45, reste: 45001 }, { duree: 45, reste: null }, { duree: 0, reste: 1000 }, { duree: 0, reste: 0 }, { duree: 45, reste: 1.5 }, { duree: -15 }, { duree: 45.0000001 }, { pause: 1 }, { pause: 'oui' }, { pause: null }]) {
  assert.equal(M.versEleve(questionAvec(c), MOI), null, 'question forgée acceptée : ' + JSON.stringify(c)); n++;
}
const sansPause = copie(VERS_ELEVE.question); delete sansPause.pause;
assert.equal(M.versEleve(sansPause, MOI), null, 'question sans « pause »'); n++;
for (const t of ['correction', 'corrige']) {
  for (const duree of [46, 635, 3600, -1, 91]) { assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE[t]), { duree }), MOI), null, t + ' duree ' + duree); n++; }
  for (const duree of [0, 20, 35, 105, 620]) assert.ok(M.versEleve(Object.assign(copie(VERS_ELEVE[t]), { duree }), MOI), t + ' duree valide ' + duree);
  for (const series of [1, 'oui', null, {}]) { assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE[t]), { series }), MOI), null, t + ' series ' + series); n++; }
  const sans = copie(VERS_ELEVE[t]); delete sans.series; assert.equal(M.versEleve(sans, MOI), null, t + ' sans series'); n++;
  // jamais la série d'un·e élève dans le message
  assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE[t]), { serie: 3 }), MOI), null); n++;
}
// les mêmes bornes que la minuterie du moteur (js/bareme.js)
const MN = require(path.join(__dirname, '..', 'js', 'bareme.js')).minuterie;
for (let d = -20; d <= 800; d++) assert.equal(M.dureeAccordee(d), MN.dureeAccordeeValide(d), 'durée ' + d);

// types inconnus, prototypes, valeurs non objets
for (const v of [null, 3, 'attente', [], { t: 'inconnu' }, { t: { toString: () => 'attente' } }, JSON.parse('{"t":"attente","__proto__":{"x":1}}')]) {
  assert.equal(M.versEleve(v, MOI), null, JSON.stringify(v)); assert.equal(M.versHote(v), null); n++;
}
// présence : pseudo filtré, rôle permis, clés permises
assert.deepEqual(M.presence({ id: MOI, pseudo: 'Zéphyr', role: 'eleve', presence_ref: 'x' }), { id: MOI, role: 'eleve', pseudo: 'Zéphyr' });
assert.deepEqual(M.presence({ id: MOI, role: 'hote', cle: CLE }), { id: MOI, role: 'hote', cle: CLE });
assert.equal(M.presence({ id: MOI, role: 'hote', cle: { x: BALISE, y: 'B'.repeat(43) } }), null);
assert.equal(M.presence({ id: MOI, pseudo: BALISE, role: 'eleve' }).pseudo, null);
assert.equal(M.presence({ id: MOI, pseudo: 'x'.repeat(100000), role: 'eleve' }), null);
assert.equal(M.presence({ id: '<b>', pseudo: 'Ixo', role: 'eleve' }), null);
assert.equal(M.presence({ id: MOI, pseudo: 'Ixo', role: 'admin' }), null);
assert.equal(M.presence({ id: MOI, pseudo: 'Ixo', role: 'eleve', html: '<b>' }), null);
assert.equal(M.presence({ id: MOI, pseudo: {}, role: 'eleve' }), null);
n += 7;
assert.equal(globalThis.__pwned, undefined);
console.log(n + ' messages forgés rejetés, aucun accepté');
