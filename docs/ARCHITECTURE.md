# Architecture

## Le code

| Fichier | Rôle |
|---|---|
| `index.html`, `animer.html`, `rejoindre.html`, `revision.html`, `imprimer.html` | l'accueil, la page projetée, la page élève, le mode autonome, la version à imprimer |
| `js/accueil.js`, `css/bibliotheque.css` | l'accueil rangé en bibliothèque : filtres (niveau, thème, type), recherche sans accents, compteur annoncé, état « aucun résultat », filtres gardés dans l'adresse |
| `css/socle-provisoire.css` | le socle du design des applications (piste B), chargé par l'accueil seulement, **à remplacer** par `assets/signal-commun.css` et `assets/applis.css` du site quand ils seront publiés |
| `js/commun.js` | lecture d'un cours, mise en forme du texte, coloration du Python, schémas SVG, pseudo, stockage, thème |
| `js/diapos.js` | le rendu des diapositives, des questions, des corrections et des apparitions progressives |
| `js/seance.js` | la séance en direct (canaux temps réel, ou mode démo entre les onglets) |
| `js/messages.js` | la validation stricte de chaque message reçu |
| `js/chiffre.js` | le chiffrement des réponses pour la page projetée |
| `js/bareme.js` | le barème, le classement, la progression |
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
node tests/test_moteur.js                                   # barème, pseudo, échappement, schémas
node tests/test_messages.js                                 # messages forgés : tous rejetés
python3 -I -m unittest discover -s tests -p "test_v*.py"    # le vérificateur
python3 -I tests/test_parcours.py                           # Playwright : séance à 2 élèves, injection, mode autonome,
                                                            # impression, 320/768/1440 px, clair et obscur
```

Le parcours utilise un faux client temps réel ([tests/faux-temps-reel.js](../tests/faux-temps-reel.js)) : il ne se connecte à aucune base.

Plus le contrôle des caractères invisibles :

```bash
python3 -I outils/caracteres.py
```

Le workflow [.github/workflows/verifier.yml](../.github/workflows/verifier.yml) lance tout cela à chaque envoi.
