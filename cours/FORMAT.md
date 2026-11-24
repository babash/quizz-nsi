# Écrire un cours-quiz : le format `quizz-nsi/1`

Un cours-quiz est **un seul fichier JSON**, `cours/<id>.json`. Le moteur (les pages HTML et `js/`) ne change pas : pour un nouveau cours, on écrit ce fichier, on l'ajoute à `cours/catalogue.json`, et on lance le vérificateur.

```bash
python3 -I outils/verifier_cours.py cours/<id>.json   # gabarit, forme, règle 22, répartition, exécution du code
```

Le modèle d'une introduction est [`piles-files.json`](piles-files.json) ; celui d'une révision, [`revision-conditions-boucles.json`](revision-conditions-boucles.json).

## Les gabarits

Un cours déclare son gabarit dans le champ `gabarit`. Il y en a deux.

| | `"introduction"` | `"revision"` |
|---|---|---|
| **À quoi il sert** | la **première** rencontre avec la notion : l'essentiel, pour en maîtriser la base | un bilan avant un contrôle, sur une notion déjà travaillée |
| **Durée** (`duree_minutes`) | **15 minutes** | 45 au plus (25 pour le cours de révision) |
| **Questions** | **12** : des questions à choix, et 2 au plus de type `relier`, `puzzle` ou `ligne` ; jamais de `nuage` | **20** questions à choix ; les autres types en bonus, non comptés |
| **Écrans de cours** (`notion`, `classe`, `humour`, `partie`) | **8 au plus** | sans limite |
| **Sur chaque écran** | **25 mots au plus** (hors titre, code et vocabulaire anglais) ; une `notion` a 2 phrases au plus, et 10 lignes de code au plus, exécutées par le vérificateur | 3 phrases au plus (avertissement) |
| **Bilan** | 5 lignes au plus dans le tableau (avertissement) | libre |

Un cours sans `gabarit` est une révision : c'est le format des cours écrits avant l'introduction des gabarits.

**L'introduction : on apprend par les questions.** Le cours-quiz d'introduction ouvre la séquence ; viennent ensuite le cours ou TD applicatif, les activités TP, le TD type bac et la feuille de révision. Il n'a donc pas à tout dire : l'enseignant·e présente chaque écran à l'oral, et **c'est le feedback de chaque option qui explique**. Un écran, c'est un titre, une phrase ou deux, et un schéma ou un exemple de code de quelques lignes. Ce qui ne tient pas dans ces 8 écrans va dans une note pour la fiche de révision et le TD. La règle 22 ne change pas pour les questions à choix.

**Comment le vérificateur compte les mots** : un `` `code` `` en ligne compte pour un mot ; la ponctuation seule (`:`, `→`, `«`, `»`) ne compte pas ; « l'ordre » compte pour un mot. Il compte `texte`, `pistes`, `lignes`, `consigne`, `chute`, `sous_titre` et la `legende` du schéma ; pas le titre (ni la `question` d'une diapositive `classe`), ni le `surtitre`, ni le code, ni le `vocabulaire`.

**La durée estimée**, affichée par le vérificateur pour chaque cours : 0,5 minute pour le titre, pour chaque écran de cours et pour le bilan ; 0,75 minute par question à choix (0,9 si son code a 5 lignes ou plus) ; 1 minute pour une question `relier`, `puzzle` ou `ligne`. C'est l'ordre de grandeur d'une séance projetée : environ 30 secondes pour répondre au téléphone, 15 à 20 secondes de correction commentée. Le vérificateur avertit si l'introduction dépasse 17 minutes estimées.

## Le cours

