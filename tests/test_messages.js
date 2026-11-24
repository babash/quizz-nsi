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
  fermee: { t: 'fermee', qid: 'q01', retenus: ['00112233aabbccdd', 'ffeeddccbbaa9988'] },
  recus: { t: 'recus', qid: 'q01', n: ['00112233aabbccdd', 'ffeeddccbbaa9988'] },
  retire: { t: 'retire', id: MOI },
  refus: { t: 'refus', id: MOI, raison: 'pris' },
  correction: { t: 'correction', cours: 'piles-files', qid: 'q02', precedente: 'q01', bonne: 3, rep: [1, 2, 0, 0],
    bareme: { participation: 10, juste: 100, rapidite: 20, rebond: 30 }, duree: 45, podium: [{ pseudo: 'Kobalt', total: 400, place: 1 }], series: true, retenus: ['0011223344556677'] },
  fin: { t: 'fin', cours: 'piles-files', podium: [{ pseudo: 'Ixo', total: 500, place: 1 }] },
  nuage: { t: 'nuage', cours: 'demo-types-de-questions', qid: 'a01', mots: [{ k: 0, m: 'boucle', n: 3 }, { k: 4, m: 'tant-que', n: 1 }] },
  corrige: { t: 'corrige', cours: 'revision-conditions-boucles', qid: 'a02', precedente: 'q05', duree: 0, nb: 3, justes: 1, podium: [{ pseudo: 'Kobalt', total: 400, place: 1 }], series: false, retenus: ['0011223344556677', '8899aabbccddeeff'] },
};
const VERS_HOTE = { bonjour: { t: 'bonjour', id: MOI }, rep: { t: 'rep', iv: 'abcdefghijklmnop', donnees: 'QUJD'.repeat(133) + 'QU' } };

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
// T131b, écoute passive : l'enveloppe d'une réponse ne porte ni clé ni identifiant, et a une longueur constante
assert.equal(globalThis.QuizzNSI.chiffre.DONNEES, 534);
for (const f of [{ de: CLE }, { id: MOI }, { donnees: 'QUJD'.repeat(133) + 'Q' }, { donnees: 'QUJD'.repeat(134) }, { donnees: 'QUJDRA' }]) {
  assert.equal(M.versHote(Object.assign(copie(VERS_HOTE.rep), f)), null, 'enveloppe ' + Object.keys(f)); n++;
}
// l'ancien format, avec les résultats de chaque élève, est refusé
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.correction), { res: { [AUTRE]: { c: 1 } } }), MOI), null);
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.fin), { res: {} }), MOI), null);
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.recus), { ids: [MOI] }), MOI), null);
// le contenu déchiffré d'une réponse
assert.deepEqual(M.reponse({ id: MOI, qid: 'q01', c: 2, n: '00112233aabbccdd', k: 0 }), { id: MOI, qid: 'q01', c: 2, n: '00112233aabbccdd', k: 0 });
for (const f of FORGES) for (const k of ['id', 'qid', 'c', 'n', 'k']) { assert.equal(M.reponse(Object.assign({ id: MOI, qid: 'q01', c: 2, n: '00112233aabbccdd', k: 0 }, { [k]: f })), null); n++; }
// changer d'avis : le numéro du choix k (0 à 30) est obligatoire ; « aucune réponse » n'existe pas
const C = { id: MOI, qid: 'q01', c: 2, n: '00112233aabbccdd', k: 0 };
assert.ok(M.reponse(Object.assign({}, C, { k: 30 })));
for (const v of [{ k: 31 }, { k: -1 }, { k: 1.5 }, { k: '3' }, { k: null }, { k: 1e9 }, { c: null }, { c: -1 }, { c: 4 }, { c: undefined }]) { assert.equal(M.reponse(Object.assign({}, C, v)), null, JSON.stringify(v)); n++; }
const sansK = Object.assign({}, C); delete sansK.k; assert.equal(M.reponse(sansK), null); n++;
const sansC = Object.assign({}, C); delete sansC.c; assert.equal(M.reponse(sansC), null); n++; // ni c ni r : pas de « je retire mon choix »
for (const r of [null, [], '', -1]) { assert.equal(M.reponse(Object.assign({}, sansC, { r })), null, 'r = ' + JSON.stringify(r)); n++; }
n += 3;
// les autres types : r est un mot (nuage), un entier (ligne), une liste d'entiers (relier) ou de paires (puzzle)
const R = { id: MOI, qid: 'a02', n: '00112233aabbccdd', k: 3 };
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

