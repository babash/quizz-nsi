/* QuizzNSI : répondre aux autres types de questions, au téléphone et en révision (MIT, Babash - NSI Tani Malandi).
   Q.activiteUI(d, { reponse, onValider, libelle }) renvoie { noeud, bloquer(), marquer(detail), valeur(), renommer(texte) }.
   En séance, l'élève peut changer d'avis : après « Valider », la réponse reste modifiable et le bouton devient
   « Changer ma réponse » (js/rejoindre.js) jusqu'à la fin du temps ou la correction.
   - nuage : un champ (un mot ou deux), filtré avant l'envoi (js/activites.js) ;
   - relier : une liste déroulante par élément de gauche (accessible au clavier et au lecteur d'écran) ;
   - puzzle : chaque ligne est un bouton ; on la choisit, puis « Monter », « Descendre », « Indenter »,
     « Désindenter » (ou Alt + flèches) ;
   - ligne : chaque ligne du code est un bouton ; on touche celle qui contient l'erreur.
   Tout est construit élément par élément ; le texte vient du fichier du cours (Q.texte, échappé), et le mot
   tapé par l'élève ne s'affiche que par textContent. */
(function (racine) {
  'use strict';
  const Q = racine.QuizzNSI, el = Q.el, A = () => Q.activites;
  const riche = (tag, attrs, texte) => { const n = el(tag, attrs); n.appendChild(Q.fragmentCours(Q.texte(texte))); return n; };
  let compteur = 0;

  function nuage(d, o) {
    const id = 'mot' + (++compteur);
    const champ = el('input', { type: 'text', id, maxlength: String(A().MOT_MAX + 6), autocomplete: 'off', spellcheck: 'false', autocapitalize: 'none', 'aria-describedby': id + 'a ' + id + 'e' });
    const err = el('p', { class: 'erreur-champ', id: id + 'e', role: 'alert' });
    const btn = el('button', { type: 'submit', class: 'bouton fort' }, o.libelle || 'Envoyer');
    const ton = el('p', { class: 'nuage-ton', hidden: '' });
    const f = el('form', { class: 'nuage-form', novalidate: '' }, el('label', { for: id }, 'Ton mot (un ou deux)'), champ,
      el('p', { class: 'aide', id: id + 'a' }, 'De 2 à ' + A().MOT_MAX + ' caractères. Il s\'affichera au tableau, sans ton pseudo.'), err, btn, ton);
    const montrer = mot => { ton.hidden = false; ton.textContent = ''; ton.append('Ton mot : ', el('strong', {}, mot)); };
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const r = A().filtrerMot(champ.value);
      err.textContent = r.ok ? '' : r.raison;
      if (!r.ok) { champ.focus(); return; }
      montrer(r.mot);
      o.onValider(r.mot);
    });
    if (o.reponse) { champ.value = o.reponse; montrer(o.reponse); }
    return { noeud: f, renommer(t) { btn.textContent = t; }, bloquer() { champ.disabled = true; btn.disabled = true; }, marquer() {}, valeur: () => A().filtrerMot(champ.value).ok ? A().filtrerMot(champ.value).mot : null };
  }

  function relier(d, o) {
    const ordre = A().ordreDroite(d), n = d.paires.length;
    const droite = el('ol', { class: 'r-droite' }, ordre.map((k, j) => { const li = el('li', {}, el('span', { class: 'r-num' }, Q.LETTRES_LONGUES[j])); li.appendChild(riche('span', {}, d.paires[k].droite)); return li; }));
    const selects = [];
    const lignes = d.paires.map((p, i) => {
      const id = 'rel' + (++compteur);
      const s = el('select', { id }, el('option', { value: '' }, 'Choisir…'), ordre.map((k, j) => el('option', { value: String(k) }, Q.LETTRES_LONGUES[j] + ' · ' + A().brut(d.paires[k].droite).slice(0, 60))));
      selects.push(s);
      const lab = el('label', { for: id }, el('span', { class: 'r-num' }, String(i + 1)));
      lab.appendChild(riche('span', {}, p.gauche));
      lab.appendChild(el('span', { class: 'visuel-cache' }, ' : va avec'));
      return el('li', { class: 'r-ligne' }, lab, s, el('span', { class: 'r-marque', 'aria-hidden': 'true' }));
    });
    const btn = el('button', { type: 'button', class: 'bouton fort', disabled: '' }, o.libelle || 'Valider');
    const valeur = () => selects.map(s => s.value === '' ? -1 : +s.value);
    const maj = () => { btn.disabled = valeur().some(x => x < 0); };
    selects.forEach((s, i) => s.addEventListener('change', () => {
      // une réponse de droite ne va qu'avec un élément de gauche : on la retire de l'autre
      if (s.value !== '') selects.forEach((x, j) => { if (j !== i && x.value === s.value) { x.value = ''; Q.annoncer('La réponse ' + Q.LETTRES_LONGUES[ordre.indexOf(+s.value)] + ' est retirée de l\'élément ' + (j + 1) + '.'); } });
      maj();
    }));
    btn.addEventListener('click', () => { const r = A().valider(d, valeur()); if (r) o.onValider(r); });
    if (Array.isArray(o.reponse)) o.reponse.forEach((k, i) => { if (selects[i] && k >= 0) selects[i].value = String(k); });
    maj();
    const noeud = el('div', { class: 'relier' }, el('p', { class: 'fb-titre' }, 'Les réponses'), droite, el('p', { class: 'fb-titre' }, 'À relier'), el('ol', { class: 'r-gauche' }, lignes), el('p', {}, btn));
    return {
      noeud, valeur, renommer(t) { btn.textContent = t; },
      bloquer() { selects.forEach(s => { s.disabled = true; }); btn.disabled = true; },
      marquer(det) { lignes.forEach((li, i) => { li.classList.toggle('ok', det[i] === true); li.classList.toggle('ko', det[i] === false); li.querySelector('.r-marque').textContent = det[i] ? '✓' : det[i] === false ? '✗' : ''; }); },
    };
  }

  function puzzle(d, o) {
    const ind = A().avecIndent(d);
    // état : [indice de la ligne dans la solution, indentation]
    let etat = Array.isArray(o.reponse) ? o.reponse.map(x => [x[0], x[1]]) : A().ordrePuzzle(d).map(k => [k, ind ? 0 : A().indentDe(d.lignes[k])]);
    let choisie = 0, verrou = false;
    const liste = el('ol', { class: 'puzzle', 'aria-label': 'Les lignes du programme, dans l\'ordre actuel' });
    const annonce = (p, quoi) => Q.annoncer((quoi ? quoi + ' ' : '') + 'Ligne ' + (p + 1) + ' sur ' + etat.length + (ind ? ', indentation ' + etat[p][1] : '') + ' : ' + d.lignes[etat[p][0]].trim());
    function dessiner(focus) {
      liste.textContent = '';
      etat.forEach(([k, n], p) => {
        const code = el('code', { class: 'py' }); code.appendChild(Q.fragmentCours(Q.colorerLigne(d.lignes[k].trim())));
        const guides = el('span', { class: 'p-guides', 'aria-hidden': 'true' }, Array.from({ length: n }, () => el('span', { class: 'guide' }, '    ')));
        const b = el('button', { type: 'button', class: 'p-ligne', 'aria-pressed': String(p === choisie), 'aria-label': 'Ligne ' + (p + 1) + (ind ? ', indentation ' + n : '') + ' : ' + d.lignes[k].trim() }, el('span', { class: 'num', 'aria-hidden': 'true' }, String(p + 1)), guides, code);
        if (verrou) b.disabled = true;
        b.addEventListener('click', () => { choisie = p; dessiner(p); annonce(p, 'Choisie :'); });
        b.addEventListener('keydown', ev => {
          if (!ev.altKey) return;
          const a = { ArrowUp: () => bouger(-1), ArrowDown: () => bouger(1), ArrowLeft: () => indenter(-1), ArrowRight: () => indenter(1) }[ev.key];
          if (a) { ev.preventDefault(); choisie = p; a(); }
        });
        liste.appendChild(el('li', {}, b));
      });
      if (focus != null) { const b = liste.querySelectorAll('.p-ligne')[focus]; if (b) b.focus(); }
    }
    function bouger(sens) {
      const q = choisie + sens; if (verrou || q < 0 || q >= etat.length) return;
      [etat[choisie], etat[q]] = [etat[q], etat[choisie]]; choisie = q; dessiner(q); annonce(q, sens < 0 ? 'Montée :' : 'Descendue :');
    }
    function indenter(sens) {
      if (verrou || !ind) return;
      etat[choisie][1] = Math.max(0, Math.min(A().INDENT_MAX, etat[choisie][1] + sens)); dessiner(choisie); annonce(choisie, sens > 0 ? 'Indentée :' : 'Désindentée :');
    }
    const outil = (texte, aide, f) => { const b = el('button', { type: 'button', class: 'bouton petit', title: aide }, texte); b.addEventListener('click', f); return b; };
    const outils = el('div', { class: 'p-outils', role: 'group', 'aria-label': 'Déplacer la ligne choisie' },
      outil('↑ Monter', 'Alt + flèche haut', () => bouger(-1)), outil('↓ Descendre', 'Alt + flèche bas', () => bouger(1)),
      ind ? outil('⇤ Désindenter', 'Alt + flèche gauche', () => indenter(-1)) : null, ind ? outil('⇥ Indenter', 'Alt + flèche droite', () => indenter(1)) : null);
    const btn = el('button', { type: 'button', class: 'bouton fort' }, o.libelle || 'Valider');
    btn.addEventListener('click', () => { const r = A().valider(d, etat); if (r) o.onValider(r); });
    dessiner(null);
    const noeud = el('div', { class: 'puzzle-zone' }, el('p', { class: 'aide' }, 'Touche une ligne pour la choisir, puis déplace-la' + (ind ? ' ou change son indentation' : '') + '. Au clavier : Alt + flèches.'),
      liste, outils, el('p', {}, btn));
    return {
      noeud, valeur: () => etat.map(x => [x[0], x[1]]), renommer(t) { btn.textContent = t; },
      bloquer() { verrou = true; dessiner(null); outils.querySelectorAll('button').forEach(b => { b.disabled = true; }); btn.disabled = true; },
      marquer(det) { liste.querySelectorAll('li').forEach((li, p) => { li.classList.toggle('ok', det[p] === true); li.classList.toggle('ko', det[p] === false); }); },
    };
  }

  function ligne(d, o) {
    let choix = Number.isInteger(o.reponse) ? o.reponse : null;
    const btn = el('button', { type: 'button', class: 'bouton fort', disabled: '' }, o.libelle || 'Valider');
    const boutons = d.code.map((l, i) => {
      const ind = Math.floor(((l.match(/^ */) || [''])[0].length) / 4);
      const code = el('code', { class: 'py' }); code.appendChild(Q.fragmentCours(Q.colorerLigne(l.slice(ind * 4))));
      const b = el('button', { type: 'button', class: 'c-ligne', 'aria-pressed': 'false', 'aria-label': 'Ligne ' + (i + 1) + ' : ' + (l.trim() || 'ligne vide') },
        el('span', { class: 'num', 'aria-hidden': 'true' }, String(i + 1)), el('span', { class: 'p-guides', 'aria-hidden': 'true' }, Array.from({ length: ind }, () => el('span', { class: 'guide' }, '    '))), code);
      b.addEventListener('click', () => { choix = i; maj(); Q.annoncer('Ligne ' + (i + 1) + ' choisie.'); });
      return b;
    });
    const maj = () => { boutons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === choix))); btn.disabled = choix === null; };
    btn.addEventListener('click', () => { if (choix !== null) o.onValider(choix); });
    maj();
    const noeud = el('div', { class: 'lignes-zone' }, el('p', { class: 'aide' }, 'Touche la ligne qui contient l\'erreur, puis valide.'),
      el('div', { class: 'c-lignes', role: 'group', 'aria-label': 'Les lignes du programme' }, boutons));
    // le message d'erreur réel, dans une console compacte sous le code
    if (d.console) noeud.appendChild(Q.fragmentCours(Q.console(d.console)));
    noeud.appendChild(el('p', {}, btn));
    return {
      noeud, valeur: () => choix, renommer(t) { btn.textContent = t; },
      bloquer() { boutons.forEach(b => { b.disabled = true; }); btn.disabled = true; },
      marquer(det, r) { boutons.forEach((b, i) => b.classList.toggle('ko', i === r && det[0] === false)); },
    };
  }

  Q.activiteUI = function (d, o) {
    o = Object.assign({ onValider() {} }, o);
    return ({ nuage, relier, puzzle, ligne })[d.type](d, o);
  };
})(window);
