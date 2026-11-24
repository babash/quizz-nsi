/* QuizzNSI · l'accueil rangé en bibliothèque : chercher et affiner (T134, T134b). Code MIT, Babash - NSI Tani Malandi.
   La bibliothèque est écrite dans index.html d'après cours/catalogue.json (outils/bibliotheque.py) :
   sans JavaScript, c'est la liste complète. Ce script ne fait que montrer ou cacher des cartes.
   Le geste est celui de la bibliothèque du site Ressources NSI et SNT (assets/bibliotheque.js) :
   - des cases « Niveau », « Type » et « Notions travaillées », aucune cochée au départ (tout est montré) ;
   - à côté de chaque case, le nombre de quiz qu'elle donnerait avec la recherche et les autres filtres ;
     une valeur à 0 n'est pas proposée (sauf si elle est cochée) ; les notions, de la plus fréquente à la moins fréquente ;
   - plusieurs cases d'un même filtre : l'une OU l'autre ; deux filtres différents : l'un ET l'autre ;
   - au-dessus des cartes, une puce par filtre actif (« Notions travaillées : Piles × ») et « Retirer tous les filtres ».
   L'adresse garde la recherche et les filtres, avec les noms du site : q, niv, type, notion (identifiants du thésaurus).
   Aucune donnée personnelle, rien n'est envoyé. Les anciennes adresses (niveau=, theme=) ne cassent pas. */