// T131b, défaut 2 : « retenus » (les nombres tirés au hasard des envois retenus) à la fermeture et à la correction :
// obligatoire, liste de nombres au format strict, sans doublon, jamais plus que de réponses ; rien d'autre (ni identifiant
// ni choix) n'y passe
for (const t of ['fermee', 'correction', 'corrige']) {
  const sans = copie(VERS_ELEVE[t]); delete sans.retenus; assert.equal(M.versEleve(sans, MOI), null, t + ' sans retenus'); n++;
  assert.deepEqual(M.versEleve(Object.assign(copie(VERS_ELEVE[t]), { retenus: [] }), MOI).retenus, []);
  for (const rt of [null, 'abc', {}, [MOI, MOI], ['0011223344556677', '0011223344556677'], ['ABCDEF0123456789'], ['0011'], [1], [[MOI]], [{ id: MOI, c: 2 }], [MOI + 'aa'], Array(100001).fill(MOI)]) {
    assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE[t]), { retenus: rt }), MOI), null, t + ' retenus ' + JSON.stringify(rt).slice(0, 40)); n++;
  }
}
assert.equal(M.versEleve(Object.assign(copie(VERS_ELEVE.corrige), { nb: 1 }), MOI), null, 'corrige : plus de retenus que de réponses'); n++;
// T131b, défaut 1 : la présence d'un·e élève porte la clé publique de son appareil (facultative, au format strict)
assert.deepEqual(M.presence({ id: MOI, pseudo: 'Ixo', role: 'eleve', cle: CLE }), { id: MOI, role: 'eleve', pseudo: 'Ixo', cle: CLE });
assert.equal(M.presence({ id: MOI, pseudo: 'Ixo', role: 'eleve' }).cle, null);
for (const cle of [null, BALISE, {}, { x: 'A'.repeat(43) }, { x: 'A'.repeat(43), y: 'B'.repeat(42) }, { x: 'A'.repeat(43), y: 'B'.repeat(43), d: 'C'.repeat(43) }, { x: BALISE, y: 'B'.repeat(43) }, ['A'.repeat(43), 'B'.repeat(43)]]) {
  assert.equal(M.presence({ id: MOI, pseudo: 'Ixo', role: 'eleve', cle }), null, 'clé de présence ' + JSON.stringify(cle).slice(0, 40)); n++;
}

