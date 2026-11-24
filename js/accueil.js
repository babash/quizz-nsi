/* QuizzNSI · l'accueil rangé en bibliothèque : chercher et filtrer (T134). Code MIT, Babash - NSI Tani Malandi.
   La bibliothèque est écrite dans index.html d'après cours/catalogue.json (outils/bibliotheque.py) :
   sans JavaScript, c'est la liste complète. Ce script ne fait que montrer ou cacher des cartes.
   Les filtres sont gardés dans l'adresse (niveau, type, theme, q) : aucune donnée personnelle, rien n'est envoyé. */
(function () {
  'use strict';
  const Q = window.QuizzNSI;
  if (Q && Q.theme) Q.theme();

  const $ = id => document.getElementById(id);
  const aside = $('filtres'), form = $('form-filtres'), champ = $('recherche'), plus = $('plus-filtres');
  const compteur = $('compteur'), aucun = $('aucun'), biblio = $('bibliotheque');
  if (!aside || !form || !champ || !compteur || !biblio) return;

  // la même règle que outils/bibliotheque.py (sans_accents)
  const normaliser = s => String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();

  const cartes = Array.from(biblio.querySelectorAll('.qz-niveau:not(.qz-decouvrir) .qz-carte'));
  const demos = Array.from(biblio.querySelectorAll('.qz-decouvrir .qz-carte'));
  const total = cartes.length;
  const radios = Array.from(form.querySelectorAll('input[name="niveau"]'));
  const types = Array.from(form.querySelectorAll('input[name="type"]'));
  const themes = Array.from(form.querySelectorAll('input[name="theme"]'));
  const groupes = Array.from(form.querySelectorAll('.qz-f-groupe'));
  const niveauDe = c => c.closest('.qz-niveau').dataset.niveau;

  aside.hidden = false;
  // à côté de la bibliothèque (grand écran), les filtres restent ouverts ; au téléphone, ils se replient
  const large = window.matchMedia('(min-width: 900px)');
  const ajusterPlus = () => { if (large.matches) plus.open = true; };
  ajusterPlus();
  if (large.addEventListener) large.addEventListener('change', ajusterPlus);

  /* ── l'état, lu et écrit dans l'adresse ── */
  function lireAdresse() {
    const p = new URLSearchParams(location.search);
    const niveau = p.get('niveau') || '';
    const r = radios.find(x => x.value === niveau && !x.disabled) || radios[0];
    r.checked = true;
    const liste = (nom, cases) => {
      if (!p.has(nom)) { cases.forEach(c => { c.checked = true; }); return; }
      const v = new Set(String(p.get(nom)).split(',').filter(Boolean));
      cases.forEach(c => { c.checked = v.has(c.value); });
    };
    liste('type', types);
    liste('theme', themes);
    champ.value = (p.get('q') || '').slice(0, 80);
    if (!large.matches && (niveau || p.has('type') || p.has('theme'))) plus.open = true;
  }
  function ecrireAdresse(etat) {
    const p = new URLSearchParams(location.search);
    ['niveau', 'type', 'theme', 'q'].forEach(k => p.delete(k));
    if (etat.niveau) p.set('niveau', etat.niveau);
    if (etat.types.length !== types.length) p.set('type', etat.types.join(','));
    if (etat.themes.length !== themes.length) p.set('theme', etat.themes.join(','));
    if (etat.q) p.set('q', etat.q);
    const s = p.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) { /* adresse inchangée */ }
  }
  function etatActuel() {
    const r = radios.find(x => x.checked);
    return {
      niveau: r ? r.value : '',
      types: types.filter(c => c.checked).map(c => c.value),
      themes: themes.filter(c => c.checked).map(c => c.value),
      q: champ.value.trim().slice(0, 80),
    };
  }

  /* ── montrer ou cacher ── */
  const correspond = (c, mots) => mots.every(m => c.dataset.mots.includes(m));
  let minuterie = null, dernierTexte = '';

  function appliquer(annoncerTout) {
    const e = etatActuel();
    const mots = normaliser(e.q).split(' ').filter(Boolean);
    groupes.forEach(g => { g.hidden = !!e.niveau && g.dataset.niveau !== e.niveau; });
    const tys = new Set(e.types), ths = new Set(e.themes);
    let n = 0;
    cartes.forEach(c => {
      const ok = (!e.niveau || niveauDe(c) === e.niveau) && tys.has(c.dataset.type) && ths.has(c.dataset.theme) && correspond(c, mots);
      c.classList.toggle('qz-cache', !ok);
      if (ok) n += 1;
    });
    demos.forEach(c => c.classList.toggle('qz-cache', !correspond(c, mots)));
    biblio.querySelectorAll('.qz-bloc, .qz-niveau').forEach(s => {
      s.hidden = !s.querySelector('.qz-carte:not(.qz-cache)');
    });
    ecrireAdresse(e);

    const filtre = !!e.niveau || e.types.length !== types.length || e.themes.length !== themes.length;
    let texte;
    if (!filtre && !mots.length) texte = total + ' cours-quiz, rangés par niveau, puis par thème du programme.';
    else texte = (n === 0 ? 'Aucun cours-quiz' : n + ' cours-quiz sur ' + total) + (e.q ? ' pour « ' + e.q + ' »' : '') + (filtre ? ', avec les filtres choisis.' : '.');
    // l'annonce (role="status") attend la fin de la frappe, pour ne pas parler à chaque lettre
    clearTimeout(minuterie);
    const ecrire = () => { if (texte !== dernierTexte) { compteur.textContent = texte; dernierTexte = texte; } };
    if (annoncerTout) ecrire(); else minuterie = setTimeout(ecrire, 450);

    $('tout-montrer').hidden = !filtre && !mots.length;
    afficherAucun(n, e, mots, filtre);
  }

  function bouton(texte, action, principal) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'bt mini' + (principal ? ' p' : ''); b.textContent = texte;
    b.addEventListener('click', action);
    return b;
  }
  function para(texte) { const p = document.createElement('p'); p.textContent = texte; return p; }

  function afficherAucun(n, e, mots, filtre) {
    aucun.hidden = n !== 0;
    if (n !== 0) return;
    aucun.replaceChildren();
    const h = document.createElement('h2'); h.textContent = 'Aucun cours-quiz ne correspond' + (e.q ? ' à « ' + e.q + ' »' : '') + (filtre ? ' avec ces filtres.' : '.');
    aucun.append(h);
    const actions = document.createElement('div'); actions.className = 'qz-actions';
    // ailleurs dans la bibliothèque ?
    const ailleurs = mots.length ? cartes.filter(c => correspond(c, mots)).length : 0;
    if (!e.types.length) aucun.append(para('Aucun type n\'est coché : coche « Cours-quiz d\'introduction », « Révision », ou les deux.'));
    else if (!e.themes.length) aucun.append(para('Aucun thème n\'est coché : coche au moins un thème du programme.'));
    if (filtre && ailleurs) {
      aucun.append(para(ailleurs + ' cours-quiz ' + (ailleurs > 1 ? 'correspondent' : 'correspond') + ' à « ' + e.q + ' » dans d\'autres niveaux, types ou thèmes.'));
      actions.append(bouton(ailleurs > 1 ? 'Les montrer' : 'Le montrer', () => { reinitialiserFiltres(); appliquer(true); champ.focus(); }, true));
    } else if (mots.length) {
      aucun.append(para('Essaie un mot plus court ou le nom d\'une notion : pile, boucle, dictionnaire, SQL, tri… Les accents ne comptent pas.'));
      actions.append(bouton('Effacer la recherche', () => { champ.value = ''; appliquer(true); champ.focus(); }, true));
    }
    if (filtre) actions.append(bouton('Tout montrer', toutMontrer));
    aucun.append(actions);
  }

  function reinitialiserFiltres() {
    radios[0].checked = true;
    types.concat(themes).forEach(c => { c.checked = true; });
  }
  function toutMontrer() { reinitialiserFiltres(); champ.value = ''; appliquer(true); champ.focus(); }

  form.addEventListener('submit', ev => { ev.preventDefault(); appliquer(true); });
  champ.addEventListener('input', () => appliquer(false));
  form.addEventListener('change', ev => { if (ev.target !== champ) appliquer(true); });
  $('tout-montrer').addEventListener('click', toutMontrer);

  lireAdresse();
  appliquer(true);
})();