| Champ | Obligatoire | Contenu |
|---|---|---|
| `format` | oui | toujours `"quizz-nsi/1"` |
| `gabarit` | non | `"introduction"` ou `"revision"` (la valeur par défaut) : voir plus haut |
| `id` | oui | le nom du fichier, sans `.json` : minuscules, chiffres et tirets (`piles-files`) |
| `titre`, `sous_titre` | `titre` | le titre de la diapositive d'ouverture |
| `niveau` | oui | `"Terminale NSI"`, `"Première NSI"`, `"Seconde SNT"` |
| `programme` | oui | la ligne du programme officiel (BO de 2019) |
| `fiche` | non | le lien de la fiche de cours correspondante (FichesNSI) |
| `auteur`, `licence` | oui | `"Babash - NSI Tani Malandi"`, `"CC BY-SA 4.0"` |
| `duree_minutes` | non (oui pour une introduction : 15) | 45 au plus |
| `demonstration` | non | `true` pour un cours de démonstration (pas un cours de classe) : moins de 20 questions à choix, ou aucune, et pas de `gabarit` ; marqué « démonstration » dans le catalogue et sur l'accueil |
| `sources` | non | les supports dont le cours s'inspire (contrôles, sujets de bac cités) |
| `criteres` | oui | les critères de réussite, par niveau (apprentissage visible) |
| `conventions` | oui | les conventions rappelées au début et sur la feuille imprimée (sens d'écriture d'une pile, hauteur d'un arbre réduit à un nœud…) |
| `prelude_python` | non | des lignes Python exécutées avant chaque vérification (par exemple les classes `Pile` et `File`) |
| `diapositives` | oui | la suite des diapositives, dans l'ordre du cours |

## La règle des exemples (pour tous les cours)

Chaque notion s'ancre **d'abord dans un exemple du quotidien à Mayotte**, connu de tous les élèves, **puis dans son usage informatique** (consigne de l'enseignant, 19/11). Pour les piles et les files : la boîte de chips en tube (la pile), la file au doukabé et le bouchon jusqu'à Mamoudzou (la file), puis le bouton « Annuler » et l'imprimante de la salle info. Des scènes du quotidien, sans cliché ni moquerie, sans nom de marque ; les schémas sont des SVG originaux et sobres, sans personnage. Tout mot d'une langue locale est signalé à l'enseignant pour vérification et n'est jamais nécessaire pour comprendre.

## Les diapositives

Chaque diapositive a un `type` :

- **`titre`** : la première. Champs : `titre`, `texte` (une liste de phrases). Les critères et les conventions s'y affichent seuls. `"conventions": false` cache les conventions (rappelées alors sur la feuille imprimée).
- **`notion`** : une idée par diapositive. Champs : `titre` ; `surtitre` (facultatif, « Notion » par défaut : « Essayons avec ce qu'on connaît », « La solution »…) ; `texte`, **3 phrases courtes au plus** (2 dans une introduction) ; `schema` (facultatif) ; `code` (facultatif, une liste de lignes) ; `vocabulaire` (facultatif : les mots anglais et leur traduction) ; `progressif: true` (les phrases apparaissent une à une) ; `code_cache: true` (le code apparaît au clic suivant) ; `consigne` (des consignes d'observation sur le code : « Précise ce qui est affiché », « Repère… ») ; `chute` (une phrase finale, comme « C'est un peu compliqué, non ? »).

**Les apparitions progressives.** Sur la page projetée et en révision, « Suite » montre l'élément suivant de la diapositive avant de passer à la suivante ; les téléphones suivent l'écran projeté (le message de séance porte le nombre d'éléments montrés, `f`). En revenant en arrière, tout est montré.
- **`question`** : voir plus bas.
- **`nuage`**, **`relier`**, **`puzzle`**, **`ligne`** : les autres types de questions, voir plus bas.
- **`partie`** : un titre de partie, en grand. Champs : `numero` (facultatif), `titre`, `sous_titre`.
- **`classe`** : une question ouverte à la classe, sans réponse à cocher (« Et si on programmait… ? »). Champs : `question`, `texte` (facultatif), `pistes` (des pistes qui apparaissent une à une), `schema`, `code`.
- **`humour`** : la diapositive qui dramatise (« Bon, si on continue… »). Champs : `titre`, `lignes` (elles apparaissent une à une), `chute` (la dernière phrase, « Il nous faut agir ! »).
- **`bilan`** : la dernière. Champs : `titre`, `tableau` (`colonnes` et `lignes`), `ticket` (les questions du ticket de sortie).

## Les questions (règle 22 de la philosophie éducative)

| Champ | Contenu |
|---|---|
| `id` | `q01` à `q20` (`q01` à `q12` dans une introduction), unique |
| `nom` | `[Thème] Ce que la question fait travailler`, comme dans Pronote |
| `objectif` | une phrase, affichée au début de la question |
| `enonce` | une liste de paragraphes **impersonnels**, comme au bac |
| `code` | facultatif : une liste de lignes Python, affichée numérotée et colorée ; **27 caractères au plus par ligne** (commentaire compris), **contrôlé** partout : code d'une question, d'une option, d'un écran d'introduction, d'une ligne fautive (chaque ligne est un bouton). À 320 px, le moteur affiche alors chaque ligne en entier (police de 13 px au moins, lettre de l'option au-dessus de son code) |
| `console` | facultatif, sous un `code` : ce que Python affiche en l'exécutant, une ligne par ligne de sortie ; pour une erreur, sa dernière ligne **en entier** (Python 3.13, « Did you mean » compris). Affichée dans une console compacte sous le code ; le vérificateur l'exécute et compare mot pour mot |
| `schema` | facultatif : un schéma (voir plus bas) |
| `options` | **exactement 4** : `{ "texte": "…", "feedback": "…" }`, ou `"code": [lignes]` à la place de `texte` ; **une seule** porte `"juste": true` |
| `explication` | une phrase « À retenir », montrée après la réponse |
| `trace` | facultatif : `{ "colonnes": [...], "lignes": [[...], ...] }`, le pas à pas montré après la réponse |
| `verifications` | obligatoire dès qu'il y a du code : voir plus bas |
| `note_verification` | si la question n'a pas de code à exécuter : comment le fait a été vérifié (une mesure, une source) |

Les règles que le vérificateur contrôle :
- 4 options, une seule juste ; un feedback d'au moins 40 caractères pour **chaque** option, au tutoiement : il explique l'erreur (bienveillant) ou consolide l'automatisme ;
- aucun gras dans une option ; la bonne réponse n'est la plus longue que rarement (au plus 40 % des questions) ;
- la bonne réponse répartie entre A, B, C et D (pour 20 questions : 4 à 6 fois chacune ; pour 11 : 1 à 4 fois), jamais 3 fois de suite la même lettre, aucun motif (ni périodique, ni partiel : une lettre juste au même rang modulo 2, 3 ou 4 sur 4 questions de ce rang, un groupe de 4 bonnes réponses qui se répète) ;
- aucun caractère invisible ou de contrôle ;
- 20 questions à choix dans une révision ; 12 questions en tout dans une introduction (voir les gabarits).

Ce qu'il faut relire à la main : les distracteurs viennent d'erreurs typiques d'élèves ; les énoncés sont impersonnels et courts ; le vocabulaire anglais est traduit ; le langage inclusif ; les contextes de Mayotte, sans cliché.

## Les autres types de questions

Un cours peut contenir des diapositives d'autres types. Dans une révision, elles viendraient en bonus des 20 questions à choix (le vérificateur compte toujours 20 questions `question`) ; le cours de démonstration les montre toutes ; dans une introduction, 1 ou 2 d'entre elles (`relier`, `puzzle`, `ligne`, jamais `nuage`) comptent parmi les 12 questions, quand elles servent la notion (la ligne fautive de piles et files fait lire un message d'erreur). La règle 22 ne change pas pour les questions à choix. **Toutes les questions notées sont numérotées ensemble**, dans l'ordre du cours (« Question 12 sur 12 » pour la ligne fautive de piles et files) : sur la page projetée, le téléphone, en révision, dans « Rejouer » et sur papier ; le bilan du mode révision les compte toutes ; le nuage de mots, non noté, n'a pas de numéro. Chacune a les champs `id` (unique, comme `a01`), `nom`, `objectif`, `enonce`, `explication` (sauf le nuage) et, au besoin, `code`. Elles s'affichent sur la page projetée, sur le téléphone, en révision (essais illimités) et sur la feuille imprimée (avec la place pour répondre, et leur correction dans le corrigé).

| `type` | Champs | Ce que fait l'élève | Comment c'est noté |
|---|---|---|---|
| `nuage` | `exemples` (facultatif : des mots possibles, montrés après) | propose autant de mots qu'il ou elle veut (un ou deux mots à la fois) ; une fois le nuage montré, vote pour les mots des camarades | **non noté** : pas de bonne réponse, aucun point, ne compte pas pour le rebond |
| `relier` | `paires` : 2 à 6 `{ "gauche", "droite", "feedback"?, "verification"? }` | relie chaque élément de gauche à une réponse de droite (une liste déroulante par élément) | en proportion : 3 paires bien reliées sur 5 donnent 60 points sur 100 ; rapidité et rebond seulement si tout est juste |
| `puzzle` | `lignes` : la solution (3 à 12 lignes, indentées de 4 espaces) ; `indentation` (`true` par défaut : l'élève doit aussi indenter) ; `verifications` (obligatoires) | remet les lignes dans l'ordre et les indente (boutons « Monter », « Descendre », « Indenter », « Désindenter », ou Alt + flèches) | en proportion des lignes à leur place (et à la bonne indentation quand elle compte) |
| `ligne` | `code` ; `ligne` (le numéro de la ligne fautive, à partir de 1) ; `correction` (la ligne corrigée) ; `feedback` (pour la bonne ligne) ; `feedback_autre` (pour une autre ligne) ; `pieges` (facultatif : `{ "2": "feedback de la ligne 2" }`) ; `verifications` et `verifications_corrigees` (obligatoires) ; `console` (le message d'erreur réel, affiché sous le code, vérifié) | touche la ligne qui contient l'erreur | comme une question à choix : juste ou faux |

L'ordre des réponses à relier et des lignes du puzzle est mélangé à partir de l'`id` : la page projetée et tous les téléphones voient le même ordre (on peut dire « 1 avec C » à la classe), et le puzzle ne commence jamais dans l'ordre de la solution. Le vérificateur refuse un `relier` dont le mélange laisserait toutes les paires face à face (il suffit de changer l'`id`).

**Ce que le vérificateur exécute** : la solution du puzzle (`lignes`, puis chaque vérification) ; pour la ligne fautive, le code tel quel (`verifications`, qui montrent l'erreur) puis le code où la ligne est remplacée par `correction` (`verifications_corrigees`, qui montrent que la correction marche) ; pour `relier`, la `verification` de chaque paire « code et sortie » (et les `verifications` de la diapositive s'il y en a).

```json
{ "type": "ligne", "id": "a04", "nom": "[Fonctions] Une somme qui s'arrête trop tôt", "objectif": "…", "enonce": ["…"],
  "code": ["def somme(n):", "    total = 0", "    for i in range(1, n):", "        total = total + i", "    return total", "print(somme(4))"],
  "ligne": 3, "correction": "    for i in range(1, n + 1):", "feedback": "…", "feedback_autre": "…", "pieges": { "5": "…" },
  "verifications": [{ "code": [], "sortie": "6" }], "verifications_corrigees": [{ "code": [], "sortie": "10" }], "explication": "…" }
```

**Le nuage de mots, en classe** : chaque mot est filtré sur le téléphone puis de nouveau sur la page projetée (2 à 24 caractères, un ou deux mots, lettres d'une seule écriture, chiffres, espace, `-` et `'`) et affiché comme du texte. Frein contre l'inondation : un mot toutes les 3 secondes sur le téléphone, un toutes les 2 secondes et 100 au plus par élève sur la page projetée. Le nuage reste caché, et les téléphones ne reçoivent aucun mot, tant que l'enseignant·e n'a pas cliqué sur « Montrer le nuage » ; ensuite les mots du tableau (sans leur auteur·rice) arrivent sur les téléphones, où l'on vote (une voix par mot, pas pour ses propres mots) ; la taille d'un mot suit son nombre de voix. « Relire et supprimer » et un clic sur un mot le suppriment, au tableau et sur les téléphones, sans retour possible. Le réglage « 2 voix au moins » est désactivé par défaut.

Le modèle : le cours de démonstration [`demo-types-de-questions.json`](demo-types-de-questions.json), avec `"demonstration": true` : il n'a pas les 20 questions à choix d'un cours de classe, et l'accueil le présente comme une démonstration. Dans un cours de classe : la ligne fautive `a01` de [`piles-files.json`](piles-files.json).

## Les messages d'erreur

« Trouve l'erreur » donne **toujours le message réel** de Python 3.13 (ou de SQLite pour le SQL) : de préférence dans le champ `console`, sous le code ; sinon cité entre accents graves dans un texte, **en entier** (`` `AttributeError: 'Pile' object has no attribute 'enfiler'. Did you mean: 'empiler'?` ``), suivi de sa traduction entre guillemets. Le vérificateur exécute le code du cours et refuse un message cité que Python ne donne pas mot pour mot. La correction d'une ligne fautive peut ne changer que l'indentation (une `IndentationError`). Le workflow de vérification utilise Python 3.13.

Le code s'affiche avec une indentation visible (un filet par niveau) et une coloration qui se lit aussi en noir et blanc : mots-clés en gras, fonctions soulignées, chaînes en italique, commentaires gris ; contrastes d'au moins 7:1.

## Le texte

Dans tous les textes : `` `code` `` (coloré comme du Python), `==mot-clé==` (en couleur, et aussi en gras souligné : la couleur ne porte jamais seule l'information), `**gras**` (ni gras ni mot-clé dans les options), `*italique*`. Tout le reste est affiché tel quel : aucune balise HTML. Un caractère spécial s'écrit lui-même (é, ·, →) ; un caractère invisible est refusé.

## Les schémas

Les schémas sont dessinés par le moteur, en SVG, à partir des données ; ils suivent le thème clair ou obscur et s'impriment en noir et blanc.

| `type` | Champs | Dessin |
|---|---|---|
| `pile` | `elements` : **du bas vers le haut** | une pile verticale, sommet repéré |
| `file` | `elements` : de la tête vers la queue | une file horizontale, tête (sortie) à gauche |
| `etapes` | `structure` (`pile` ou `file`), `etapes` : `[{ "op": "p.empiler(4)", "elements": [4] }, …]` (6 au plus) | l'état après chaque opération |
| `deux-piles` | `gauche` et `droite` : `{ "nom": "entree", "elements": [...] }`, `fleche` | deux piles côte à côte |
| `liste` | `elements` : des valeurs Python (`1`, `"chat"`, `true` en JSON) | une liste Python avec ses indices ; les valeurs s'affichent comme Python les écrit : `True`, `None`, `"chat"` |
| `decalage` | `elements` | le décalage provoqué par `pop(0)` |
| `svg` | `code` : un SVG écrit à la main (sans script ni attribut `on…`) | pour les autres cours (arbres, graphes) ; pas envoyé aux téléphones |

Chaque schéma accepte une `legende`. Un schéma « Python » (`liste`, ou tout schéma avec `variable`, `code` ou `"python": true`) affiche ses valeurs comme Python (`True`, `None`, chaînes entre guillemets) ; les autres affichent des étiquettes (« copie 1 », « taxi »).

**Un schéma qui se déduit d'un code est vérifié par exécution** (contrôle du vérificateur) :
- `etapes` avec `"variable": "p"` (ou `"f"`) : chaque `op` est du Python (`p.empiler(4)`) ; `p.depiler() → 1` vérifie aussi la valeur renvoyée ; après chaque étape, le contenu de la variable doit être exactement `elements` ;
- `pile`, `file`, `liste` ou `deux-piles` avec `"code": [lignes]` : après ce code, chaque variable dessinée (`variable`, ou le `nom` de chaque pile pour `deux-piles`) doit contenir exactement `elements`.

Rappel : pour une pile, `elements` va **du bas vers le haut** ; pour une file, de la tête vers la queue. Pour un nouveau type récurrent (un arbre binaire, un graphe), mieux vaut l'ajouter au moteur (`js/commun.js`, fonction `Q.schema`) qu'écrire du SVG à la main.

## Les vérifications

Chaque vérification exécute, dans un Python isolé (`python3 -I`) : `prelude_python`, puis le `code` de la question (sauf `"reprendre_code": false`), puis le `code` de la vérification. Elle compare :
- `sortie` : ce qui est affiché, exactement ;
- `erreur` : le nom de l'exception attendue (`"IndexError"`, `"RecursionError"`).

```json
"verifications": [
  { "code": ["print(haut_vers_bas(p))"], "sortie": "[3, 1, 4]" },
  { "code": [], "erreur": "IndexError" }
]
```

On vérifie la bonne réponse, et aussi ce qu'affirment les feedbacks des distracteurs quand c'est possible (le champ `option` dit lequel, pour la relecture).

## Ajouter le cours au catalogue

`cours/catalogue.json` est la seule source de la bibliothèque de l'accueil : une ligne par cours, dans l'ordre de l'année.

```json
{ "id": "arbres-binaires", "titre": "Arbres binaires", "niveau": "Terminale NSI", "theme": "nsi-tle-2019.structures-de-donnees", "gabarit": "introduction", "questions": 12, "duree_minutes": 15, "notions": ["arbre binaire", "nœud", "racine", "feuille", "taille", "hauteur"] }
```

| Champ | Contenu |
|---|---|
| `niveau` | un des `niveaux` du catalogue (`"Seconde SNT"`, `"Première NSI"`, `"Terminale NSI"`), le même que celui du cours |
| `theme` | l'identifiant d'un des `themes` du catalogue, du même niveau : les rubriques du programme de 2019, aux intitulés exacts, repris du référentiel du site Ressources NSI et SNT (`donnees/referentiels/programmes.json`). Les chaînes de caractères vont dans « Langages et programmation » |
| `gabarit` | le type : `introduction` (« Cours-quiz d'introduction ») ou `revision` (« Révision ») ; une démonstration a `"demonstration": true` à la place |
| `questions`, `duree_minutes` | comme dans le cours |
| `notions` | les mots que la recherche de l'accueil trouve, en plus du titre (sans tenir compte des accents ni des majuscules) |

Puis :

```bash
python3 -I outils/bibliotheque.py --ecrire   # réécrit la bibliothèque de index.html (la liste complète sans JavaScript)
python3 -I outils/verifier_cours.py --tous    # le contrôle complet
```

Avec `--tous`, le vérificateur contrôle que le catalogue cite chaque cours et seulement eux, que `questions`, `gabarit`, `duree_minutes` et `niveau` disent la même chose que le cours, que chaque thème existe et appartient au bon niveau, que chaque cours a ses notions, et que la bibliothèque de `index.html` est à jour.

Les liens : `revision.html?cours=<id>`, `animer.html?cours=<id>`, `imprimer.html?cours=<id>` et `imprimer.html?cours=<id>&corrige`.
