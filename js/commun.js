/* QuizzNSI : outils communs à toutes les pages (MIT, Babash - NSI Tani Malandi).
   - lecture d'un cours (cours/<id>.json) et contrôle léger de sa forme ;
   - mise en forme du texte (`code`, **gras**, *italique*), toujours échappée ;
   - coloration du Python ;
   - schémas SVG des piles et des files, dessinés à partir des données ;
   - formes et lettres des options (A ▲, B ◆, C ●, D ■) ;
   - pseudo filtré, code de séance, stockage de l'appareil, thème clair ou obscur. */
(function (racine) {
  'use strict';
  const Q = racine.QuizzNSI = racine.QuizzNSI || {};
  const LETTRES = ['A', 'B', 'C', 'D'];
  const NOMS_FORMES = ['triangle', 'losange', 'cercle', 'carré'];
  Q.LETTRES = LETTRES;
  Q.LETTRES_LONGUES = 'ABCDEFGHIJKLMNOP'.split('');
  Q.NOMS_FORMES = NOMS_FORMES;

  /* ── Texte ───────────────────────────────── */
  const ECH = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const echapper = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ECH[c]);
  Q.echapper = echapper;

  // `code` → <code>, ==mot-clé== → <strong class="cle">, **gras** → <strong>, *italique* → <em>. Le code n'est pas retouché.
  Q.texte = function (s) {
    return String(s == null ? '' : s).split('`').map((morceau, i) => {
      if (i % 2) return '<code class="py">' + colorerLigne(morceau) + '</code>';
      return echapper(morceau)
        // ==mot-clé== : en couleur, et aussi en gras souligné (la couleur ne porte jamais seule l'information)
        .replace(/==(.+?)==/g, '<strong class="cle">$1</strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
    }).join('');
  };

  /* ── Coloration du Python ────────────────── */
  const MOTS = new Set('False None True and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
  const NATIFS = new Set('print len range list reversed int str float bool dict set tuple min max sum abs input isinstance enumerate sorted append pop insert'.split(' '));
  const MORCEAU = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_À-ÿ][A-Za-z_0-9À-ÿ]*)|(\s+)|(.)/g;
  function colorerLigne(ligne) {
    let html = '', m, precedent = '';
    MORCEAU.lastIndex = 0;
    while ((m = MORCEAU.exec(ligne)) !== null) {
      if (m[0] === '') { MORCEAU.lastIndex++; continue; }
      const [t, com, ch, nb, id] = m;
      if (com) html += '<span class="c-com">' + echapper(com) + '</span>';
      else if (ch) html += '<span class="c-ch">' + echapper(ch) + '</span>';
      else if (nb) html += '<span class="c-nb">' + nb + '</span>';
      else if (id) {
        const suite = ligne.slice(MORCEAU.lastIndex);
        if (MOTS.has(id)) html += '<span class="c-mot">' + id + '</span>';
        else if (precedent === 'def' || precedent === 'class') html += '<span class="c-def">' + echapper(id) + '</span>';
        else if (/^\s*\(/.test(suite)) html += '<span class="' + (NATIFS.has(id) ? 'c-nat' : 'c-fn') + '">' + echapper(id) + '</span>';
        else if (id === 'self') html += '<span class="c-self">self</span>';
        else html += echapper(id);
      } else html += echapper(t);
      if (id) precedent = id; else if (!/^\s+$/.test(t)) precedent = '';
    }
    return html;
  }
  Q.colorerLigne = colorerLigne;

  // Un bloc de code numéroté, avec des guides d'indentation (lecture seule).
  Q.blocCode = function (lignes, opts) {
    opts = opts || {};
    const num = opts.numeros === true || (opts.numeros !== false && lignes.length > 2);
    const corps = lignes.map((l, i) => {
      const ind = (l.match(/^ */) || [''])[0].length;
      const guides = Array.from({ length: Math.floor(ind / 4) }, () => '<span class="guide">    </span>').join('');
      const reste = l.slice(Math.floor(ind / 4) * 4);
      // opts.marques : { indice: 'fautive' | 'choisie' | 'corrigee' } (ligne fautive, réponse choisie, ligne corrigée)
      const mq = opts.marques && opts.marques[i] ? ' ' + opts.marques[i] : '';
      return '<span class="ligne' + mq + '">' + (num ? '<span class="num" aria-hidden="true">' + (i + 1) + '</span>' : '') + guides + colorerLigne(reste) + '</span>';
    }).join('');
    return '<pre class="code' + (num ? ' numerote' : '') + '"><code>' + corps + '</code></pre>';
  };

  // La console Python : une ligne par ligne de sortie, compacte, sous le code. Le nom de l'erreur est en
  // gras et en couleur, les chaînes citées en italique (lisible aussi en noir et blanc). Le texte vient du
  // fichier du cours (vérifié par exécution), jamais du canal ; tout est échappé.
  Q.console = function (lignes) {
    if (!Array.isArray(lignes) || !lignes.length) return '';
    const ligne = l => {
      const m = /^([A-Za-z_][\w.]*(?:Error|Exception|Warning|Interrupt|Exit))(:?)(.*)$/.exec(String(l));
      const reste = s => echapper(s).replace(/&#39;([^&]*?)&#39;|'([^']*?)'/g, (x) => '<span class="c-ch">' + x + '</span>');
      return '<span class="ligne">' + (m ? '<span class="c-err">' + echapper(m[1]) + '</span>' + m[2] + reste(m[3]) : reste(String(l))) + '</span>';
    };
    return '<pre class="console" aria-label="Console Python"><code>' + lignes.map(ligne).join('') + '</code></pre>';
  };

  /* ── Formes des options ──────────────────── */
  const CHEMINS = [
    '<path d="M12 3 22 21H2z"/>',                 // A : triangle
    '<path d="M12 2 22 12 12 22 2 12z"/>',          // B : losange
    '<circle cx="12" cy="12" r="10"/>',             // C : cercle
    '<rect x="3" y="3" width="18" height="18" rx="2"/>' // D : carré
  ];
  Q.forme = (i, classe) => '<svg class="forme f' + i + (classe ? ' ' + classe : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + CHEMINS[i] + '</svg>';
  Q.pastille = i => '<span class="pastille p' + i + '">' + Q.forme(i) + '<b>' + LETTRES[i] + '</b></span>';

  /* ── Schémas ─────────────────────────────── */
  const tx = (x, y, t, cl, ancre) => '<text x="' + x + '" y="' + y + '" class="' + (cl || '') + '" text-anchor="' + (ancre || 'middle') + '">' + echapper(t) + '</text>';
  const boite = (x, y, l, h, t, cl) => '<rect x="' + x + '" y="' + y + '" width="' + l + '" height="' + h + '" rx="5" class="' + (cl || 'case') + '"/>' + tx(x + l / 2, y + h / 2 + 6, t, 'val');
  const svg = (l, h, contenu, titre) => '<svg class="schema-svg" viewBox="0 0 ' + l + ' ' + h + '" width="' + l + '" height="' + h + '" role="img" aria-label="' + echapper(titre) + '"><title>' + echapper(titre) + '</title>' + contenu + '</svg>';
  const largeurTexte = t => Math.max(1, String(t).length) * 10 + 28;
  const fleche = (x1, y1, x2, y2) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="trait" marker-end="url(#pointe)"/>';
  const defs = '<defs><marker id="pointe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" class="pointe"/></marker></defs>';

  // Une pile : elements du bas vers le haut.
  function dessinPile(elements, opts) {
    opts = opts || {};
    const H = 34, l = Math.max(110, ...elements.map(largeurTexte)), marge = opts.sansEtiquette ? 8 : 104;
    const n = elements.length, haut = 28 + Math.max(n, 1) * (H + 4) + 12;
    let c = defs;
    // le récipient : un U ouvert vers le haut
    c += '<path d="M' + (marge - 6) + ' 18 V' + (haut - 6) + ' H' + (marge + l + 6) + ' V18" class="bac"/>';
    elements.forEach((e, i) => { const y = haut - 10 - (i + 1) * (H + 4) + 4; c += boite(marge, y, l, H, e, i === n - 1 ? 'case sommet' : 'case'); });
    if (!n) c += tx(marge + l / 2, haut - 22, 'vide', 'muet');
    if (n && !opts.sansEtiquette) { const y = haut - 10 - n * (H + 4) + 4 + H / 2; c += tx(marge - 32, y + 5, 'sommet', 'etiq', 'end') + fleche(marge - 26, y, marge - 4, y); }
    const titre = opts.titre || ('Pile, du haut vers le bas : ' + (n ? elements.slice().reverse().join(', ') : 'vide'));
    return svg(marge + l + 14, haut, c, titre);
  }
  // Une file : elements de la tête vers la queue (la tête à gauche).
  function dessinFile(elements, opts) {
    opts = opts || {};
    const H = 36, larg = elements.map(largeurTexte), y = 36;
    let x = 92, c = defs;
    c += tx(46, 20, 'tête', 'etiq') + tx(46, 34, '(sortie)', 'muet petit');
    elements.forEach((e, i) => { c += boite(x, y, larg[i], H, e, i === 0 ? 'case sommet' : 'case'); x += larg[i] + 6; });
    if (!elements.length) { c += tx(x + 40, y + H / 2 + 6, 'vide', 'muet'); x += 80; }
    c += fleche(86, y + H / 2, 10, y + H / 2);
    c += fleche(x + 84, y + H / 2, x + 6, y + H / 2);
    c += tx(x + 46, 20, 'queue', 'etiq') + tx(x + 46, 34, '(entrée)', 'muet petit');
    const titre = opts.titre || ('File, de la tête vers la queue : ' + (elements.length ? elements.join(', ') : 'vide'));
    return svg(x + 96, y + H + 10, c, titre);
  }
  // Une valeur Python écrite comme Python l'afficherait (à la manière de repr) : True, False, None,
  // les chaînes entre guillemets (doubles, comme dans le code du cours), les nombres tels quels.
  const enPython = v => v === true ? 'True' : v === false ? 'False' : v === null ? 'None'
    : typeof v === 'string' ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
    : Array.isArray(v) ? '[' + v.map(enPython).join(', ') + ']' : String(v);
  Q.enPython = enPython;
  function dessinListe(brut, legende) {
    const elements = brut.map(enPython);
    const H = 36, l = Math.max(56, ...elements.map(largeurTexte)), n = elements.length;
    let c = '';
    elements.forEach((e, i) => { const x = 10 + i * (l + 4); c += boite(x, 24, l, H, e, i === n - 1 ? 'case sommet' : 'case') + tx(x + l / 2, 16, String(i - n), 'muet petit') + tx(x + l / 2, 80, String(i), 'etiq'); });
    c += tx(10, 98, 'indices', 'muet petit', 'start');
    return svg(20 + n * (l + 4), 104, c, 'Liste Python ' + enPython(brut) + ' : indices de 0 à ' + (n - 1) + ', ou de ' + (-n) + ' à -1');
  }
  function dessinDecalage(elements) {
    const H = 34, l = 50, n = elements.length;
    let c = defs + tx(6, 20, 'avant', 'muet petit', 'start') + tx(6, 104, 'après pop(0)', 'muet petit', 'start');
    elements.forEach((e, i) => { const x = 10 + i * (l + 6); c += boite(x, 26, l, H, e, i === 0 ? 'case barre' : 'case'); if (i) c += boite(x - l - 6, 110, l, H, e) + fleche(x + l / 2, 26 + H + 2, x - 6 - l / 2, 108); });
    return svg(20 + n * (l + 6), 150, c, 'pop(0) retire ' + elements[0] + ' : les ' + (n - 1) + ' autres éléments avancent d\'une case vers le début');
  }
  function dessinDeuxPiles(s) {
    const g = dessinPile(s.gauche.elements, { sansEtiquette: true, titre: s.gauche.nom }), d = dessinPile(s.droite.elements, { sansEtiquette: true, titre: s.droite.nom });
    return '<div class="deux-piles"><figure><div>' + g + '</div><figcaption><code>' + echapper(s.gauche.nom) + '</code></figcaption></figure>'
      + '<div class="entre">' + (s.fleche ? '<span>' + echapper(s.fleche) + '</span>' : '') + '<svg viewBox="0 0 60 20" aria-hidden="true">' + defs + fleche(4, 10, 56, 10) + '</svg></div>'
      + '<figure><div>' + d + '</div><figcaption><code>' + echapper(s.droite.nom) + '</code></figcaption></figure></div>';
  }
  Q.schema = function (s) {
    if (!s || typeof s !== 'object') return '';
    let corps = '';
    // un schéma « Python » (déduit d'un code, ou marqué python) montre les valeurs comme Python ;
    // les autres montrent des étiquettes (« copie 1 », « taxi »)
    const py = s.python === true || !!s.variable || Array.isArray(s.code);
    const val = l => (py ? (l || []).map(enPython) : (l || []));
    if (s.type === 'pile') corps = dessinPile(val(s.elements));
    else if (s.type === 'file') corps = dessinFile(val(s.elements));
    else if (s.type === 'liste') corps = dessinListe(s.elements || []);
    else if (s.type === 'decalage') corps = dessinDecalage(s.elements || []);
    else if (s.type === 'deux-piles') corps = dessinDeuxPiles(Object.assign({}, s, { gauche: Object.assign({}, s.gauche, { elements: val(s.gauche.elements) }), droite: Object.assign({}, s.droite, { elements: val(s.droite.elements) }) }));
    else if (s.type === 'etapes') corps = '<ol class="etapes">' + (s.etapes || []).map(e => '<li><div>' + (s.structure === 'file' ? dessinFile(val(e.elements), {}) : dessinPile(val(e.elements), { sansEtiquette: true })) + '</div><code>' + Q.colorerLigne(e.op) + '</code></li>').join('') + '</ol>';
    else if (s.type === 'svg' && typeof s.code === 'string' && /^\s*<svg/.test(s.code) && !/<script|\son[a-z]+\s*=|javascript:/i.test(s.code)) corps = s.code;
    return '<figure class="schema schema-' + echapper(s.type) + '">' + corps + (s.legende ? '<figcaption>' + Q.texte(s.legende) + '</figcaption>' : '') + '</figure>';
  };

  /* ── Lecture d'un cours ──────────────────── */
  Q.idCours = function () {
    const p = new URLSearchParams(location.search).get('cours') || 'piles-files';
    return /^[a-z0-9-]{1,60}$/.test(p) ? p : 'piles-files';
  };
  Q.chargerCours = async function (id) {
    let rep;
    try { rep = await fetch('cours/' + id + '.json', { cache: 'no-cache' }); }
    catch (e) { throw new Error('Le fichier du cours n\'a pas pu être lu. Ouvre la page depuis le site (une adresse en https://), pas depuis un fichier de l\'ordinateur.'); }
    if (!rep.ok) throw new Error('Le cours « ' + id + ' » est introuvable (erreur ' + rep.status + ').');
    const cours = await rep.json();
    const pb = Q.controlerCours(cours);
    if (pb.length) throw new Error('Le fichier du cours n\'est pas conforme : ' + pb.join(' ; ') + '. Lance outils/verifier_cours.py.');
    cours.questions = cours.diapositives.filter(d => d.type === 'question');
    cours.questions.forEach((q, i) => { q.numero = i + 1; q.bonne = q.options.findIndex(o => o.juste === true); });
    // les autres types de questions (nuage de mots, relier, puzzle de code, ligne fautive) : js/activites.js
    cours.interactifs = cours.diapositives.filter(d => Q.INTERACTIFS.includes(d.type));
    // toutes les questions notées comptent (à choix, relier, puzzle, ligne fautive ; pas le nuage de mots) :
    // « Question 12 sur 12 » ; une question à choix garde son rang parmi toutes
    Q.numeroter(cours, cours.interactifs);
    return cours;
  };
  Q.numeroter = function (cours, liste) {
    const notees = liste.filter(d => d.type !== 'nuage');
    notees.forEach((d, i) => { d.numero = i + 1; });
    cours.total = notees.length;
    return notees;
  };
  // « Question 3 sur 12 », pour une question à choix comme pour les autres types notés
  Q.numQuestion = (d, cours) => d.type !== 'nuage' && Number.isInteger(d.numero) ? 'Question ' + d.numero + ' sur ' + cours.total : '';
  // Contrôle léger, dans le navigateur ; le contrôle complet est outils/verifier_cours.py.
  Q.INTERACTIFS = ['question', 'nuage', 'relier', 'puzzle', 'ligne'];
  Q.controlerCours = function (c) {
    const pb = [];
    if (!c || c.format !== 'quizz-nsi/1') pb.push('format inconnu');
    if (!c || !Array.isArray(c.diapositives)) { pb.push('aucune diapositive'); return pb; }
    c.diapositives.forEach((d, i) => {
      if (d && d.type !== 'question' && Q.INTERACTIFS.includes(d.type) && Q.activites) { const p = Q.activites.controler(d); if (p) pb.push('diapositive ' + (i + 1) + ' : ' + p); return; }
      if (d.type !== 'question') return;
      if (!Array.isArray(d.options) || d.options.length !== 4) pb.push('diapositive ' + (i + 1) + ' : 4 options attendues');
      else if (d.options.filter(o => o.juste === true).length !== 1) pb.push('diapositive ' + (i + 1) + ' : une seule option juste');
    });
    return pb;
  };

  /* ── Pseudo ──────────────────────────────── */
  // Un prénom ou un pseudo : 2 à 16 caractères, lettres (accents compris), chiffres, espace, tiret,
  // apostrophe, point, tiret bas. Tout caractère invisible ou de contrôle est refusé.
  Q.PSEUDO_MAX = 16;
  Q.filtrerPseudo = function (brut) {
    if (typeof brut !== 'string') return { ok: false, raison: 'Écris un prénom ou un pseudo.' };
    if (/[\p{C}\p{Zl}\p{Zp}]/u.test(brut)) return { ok: false, raison: 'Ce pseudo contient un caractère invisible : écris-le de nouveau, au clavier.' };
    const p = brut.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if ([...p].length < 2) return { ok: false, raison: 'Deux caractères au moins.' };
    if ([...p].length > Q.PSEUDO_MAX) return { ok: false, raison: Q.PSEUDO_MAX + ' caractères au plus.' };
    if (!/^[\p{L}\p{M}\p{Nd}][\p{L}\p{M}\p{Nd} '’._-]*$/u.test(p)) return { ok: false, raison: 'Seulement des lettres, des chiffres, des espaces et - \' . _' };
    if (ecritures(p).size > 1) return { ok: false, raison: 'Écris le pseudo dans une seule écriture (pas de lettres latines mêlées à des lettres cyrilliques, grecques…).' };
    return { ok: true, pseudo: p };
  };
  // Les écritures des lettres d'un pseudo (latine, cyrillique, grecque, arabe…) : on n'en accepte qu'une,
  // pour qu'une lettre d'une autre écriture ne fabrique pas un double visuel (« Nаdia » avec un а cyrillique).
  const ECRITURES = ['Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Armenian', 'Georgian', 'Devanagari', 'Bengali', 'Thai', 'Hangul', 'Han', 'Hiragana', 'Katakana', 'Ethiopic', 'Tifinagh']
    .map(n => [n, new RegExp('\\p{Script=' + n + '}', 'u')]);
  function ecritures(p) {
    const vues = new Set();
    for (const c of p) {
      if (!/\p{L}/u.test(c)) continue;
      const e = ECRITURES.find(([, r]) => r.test(c));
      vues.add(e ? e[0] : 'autre');
    }
    // le japonais mêle légitimement kanji, hiragana et katakana
    if ([...vues].every(v => ['Han', 'Hiragana', 'Katakana'].includes(v)) && vues.size > 1) return new Set(['japonais']);
    return vues;
  }
  Q.ecritures = ecritures;
  // La clé de comparaison de deux pseudos : sans accents, sans casse, sans ponctuation, en gardant les
  // lettres de toutes les écritures ; les lettres cyrilliques et grecques qui ressemblent à une lettre
  // latine sont ramenées à cette lettre (« АВС » cyrillique et « ABC » latin ont la même clé).
  const SOSIES = { 'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'һ': 'h', 'ӏ': 'l', 'ԛ': 'q', 'ԝ': 'w', 'ү': 'y',
    'α': 'a', 'β': 'b', 'ε': 'e', 'ζ': 'z', 'η': 'n', 'ι': 'i', 'κ': 'k', 'μ': 'u', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ω': 'w' };
  Q.clePseudo = p => [...String(p).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()]
    .map(c => SOSIES[c] || c).filter(c => /[\p{L}\p{N}]/u.test(c)).join('');

  /* ── Ménage du stockage ──────────────────── */
  // L'entrée « eleve » (code, pseudo, identifiant) et l'historique de séance « hist:<identifiant> »
  // sont effacés à la fin de la séance (par la page élève), et sinon au premier chargement d'une page de
  // QuizzNSI après 12 heures ; une entrée mal formée est effacée au premier chargement.
  Q.DUREE_ELEVE = 12 * 3600 * 1000;
  // La progression du mode révision (« quizz-nsi:revision:<cours> ») est gardée un jour au plus.
  Q.DUREE_REVISION = 24 * 3600 * 1000;
  Q.menage = function (maintenant) {
    const t = maintenant || Date.now();
    let efface = false;
    try {
      const rev = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^quizz-nsi:revision:/.test(k)) rev.push(k); }
      for (const k of rev) {
        let v = null; try { v = JSON.parse(localStorage.getItem(k)); } catch (e) { v = null; }
        const ok = v && typeof v === 'object' && Number.isFinite(v.t) && v.t <= t + 60000 && t - v.t <= Q.DUREE_REVISION;
        if (!ok) { localStorage.removeItem(k); efface = true; }
      }
    } catch (e) { /* stockage bloqué : rien à effacer */ }
    try {
      const cles = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === 'quizz-nsi:eleve' || /^quizz-nsi:hist:/.test(k)) cles.push(k); }
      for (const k of cles) {
        let v = null; try { v = JSON.parse(localStorage.getItem(k)); } catch (e) { v = null; }
        const ok = v && typeof v === 'object' && Number.isFinite(v.jusqua) && v.jusqua > t && v.jusqua <= t + Q.DUREE_ELEVE
          && (k === 'quizz-nsi:eleve' || k === 'quizz-nsi:hist:' + v.id);
        if (!ok) { localStorage.removeItem(k); efface = true; }
      }
    } catch (e) { /* stockage bloqué : rien à effacer */ }
    return efface;
  };

  /* ── Code de séance ──────────────────────── */
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O, faciles à confondre
  Q.nouveauCode = () => { const a = new Uint8Array(4); crypto.getRandomValues(a); return [...a].map(x => ALPHA[x % 24]).join(''); };
  Q.lireCode = function (t) {
    const c = String(t || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I');
    return /^[A-Z]{4}$/.test(c) && ![...c].some(x => x === 'I' || x === 'O') ? c : null;
  };
  Q.nouvelId = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };

  /* ── Hasard reproductible ────────────────── */
  // Un mélange qui dépend d'une graine : la même graine donne le même ordre (pour retrouver l'ordre après un
  // rechargement, ou pour que tous les appareils d'une séance voient le même ordre).
  Q.graine = function (texte) { let h = 0x811c9dc5; for (const c of String(texte)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
  Q.hasard = function (graine) {
    let a = graine >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  Q.melanger = function (liste, graine) {
    const l = liste.slice(), r = Q.hasard(graine);
    for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
    return l;
  };

  /* ── Stockage de l'appareil (une commodité : la page marche sans) ── */
  Q.stock = {
    lire(k, defaut) { try { const v = JSON.parse(localStorage.getItem('quizz-nsi:' + k)); return v == null ? defaut : v; } catch (e) { return defaut; } },
    ecrire(k, v) { try { localStorage.setItem('quizz-nsi:' + k, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } },
    oublier(k) { try { localStorage.removeItem('quizz-nsi:' + k); } catch (e) { /* rien */ } },
  };
  Q.session = {
    lire(k, defaut) { try { const v = JSON.parse(sessionStorage.getItem('quizz-nsi:' + k)); return v == null ? defaut : v; } catch (e) { return defaut; } },
    ecrire(k, v) { try { sessionStorage.setItem('quizz-nsi:' + k, JSON.stringify(v)); } catch (e) { /* rien */ } },
    oublier(k) { try { sessionStorage.removeItem('quizz-nsi:' + k); } catch (e) { /* rien */ } },
  };

  /* ── Thème clair ou obscur ───────────────── */
  // La clé « theme » du site Ressources NSI et SNT (même stockage : même adresse babash.github.io) : « light », « dark »,
  // ou absente pour suivre l'appareil. js/socle.js l'applique avant l'affichage ; le bouton bascule et garde le choix.
  const FOND = { light: '#FFFFFF', dark: '#0E0C14' }; // la barre du navigateur : le fond du site
  Q.theme = function () {
    const r = document.documentElement;
    let t = null; try { t = localStorage.getItem('theme'); } catch (e) { t = null; }
    if (t === 'light' || t === 'dark') r.dataset.theme = t;
    const sombre = () => r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const barre = () => document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', r.dataset.theme ? FOND[r.dataset.theme] : /dark/.test(m.getAttribute('media') || '') ? FOND.dark : FOND.light));
    barre();
    document.querySelectorAll('[data-bascule-theme]').forEach(b => {
      // le libellé dit ce que fait le bouton (pas d'état « enfoncé » : ce n'est pas un filtre)
      b.textContent = sombre() ? 'Affichage clair' : 'Affichage obscur';
      b.addEventListener('click', () => {
        r.dataset.theme = sombre() ? 'light' : 'dark';
        try { localStorage.setItem('theme', r.dataset.theme); } catch (e) { /* stockage bloqué : le choix vaut pour cette page */ }
        document.querySelectorAll('[data-bascule-theme]').forEach(x => { x.textContent = sombre() ? 'Affichage clair' : 'Affichage obscur'; });
        barre();
      });
    });
  };

  Q.$ = id => document.getElementById(id);
  /* Créer un élément sans HTML : les enfants texte passent par des nœuds texte (jamais innerHTML).
     C'est la seule façon d'afficher une valeur reçue par le canal ou lue dans le stockage. */
  Q.el = function (tag, attrs) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || /^on/i.test(k)) continue;
      if (k === 'class') e.className = String(v); else e.setAttribute(k, String(v));
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(x => { if (x != null) e.appendChild(typeof x === 'object' ? x : document.createTextNode(String(x))); });
      else e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    return e;
  };
  /* La flamme d'une série (T131) : un dessin original en SVG (contour plein et cœur plein, lisible en noir et blanc),
     toujours suivi du nombre en texte (« 3 d'affilée ») ; palier : petite animation à 3, 5 et 10 (coupée si l'élève a
     demandé moins d'animations, css/seance.css). Construite élément par élément, sans HTML. */
  Q.flamme = function (n, palier) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'flamme-svg'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const trace = (d, cls) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', cls); svg.appendChild(p); };
    trace('M12 1.5C13.2 5.4 18.5 8 18.5 14.2A6.5 6.5 0 0 1 5.5 14.2C5.5 10.6 7.6 8.7 8.6 6.2C9.6 8.1 10.3 9.2 10.6 10.4C11.9 8 12.6 5 12 1.5Z', 'flamme-tour');
    trace('M12.2 11.2C13.4 13.4 15.4 14.6 15.4 17.2A3.4 3.4 0 0 1 8.6 17.2C8.6 15.4 10 14.6 10.6 13.2C11.1 14 11.4 14.5 11.5 15C12.2 13.9 12.5 12.6 12.2 11.2Z', 'flamme-coeur');
    const nb = Number.isSafeInteger(n) && n >= 0 ? n : 0;
    return Q.el('span', { class: 'flamme' + (palier ? ' palier' : '') }, svg, Q.el('span', { class: 'flamme-nb' }, nb + ' d\'affilée'));
  };
  // Un fragment de HTML produit par le moteur à partir du fichier du cours (contenu local, échappé).
  Q.fragmentCours = function (html) { const t = document.createElement('template'); t.innerHTML = html; return t.content; };
  Q.annoncer = function (texte) { const z = Q.$('annonce'); if (z) { z.textContent = ''; setTimeout(() => { z.textContent = texte; }, 30); } };
  Q.erreurPage = function (conteneur, message) {
    conteneur.innerHTML = '<div class="alerte" role="alert"><p><strong>Le cours ne peut pas s\'afficher.</strong></p><p>' + echapper(message) + '</p></div>';
  };
  if (typeof localStorage !== 'undefined') Q.menage();
})(typeof window !== 'undefined' ? window : globalThis);
