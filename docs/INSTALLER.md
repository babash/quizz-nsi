# Installer sa copie

## La publication

Le site est publié par GitHub Pages **depuis la branche `main`**, dossier `/ (root)` (*Settings › Pages › Deploy from a branch*), sans workflow de publication. Aucun fichier ne dépend de Jekyll (`.nojekyll` à la racine). Les liens de séance et le QR code sont construits depuis l'adresse de la page : une copie publiée ailleurs marche sans rien changer.

## Ta copie

1. **Copie le dépôt** (bouton *Fork*), puis publie-le : *Settings › Pages › Deploy from a branch*, branche `main`, dossier `/ (root)`.
2. **Crée un projet Supabase** (offre gratuite). Il n'y a ni table ni script SQL : les séances n'utilisent que les canaux temps réel.
3. **Dans `config.js`**, mets l'adresse de ton projet et sa clé publique (« publishable »), jamais une clé secrète.

Le style vient du site Ressources NSI et SNT (`https://babash.github.io/Babash-NSI-SNT/assets/signal-commun.css` et `applis.css`, avec leurs polices) : ta copie le charge de là, sans rien changer. Si le site ne répond pas, `css/repli.css` prend le relais (une palette et des boutons sobres) : tout reste lisible et utilisable. Pour habiller ta copie autrement, remplace ces deux adresses dans les cinq pages.

Sans projet Supabase, laisse `SUPABASE_URL` vide : les séances passent en mode démo, entre les onglets d'un même navigateur. Le mode autonome et la version imprimable n'ont besoin de rien.
