# Architecture

## Le code

| Fichier | Rôle |
|---|---|
| `index.html`, `animer.html`, `rejoindre.html`, `revision.html`, `imprimer.html` | l'accueil, la page projetée, la page élève, le mode autonome, la version à imprimer |
| `js/accueil.js`, `css/bibliotheque.css` | l'accueil rangé en bibliothèque, affiné comme la bibliothèque du site (`assets/bibliotheque.js`) : cases Niveau, Type et Notions travaillées avec leur nombre, puces des filtres actifs, recherche sans accents (alternatifs et mots du code compris), compteur annoncé, état « aucun résultat », filtres dans l'adresse (`q`, `niv`, `type`, `notion`, comme sur le site) |
| le style (T143) | **une seule source, le site** : chaque page charge `assets/signal-commun.css` (palette clair et obscur, polices) puis `assets/applis.css` (le socle des applications, classes `ap-…`) depuis `https://babash.github.io/Babash-NSI-SNT/assets/`, avec `data-appli="quizz-nsi"` (le plateau de la Flottille sous la barre). `css/habillage.css` ne fait que la mise en place propre à QuizzNSI (barre, lobby, podium, commandes, téléphone), avec la palette du site |
| `js/socle.js`, `css/repli.css` | avant l'affichage : l'affichage clair ou obscur (la clé `theme` du site, même stockage) ; si une feuille du site ne se charge pas, `css/repli.css` (une palette et des boutons sobres) la remplace, et la page reste lisible et utilisable |
| `css/quizz.css`, `css/seance.css`, `css/polices.css` | **l'écran de question, inchangé** (décision du 25/11) : les diapositives, les questions et leur correction, hors de toute boîte `.ap` (le socle ne les touche pas), sur leur fond d'avant (`body.qz-scene`), avec les mêmes fichiers de police que le site déclarés comme avant (`QuizzNSI Texte`, `QuizzNSI Mono`) et Chakra Petch, intégrée. S'y ajoute seulement le chrono de la maquette validée : l'anneau en haut à droite de la question projetée, le temps dans la barre du téléphone |
| `js/commun.js` | lecture d'un cours, mise en forme du texte, coloration du Python, schémas SVG, pseudo, stockage, thème |
| `js/diapos.js` | le rendu des diapositives, des questions, des corrections et des apparitions progressives |
| `js/seance.js` | la séance en direct (canaux temps réel, ou mode démo entre les onglets) |
| `js/messages.js` | la validation stricte de chaque message reçu |
| `js/chiffre.js` | le chiffrement des réponses pour la page projetée, et la paire de clés de chaque téléphone (gardée pour la séance), à laquelle la page projetée relie l'identifiant de l'élève |
| `js/bareme.js` | le barème, le classement, la progression, la minuterie (+ 15 s, pause, temps écoulé hors pause), les séries (flammes), le changement d'avis, la réception d'un envoi (clé reliée, accusé) et le choix retenu au téléphone |
| `js/activites.js` | les autres types de questions (nuage de mots, relier, puzzle de code, ligne fautive) : contrôle d'une réponse, note, ordre d'affichage (fonctions pures) |
| `js/activites-ui.js` | y répondre au téléphone et en révision (clavier et lecteur d'écran compris) |
| `cours/` | les cours-quiz (un fichier JSON par cours) et le catalogue de l'accueil |
| `outils/` | le vérificateur des cours, la bibliothèque de l'accueil (`bibliotheque.py`) et le contrôle des caractères |
| `vendor/` | le client temps réel de Supabase et le générateur de QR codes (MIT) |

## Ajouter un cours

Un cours-quiz est **un seul fichier JSON** : le moteur ne change pas. Le format est décrit dans [cours/FORMAT.md](../cours/FORMAT.md) ; le modèle d'une introduction (15 min, 12 questions, 8 écrans courts) est [cours/piles-files.json](../cours/piles-files.json), celui d'une révision (20 questions) [cours/revision-conditions-boucles.json](../cours/revision-conditions-boucles.json).

```bash
python3 -I outils/verifier_cours.py cours/<id>.json     # gabarit (questions, écrans, mots, durée estimée),
                                                       # 4 options, une juste, feedbacks, répartition A-D,
                                                       # caractères, exécution du code
python3 -I outils/verifier_cours.py --tous              # tous les cours, et le catalogue de l'accueil
python3 -I outils/bibliotheque.py --ecrire              # réécrit la bibliothèque de index.html d'après le catalogue
```

## Les tests

```bash
node tests/test_moteur.js                                   # barème (rapidité avec pause et ajouts), minuterie, séries, changer d'avis,
                                                            # envois d'une autre clé ignorés, choix retenu au téléphone, pseudo, échappement, schémas
node tests/test_messages.js                                 # messages forgés : tous rejetés ; clé gardée du téléphone, enveloppe au nom d'un·e autre illisible
python3 -I -m unittest discover -s tests -p "test_v*.py"    # le vérificateur
QUIZZ_SITE=../Babash-NSI-SNT python3 -I tests/test_parcours.py   # Playwright : séance à 2 élèves, injection, minuterie et flammes, mode autonome,
                                                            # impression, 320/768/1440 px, clair et obscur, habillage et repli
```

Le parcours utilise un faux client temps réel ([tests/faux-temps-reel.js](../tests/faux-temps-reel.js)) : il ne se connecte à aucune base. Le style vient du site : avec `QUIZZ_SITE=<dossier d'une copie du site>`, le parcours le lit dans cette copie (le workflow en prend une, réduite à `assets/`) ; sinon, il laisse passer les seules requêtes vers `https://babash.github.io/Babash-NSI-SNT/assets/`. Il vérifie aussi chaque page sans le site (requêtes coupées : le repli).

Plus le contrôle des caractères invisibles :

```bash
python3 -I outils/caracteres.py
```

Le workflow [.github/workflows/verifier.yml](../.github/workflows/verifier.yml) lance tout cela à chaque envoi.