// types inconnus, prototypes, valeurs non objets
for (const v of [null, 3, 'attente', [], { t: 'inconnu' }, { t: { toString: () => 'attente' } }, JSON.parse('{"t":"attente","__proto__":{"x":1}}')]) {
  assert.equal(M.versEleve(v, MOI), null, JSON.stringify(v)); assert.equal(M.versHote(v), null); n++;
}
// présence : pseudo filtré, rôle permis, clés permises
assert.deepEqual(M.presence({ id: MOI, pseudo: 'Zéphyr', role: 'eleve', presence_ref: 'x' }), { id: MOI, role: 'eleve', pseudo: 'Zéphyr', cle: null });
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
// T131b, défaut 1, le chiffrement : la paire de clés gardée sur le téléphone redonne la même clé publique après un
// rechargement ; un faussaire qui met la clé publique d'un·e autre sur son enveloppe ne peut pas être déchiffré
(async () => {
  const C = globalThis.QuizzNSI.chiffre, h = await C.hote(), e1 = await C.eleve();
  assert.ok(C.estGarde(e1.cle));
  const e2 = await C.eleve(JSON.parse(JSON.stringify(e1.cle)));
  assert.deepEqual(e2.publique, e1.publique, 'la clé gardée redonne la même clé publique');
  const E1 = C.empreinte(e1.publique);
  // trois élèves (clés reliées par la présence) et un faussaire
  const autres = [await C.eleve(), await C.eleve()], faux = await C.eleve(), connues = [E1, ...autres.map(e => C.empreinte(e.publique))];
  const env = await e2.chiffrer({ id: MOI, qid: 'q01', c: 2, n: '00112233aabbccdd', k: 0 }, h.publique);
  const lu = await h.dechiffrer(env, connues);
  assert.equal(lu.objet.c, 2); assert.equal(lu.de, E1, 'la page projetée sait quelle clé a déchiffré');
  // un envoi au nom d'un·e autre, avec la clé du faussaire (inconnue) : illisible pour la page projetée
  const fe = await faux.chiffrer({ id: MOI, qid: 'q01', c: 3, n: '00112233aabbccdd', k: 30 }, h.publique);
  assert.equal(await h.dechiffrer(fe, connues), null, 'clé inconnue : illisible'); n++;
  assert.equal(await h.dechiffrer(env, connues.slice(1)), null, 'clé non reliée : illisible'); n++;
  assert.equal(await h.dechiffrer(Object.assign({}, env, { iv: 'AAAAAAAAAAAAAAAA' }), connues), null); n++;
  // écoute passive : un tiers qui connaît toutes les clés publiques et tous les identifiants ne relie aucune enveloppe
  // à un·e élève : mêmes champs, même longueur, aucune valeur publique dedans, quel que soit le contenu (choix, k, puzzle, mot)
  const contenus = [{ id: MOI, qid: 'q01', c: 0, n: '00112233aabbccdd', k: 0 }, { id: MOI, qid: 'q01', c: 3, n: '00112233aabbccdd', k: 30 },
    { id: AUTRE, qid: 'a02', r: Array.from({ length: 16 }, (_, i) => [15, 6]), n: '00112233aabbccdd', k: 12 }, { id: AUTRE, qid: 'a01', r: 'ççççççççççç ççççççççççç', n: '00112233aabbccdd', k: 0 },
    { id: AUTRE, qid: 'a01', r: { vote: 99999 }, n: '00112233aabbccdd', k: 0 }];
  const publics = [MOI, AUTRE, ...[e1, ...autres].flatMap(e => [e.publique.x, e.publique.y])];
  const envs = [];
  for (const [i, c] of contenus.entries()) envs.push(await [e1, ...autres][i % 3].chiffrer(c, h.publique));
  for (const v of envs) {
    assert.deepEqual(Object.keys(v).sort(), ['donnees', 'iv'], 'enveloppe : iv et donnees seulement');
    assert.equal(v.donnees.length, C.DONNEES, 'enveloppe de longueur constante');
    assert.ok(!publics.some(x => JSON.stringify(v).includes(x)), 'une valeur publique dans l\'enveloppe');
    assert.ok(M.versHote(Object.assign({ t: 'rep' }, v)));
    n++;
  }
  for (const [i, v] of envs.entries()) assert.equal((await h.dechiffrer(v, connues)).de, C.empreinte([e1, ...autres][i % 3].publique));
  await assert.rejects(e1.chiffrer({ r: 'x'.repeat(400) }, h.publique)); // trop long : jamais envoyé (la longueur trahirait)
  // le coût pour 35 élèves : une tentative par clé reliée, en parallèle
  const classe = []; for (let i = 0; i < 34; i++) classe.push(await C.eleve());
  const toutes = [...classe.map(e => C.empreinte(e.publique)), E1];
  await h.dechiffrer(env, toutes); // clés communes dérivées une fois (cache)
  let t = process.hrtime.bigint(); for (let i = 0; i < 50; i++) assert.ok(await h.dechiffrer(env, toutes)); t = Number(process.hrtime.bigint() - t) / 50e6;
  console.log('coût : ' + t.toFixed(2) + ' ms par réponse reçue pour 35 élèves (35 tentatives, clés communes en cache)');
  for (const g of [null, {}, { x: e1.cle.x, y: e1.cle.y }, Object.assign({}, e1.cle, { d: BALISE }), Object.assign({}, e1.cle, { z: 1 }), Object.assign({}, e1.cle, { d: 'A'.repeat(43) })]) {
    const e = await C.eleve(g); assert.ok(C.estGarde(e.cle)); n++;
    if (g && g.d === 'A'.repeat(43)) assert.notDeepEqual(e.publique, e1.publique); // une clé illisible : une nouvelle paire
  }
  assert.equal(C.empreinte(e1.publique), e1.publique.x + e1.publique.y); assert.equal(C.empreinte({ x: 'a' }), null);
  console.log(n + ' messages forgés rejetés, aucun accepté');
})().catch(e => { console.error(e); process.exit(1); });
