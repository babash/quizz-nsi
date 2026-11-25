/* QuizzNSI : avant l'affichage (MIT, Babash - NSI Tani Malandi). Chargé en tête de chaque page, avant les feuilles de style.
   1. L'affichage clair ou obscur : la clé « theme » du site Ressources NSI et SNT (même adresse babash.github.io, donc
      même stockage) : un choix fait sur le site vaut ici, et inversement. L'ancienne clé de QuizzNSI (« quizz-nsi:theme »)
      est reprise une fois, puis effacée.
   2. Le repli : le style vient du site (assets/signal-commun.css et assets/applis.css). Si l'une de ces feuilles ne se
      charge pas (site injoignable, page ouverte hors ligne, fichier déplacé), css/repli.css la remplace : une palette et
      des boutons sobres, assez pour que tout reste lisible et utilisable. */
(function () {
  'use strict';
  var r = document.documentElement;
  try {
    var t = localStorage.getItem('theme');
    if (t !== 'light' && t !== 'dark') {
      var a = null;
      try { a = JSON.parse(localStorage.getItem('quizz-nsi:theme')); } catch (e) { a = null; }
      if (a === 'light' || a === 'dark') { localStorage.setItem('theme', a); t = a; }
    }
    localStorage.removeItem('quizz-nsi:theme');
    if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t);
  } catch (e) { /* stockage bloqué : l'affichage suit le réglage de l'appareil */ }

  window.QuizzNSIRepli = function () {
    r.classList.add('sans-socle');
    if (document.getElementById('repli')) return;
    var l = document.createElement('link');
    l.id = 'repli'; l.rel = 'stylesheet'; l.href = 'css/repli.css';
    // avant les feuilles propres à QuizzNSI, qui gardent le dernier mot
    var avant = document.querySelector('link[rel="stylesheet"][href^="css/"]');
    if (avant) avant.parentNode.insertBefore(l, avant); else document.head.appendChild(l);
  };
})();