(function () {
  'use strict';
  const Q = window.QuizzNSI;
  if (Q && Q.theme) Q.theme();

  const $ = id => document.getElementById(id);
  const aside = $('filtres'), form = $('form-filtres'), champ = $('recherche'), plus = $('plus-filtres');
  const facettes = $('facettes'), nbFiltres = $('nb-filtres'), puces = $('puces');
  const compteur = $('compteur'), aucun = $('aucun'), biblio = $('bibliotheque');
  let voc;
  try { voc = JSON.parse($('vocabulaire').textContent); } catch (e) { return; }
  if (!aside || !form || !champ || !compteur || !biblio || !facettes) return;

  // la même règle que outils/bibliotheque.py (sans_accents)
  const normaliser = s => String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();

  const cartes = Array.from(biblio.querySelectorAll('.qz-niveau:not(.qz-decouvrir) .qz-carte'));
  const demos = Array.from(biblio.querySelectorAll('.qz-decouvrir .qz-carte'));
  const total = cartes.length;
  const libelles = {};
  ['niveaux', 'types', 'notions'].forEach(k => { libelles[k] = {}; voc[k].forEach(x => { libelles[k][x.id] = x.libelle; }); });

  /* Chaque filtre : son nom dans l'adresse (celui du site), son titre, les valeurs d'une carte, leur ordre */
  const FILTRES = [
    { id: 'niv', titre: 'Niveau', liste: 'niveaux', valeurs: c => [c.dataset.niveau], ordre: true },
    { id: 'type', titre: 'Type', liste: 'types', valeurs: c => [c.dataset.type], ordre: true },
    { id: 'notion', titre: 'Notions travaillées', liste: 'notions', valeurs: c => c.dataset.notions.split(' ').filter(Boolean), ordre: false },
  ];
  const etat = { q: '', filtres: {} };
  const ouverts = {};

  aside.hidden = false;
  // à côté de la bibliothèque (grand écran), les filtres restent ouverts ; au téléphone, ils se replient
  const large = window.matchMedia('(min-width: 900px)');
  const ajusterPlus = () => { if (large.matches) plus.open = true; };
  ajusterPlus();
  if (large.addEventListener) large.addEventListener('change', ajusterPlus);

  /* ── l'état, lu et écrit dans l'adresse ── */
  const unique = l => Array.from(new Set(l));
  function lireAdresse() {
    const p = new URLSearchParams(location.search);
    etat.q = (p.get('q') || '').slice(0, 80);
    etat.filtres = {};
    FILTRES.forEach(F => {
      let v = p.get(F.id);
      // l'adresse de la première version (T134) : niveau=terminale-nsi ; theme= est ignoré
      if (!v && F.id === 'niv' && p.get('niveau')) v = p.get('niveau').replace(/-(nsi|snt)$/, '');
      if (!v) return;
      const vals = unique(v.split(',').filter(x => Object.prototype.hasOwnProperty.call(libelles[F.liste], x)));
      if (vals.length) etat.filtres[F.id] = vals;
    });
    champ.value = etat.q;
  }
  function ecrireAdresse() {
    const p = new URLSearchParams(location.search);
    ['q', 'niv', 'type', 'notion', 'niveau', 'theme'].forEach(k => p.delete(k));
    if (etat.q) p.set('q', etat.q);
    FILTRES.forEach(F => { if (actif(F.id)) p.set(F.id, etat.filtres[F.id].join(',')); });
    const s = p.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) { /* adresse inchangée */ }
  }

  /* ── qui passe ── */
  const actif = id => (etat.filtres[id] || []).length > 0;
  const motsCherches = () => normaliser(etat.q).split(' ').filter(Boolean);
  const correspond = (c, mots) => mots.every(m => c.dataset.mots.includes(m));
  function passe(c, sauf) {
    return FILTRES.every(F => {
      if (F.id === sauf || !actif(F.id)) return true;
      const vals = F.valeurs(c);
      return etat.filtres[F.id].some(v => vals.includes(v));
    });
  }

  /* ── les filtres : des cases avec leur nombre ── */
  function compter(F, mots) {
    const n = {};
    cartes.forEach(c => {
      if (!correspond(c, mots) || !passe(c, F.id)) return;
      F.valeurs(c).forEach(v => { n[v] = (n[v] || 0) + 1; });
    });
    return n;
  }
  function el(tag, attrs, enfants) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v != null) e.setAttribute(k, v); });
    [].concat(enfants || []).forEach(x => { if (x != null) e.append(x); });
    return e;
  }
  function caseFiltre(F, v, n) {
    const id = 'f-' + F.id + '-' + v.replace(/[^a-z0-9-]/g, '-');
    const coche = (etat.filtres[F.id] || []).includes(v);
    const input = el('input', { type: 'checkbox', id: id });
    input.checked = coche;
    input.addEventListener('change', () => { basculer(F, v, input.checked); const x = $(id); if (x) x.focus(); });
    return el('label', { class: 'filtre-case' + (n || coche ? '' : ' est-vide'), for: id }, [
      input, el('span', { class: 'filtre-nom' }, libelles[F.liste][v]), el('span', { class: 'nb' }, String(n))
    ]);
  }
  function rendreFiltres(mots) {
    facettes.replaceChildren();
    let actifs = 0;
    FILTRES.forEach(F => {
      const n = compter(F, mots);
      const choisis = etat.filtres[F.id] || [];
      const ids = voc[F.liste].map(x => x.id);
      let vals = unique(Object.keys(n).concat(choisis));
      if (F.ordre) vals.sort((x, y) => ids.indexOf(x) - ids.indexOf(y));
      else vals.sort((x, y) => (n[y] || 0) - (n[x] || 0) || libelles[F.liste][x].localeCompare(libelles[F.liste][y], 'fr'));
      actifs += choisis.length;
      if (!vals.length) return;
      const cle = 'facette:' + F.id;
      const d = el('details', { class: 'facette' }, [
        el('summary', null, [F.titre, choisis.length ? el('span', { class: 'nb' }, ' (' + choisis.length + ')') : null])
      ]);
      // exactement comme sur le site (assets/bibliotheque.js) : Niveau et Type ouverts, les notions repliées sauf si l'une est cochée
      d.open = ouverts[cle] !== undefined ? ouverts[cle] : (F.id !== 'notion' || choisis.length > 0);
      d.addEventListener('toggle', () => { ouverts[cle] = d.open; });
      d.append(el('ul', { class: 'filtre-valeurs' }, vals.map(v => el('li', null, caseFiltre(F, v, n[v] || 0)))));
      facettes.append(d);
    });
    nbFiltres.textContent = actifs ? '(' + actifs + ' actif' + (actifs > 1 ? 's' : '') + ')' : '';
    return actifs;
  }
  function basculer(F, v, coche) {
    const t = (etat.filtres[F.id] || []).filter(x => x !== v);
    if (coche) t.push(v);
    if (t.length) etat.filtres[F.id] = t; else delete etat.filtres[F.id];
    appliquer(true);
  }

  /* ── les puces des filtres actifs ── */
  function rendrePuces() {
    puces.replaceChildren();
    const out = [];
    FILTRES.forEach(F => (etat.filtres[F.id] || []).forEach(v => {
      const texte = libelles[F.liste][v];
      const b = el('button', { type: 'button', class: 'puce-filtre', 'aria-label': 'Retirer le filtre ' + F.titre + ' : ' + texte }, [
        el('span', { class: 'puce-quoi' }, F.titre + ' : '), texte, el('span', { 'aria-hidden': 'true' }, ' ×')
      ]);
      b.addEventListener('click', () => { basculer(F, v, false); champ.focus(); });
      out.push(b);
    }));
    if (out.length > 1) {
      const tout = el('button', { type: 'button', class: 'lien-bouton' }, 'Retirer tous les filtres');
      tout.addEventListener('click', () => { etat.filtres = {}; appliquer(true); champ.focus(); });
      out.push(tout);
    }
    out.forEach(b => puces.append(b));
    puces.hidden = !out.length;
  }

  /* ── montrer ou cacher ── */
  let minuterie = null, dernierTexte = '';
  function appliquer(annoncerTout) {
    etat.q = champ.value.trim().slice(0, 80);
    const mots = motsCherches();
    let n = 0;
    cartes.forEach(c => {
      const ok = correspond(c, mots) && passe(c);
      c.classList.toggle('qz-cache', !ok);
      if (ok) n += 1;
    });
    const filtre = FILTRES.some(F => actif(F.id));
    demos.forEach(c => c.classList.toggle('qz-cache', filtre || !correspond(c, mots)));
    biblio.querySelectorAll('.qz-niveau').forEach(s => { s.hidden = !s.querySelector('.qz-carte:not(.qz-cache)'); });
    const actifs = rendreFiltres(mots);
    rendrePuces();
    ecrireAdresse();

    let texte;
    if (!actifs && !mots.length) texte = total + ' cours-quiz, rangés par niveau.';
    else texte = (n === 0 ? 'Aucun cours-quiz' : n + ' cours-quiz sur ' + total) + (etat.q ? ' pour « ' + etat.q + ' »' : '') + (actifs ? ', avec les filtres choisis.' : '.');
    // l'annonce (role="status") attend la fin de la frappe, pour ne pas parler à chaque lettre
    clearTimeout(minuterie);
    const ecrire = () => { if (texte !== dernierTexte) { compteur.textContent = texte; dernierTexte = texte; } };
    if (annoncerTout) ecrire(); else minuterie = setTimeout(ecrire, 450);
    afficherAucun(n, mots, actifs);
  }

  /* ── rien trouvé : retirer les filtres, effacer la recherche ── */
  function afficherAucun(n, mots, actifs) {
    aucun.hidden = n !== 0;
    if (n !== 0) return;
    aucun.replaceChildren();
    aucun.append(el('h2', null, etat.q ? 'Aucun cours-quiz ne correspond à « ' + etat.q + ' »' + (actifs ? ' avec ces filtres.' : '.') : 'Aucun cours-quiz ne correspond à ces filtres.'));
    const actions = el('div', { class: 'qz-actions' });
    const sans = actifs ? cartes.filter(c => correspond(c, mots)).length : 0;
    if (sans) {
      const b = el('button', { type: 'button', class: 'bt mini p' }, 'Retirer les filtres (' + sans + ' cours-quiz sans eux)');
      b.addEventListener('click', () => { etat.filtres = {}; appliquer(true); champ.focus(); });
      actions.append(b);
    } else if (mots.length) {
      aucun.append(el('p', null, 'Essaie un mot plus court ou une notion : pile, boucle, dictionnaire, SQL, tri… Les accents ne comptent pas.'));
      const b = el('button', { type: 'button', class: 'bt mini p' }, 'Effacer la recherche');
      b.addEventListener('click', () => { champ.value = ''; appliquer(true); champ.focus(); });
      actions.append(b);
    }
    if (actifs && mots.length) {
      const b = el('button', { type: 'button', class: 'bt mini' }, 'Tout montrer');
      b.addEventListener('click', () => { etat.filtres = {}; champ.value = ''; appliquer(true); champ.focus(); });
      actions.append(b);
    }
    aucun.append(actions);
  }

  form.addEventListener('submit', ev => { ev.preventDefault(); appliquer(true); });
  champ.addEventListener('input', () => appliquer(false));
  champ.addEventListener('keydown', ev => { if (ev.key === 'Escape' && champ.value) { champ.value = ''; appliquer(true); } });

  lireAdresse();
  if (!large.matches && Object.keys(etat.filtres).length) plus.open = true;
  appliquer(true);
})();
