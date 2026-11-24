#!/usr/bin/env python3
"""QuizzNSI : la bibliothèque de l'accueil, tirée de cours/catalogue.json (la seule source).

    python3 -I outils/bibliotheque.py            # contrôle le catalogue et que index.html est à jour
    python3 -I outils/bibliotheque.py --ecrire   # réécrit la bibliothèque de index.html d'après le catalogue

Le catalogue décrit chaque cours-quiz : niveau, type (gabarit), durée, nombre de questions, notions
travaillées (de 2 à 5, prises dans la liste fermée « notions », reprise du thésaurus du site Ressources
NSI et SNT), mots-clés (pour la recherche) et thème du programme de 2019 (une donnée, pas un filtre).
La liste écrite dans index.html (entre les marques « bibliotheque:debut » et « bibliotheque:fin ») en est
la copie : sans JavaScript, c'est la liste complète ; avec JavaScript, js/accueil.js l'affine comme la
bibliothèque du site (cases « Niveau », « Type » et « Notions travaillées » avec leur nombre, recherche).
Le contrôle croisé avec les fichiers des cours (chaque cours au catalogue et réciproquement, questions,
gabarit, durée, niveau) est fait par outils/verifier_cours.py --tous, qui appelle aussi ce contrôle.

Code MIT, Babash - NSI Tani Malandi.
"""
import html
import json
import os
import re
import sys
import unicodedata

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DEBUT, FIN = "<!-- bibliotheque:debut -->", "<!-- bibliotheque:fin -->"
ID = re.compile(r"^[a-z0-9-]{1,60}$")
ID_NOTION = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)*$")
FORMAT = "quizz-nsi-catalogue/3"
NOTIONS_MIN, NOTIONS_MAX = 2, 5


def sans_accents(s):
    """Minuscules, sans accents ni ligatures : la même règle que js/accueil.js (normaliser)."""
    s = unicodedata.normalize("NFD", str(s).lower()).replace("œ", "oe").replace("æ", "ae")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def racine_du_mot(s):
    """Pour repérer les quasi-doublons : sans accents, sans « s » ou « x » final à chaque mot."""
    return " ".join(re.sub(r"(s|x)$", "", m) for m in re.split(r"[\s'’-]+", sans_accents(s)) if m)


def charger(racine=RACINE):
    with open(os.path.join(racine, "cours", "catalogue.json"), encoding="utf-8") as f:
        return json.load(f)


def controler(cat):
    """Les erreurs de forme du catalogue (liste de phrases ; vide si tout est conforme)."""
    e = []
    if cat.get("format") != FORMAT:
        e.append(f"« format » vaut {cat.get('format')!r}, attendu {FORMAT!r}")
    niveaux = {n.get("titre"): n for n in cat.get("niveaux", [])}
    themes = {t.get("id"): t for t in cat.get("themes", [])}
    types = {t.get("id"): t for t in cat.get("types", [])}
    notions = {n.get("id"): n for n in cat.get("notions", [])}
    for n in cat.get("niveaux", []):
        if not ID.match(str(n.get("id", ""))) or not n.get("titre"):
            e.append(f"niveau mal formé : {n!r}")
    for x in cat.get("themes", []):
        if x.get("niveau") not in niveaux or not x.get("titre") or not re.match(r"^[a-z0-9.-]{1,80}$", str(x.get("id", ""))):
            e.append(f"thème mal formé ou de niveau inconnu : {x!r}")
    for x in cat.get("types", []):
        if not ID.match(str(x.get("id", ""))) or not x.get("titre") or not x.get("puce"):
            e.append(f"type mal formé : {x!r}")
    # la liste fermée des notions : identifiants et libellés du site, sans doublon ni quasi-doublon
    racines = {}
    for n in cat.get("notions", []):
        if not ID_NOTION.match(str(n.get("id", ""))) or not str(n.get("libelle", "")).strip():
            e.append(f"notion mal formée : {n!r}"); continue
        if not isinstance(n.get("alternatifs", []), list):
            e.append(f"notion « {n['libelle']} » : « alternatifs » doit être une liste")
        r = racine_du_mot(n["libelle"])
        if r in racines:
            e.append(f"notions « {racines[r]} » et « {n['libelle']} » : quasi-doublon, en garder une")
        racines[r] = n["libelle"]
    if len(notions) != len(cat.get("notions", [])):
        e.append("une notion est déclarée deux fois")
    utilisees = set()
    vus, titres = set(), set()
    for c in cat.get("cours", []):
        i = c.get("id")
        nom = f"cours « {i} »"
        if not isinstance(i, str) or not ID.match(i):
            e.append(f"{nom} : identifiant mal formé"); continue
        if i in vus:
            e.append(f"{nom} : cité deux fois")
        vus.add(i)
        if not c.get("titre"):
            e.append(f"{nom} : pas de titre")
        elif c["titre"] in titres:
            e.append(f"{nom} : titre déjà pris")
        titres.add(c.get("titre"))
        if c.get("niveau") not in niveaux:
            e.append(f"{nom} : niveau {c.get('niveau')!r} inconnu ({', '.join(niveaux)})")
        t = themes.get(c.get("theme"))
        if t is None:
            e.append(f"{nom} : thème {c.get('theme')!r} absent de la liste des thèmes du programme")
        elif t.get("niveau") != c.get("niveau"):
            e.append(f"{nom} : le thème {c.get('theme')!r} est un thème de {t.get('niveau')}, pas de {c.get('niveau')}")
        if c.get("demonstration") is True:
            if "gabarit" in c:
                e.append(f"{nom} : une démonstration n'a pas de gabarit")
        elif c.get("gabarit") not in types:
            e.append(f"{nom} : type (gabarit) {c.get('gabarit')!r} inconnu ({', '.join(types)})")
        else:
            if not isinstance(c.get("questions"), int) or c["questions"] < 1:
                e.append(f"{nom} : nombre de questions absent")
            if not isinstance(c.get("duree_minutes"), int) or not 1 <= c["duree_minutes"] <= 45:
                e.append(f"{nom} : durée absente (de 1 à 45 minutes)")
        ns = c.get("notions")
        if not isinstance(ns, list) or not NOTIONS_MIN <= len(ns) <= NOTIONS_MAX:
            e.append(f"{nom} : « notions » doit citer de {NOTIONS_MIN} à {NOTIONS_MAX} notions de la liste fermée")
        else:
            if len(set(ns)) != len(ns):
                e.append(f"{nom} : une notion est citée deux fois")
            for x in ns:
                if x not in notions:
                    e.append(f"{nom} : notion {x!r} absente de la liste fermée « notions »")
                utilisees.add(x)
        mots = c.get("mots_cles")
        if not isinstance(mots, list) or not mots or not all(isinstance(x, str) and x.strip() for x in mots):
            e.append(f"{nom} : « mots_cles » doit être une liste de mots non vide")
    for x in notions:
        if x not in utilisees:
            e.append(f"notion « {notions[x].get('libelle')} » ({x}) : aucun cours ne la travaille ; la retirer de la liste")
    return e


def a(s):
    """Une valeur d'attribut."""
    return html.escape(str(s), quote=True)


def t(s):
    """Un texte (les apostrophes restent lisibles dans la source)."""
    return html.escape(str(s), quote=False)


def mots_de_recherche(c, notions):
    """Ce que la recherche lit : le titre, les mots-clés, les notions (libellés, alternatifs et mots du code du site)."""
    morceaux = [c["titre"]] + c.get("mots_cles", [])
    for x in c.get("notions", []):
        n = notions[x]
        morceaux += [n["libelle"]] + n.get("alternatifs", [])
    return sans_accents(" | ".join(morceaux))


def carte(c, types, notions, niveaux):
    i = a(c["id"])
    demo = c.get("demonstration") is True
    ty = types.get(c.get("gabarit"), {})
    puce = "Démonstration" if demo else ty.get("puce", "")
    meta = "un exemple de chaque type de question" if demo else f"{c['questions']} questions · {c['duree_minutes']}&#xA0;min"
    classe = "qz-carte" + (" rev" if c.get("gabarit") == "revision" else "") + (" demo" if demo else "")
    libelles = ", ".join(notions[x]["libelle"] for x in c["notions"])
    return (
        f'<li class="{classe}" data-cours="{i}" data-niveau="{a(niveaux[c["niveau"]]["id"])}" data-type="{a(c.get("gabarit", "demonstration"))}"'
        f' data-notions="{a(" ".join(c["notions"]))}" data-mots="{a(mots_de_recherche(c, notions))}">'
        f'<span class="puce">{t(puce)}</span>'
        f'<h3 id="t-{i}">{t(c["titre"])}</h3>'
        f'<p class="qz-meta">{meta}</p>'
        f'<p class="qz-notions"><span class="visuel-cache">Notions travaillées : </span>{t(libelles)}</p>'
        f'<div class="qz-actions">'
        f'<a class="bt p" href="animer.html?cours={i}" aria-describedby="t-{i}">Animer en classe</a>'
        f'<a class="bt" href="revision.html?cours={i}" aria-describedby="t-{i}">Réviser seul·e</a></div>'
        f'<p class="qz-papier">Sur papier : <a href="imprimer.html?cours={i}" aria-describedby="t-{i}">les questions</a>'
        f' · <a href="imprimer.html?cours={i}&amp;corrige" aria-describedby="t-{i}">le corrigé</a></p>'
        f"</li>"
    )


def rendre(cat):
    """La bibliothèque : par niveau, puis dans l'ordre de l'année ; la démonstration à part."""
    types = {x["id"]: x for x in cat["types"]}
    notions = {x["id"]: x for x in cat["notions"]}
    niveaux = {x["titre"]: x for x in cat["niveaux"]}
    classe = [c for c in cat["cours"] if c.get("demonstration") is not True]
    demos = [c for c in cat["cours"] if c.get("demonstration") is True]
    L = [f'<p id="compteur" class="qz-compteur" role="status">{len(classe)} cours-quiz, rangés par niveau.</p>',
         '<div class="qz-puces" id="puces" hidden></div>']
    for n in cat["niveaux"]:
        du_niveau = [c for c in classe if c["niveau"] == n["titre"]]
        if not du_niveau:
            continue
        nid = a(n["id"])
        L.append(f'<section class="qz-niveau" data-niveau="{nid}" aria-labelledby="n-{nid}">')
        L.append(f'<h2 class="qz-titre-niveau" id="n-{nid}">{t(n["titre"])}</h2>')
        L.append('<ul class="qz-grille">')
        L.extend(carte(c, types, notions, niveaux) for c in du_niveau)
        L.append("</ul></section>")
    if demos:
        L.append('<section class="qz-niveau qz-decouvrir" aria-labelledby="n-decouvrir">')
        L.append('<h2 class="qz-titre-niveau petit" id="n-decouvrir">Pour découvrir les types de questions</h2>')
        L.append('<ul class="qz-grille">' + "".join(carte(c, types, notions, niveaux) for c in demos) + "</ul></section>")
    return "\n".join(L)


def vocabulaire(cat):
    """Les libellés des filtres, pour js/accueil.js (un bloc JSON, sans HTML)."""
    v = {
        "niveaux": [{"id": n["id"], "libelle": n["titre"]} for n in cat["niveaux"]],
        "types": [{"id": x["id"], "libelle": x["titre"]} for x in cat["types"]],
        "notions": [{"id": x["id"], "libelle": x["libelle"]} for x in cat["notions"]],
    }
    s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return s.replace("<", "\\u003c").replace("&", "\\u0026")


def bloc(cat):
    """Le bloc complet entre les deux marques : la recherche et les filtres (cachés sans JavaScript), la bibliothèque."""
    return "\n".join([
        DEBUT,
        '<div class="qz-corps">',
        '<aside class="qz-filtres" id="filtres" aria-label="Chercher et filtrer" hidden>',
        '<form id="form-filtres" role="search" aria-label="Chercher un cours-quiz">',
        '<label class="lab" for="recherche">Chercher</label>',
        '<input id="recherche" name="q" type="search" class="champ" placeholder="pile, boucle, SQL…" autocomplete="off" spellcheck="false" aria-describedby="aide-recherche">',
        '<p class="qz-aide" id="aide-recherche">Dans les titres, les mots-clés et les notions ; les accents ne comptent pas.</p>',
        "</form>",
        '<details class="qz-plus" id="plus-filtres"><summary>Filtres <span class="nb" id="nb-filtres"></span></summary>',
        '<div id="facettes"></div>',
        "</details>",
        "</aside>",
        '<div class="qz-res" id="bibliotheque">',
        rendre(cat),
        '<div class="qz-aucun carte pointille" id="aucun" hidden tabindex="-1"></div>',
        "</div>",
        "</div>",
        '<script type="application/json" id="vocabulaire">' + vocabulaire(cat) + "</script>",
        FIN,
    ])


def remplacer(page, cat):
    d, f = page.find(DEBUT), page.find(FIN)
    if d < 0 or f < d:
        raise ValueError("index.html n'a pas les marques bibliotheque:debut et bibliotheque:fin")
    return page[:d] + bloc(cat) + page[f + len(FIN):]


def main(args, racine=RACINE):
    cat = charger(racine)
    erreurs = controler(cat)
    for x in erreurs:
        print("  ERREUR · cours/catalogue.json · " + x)
    if erreurs:
        return 1
    chemin = os.path.join(racine, "index.html")
    with open(chemin, encoding="utf-8") as f:
        page = f.read()
    neuve = remplacer(page, cat)
    if "--ecrire" in args:
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(neuve)
        print("== index.html : bibliothèque réécrite d'après le catalogue")
        return 0
    if neuve != page:
        print("  ERREUR · index.html : la bibliothèque n'est pas à jour ; lance python3 -I outils/bibliotheque.py --ecrire")
        return 1
    print(f"== bibliothèque : {len(cat['cours'])} cours, {len(cat['notions'])} notions travaillées, index.html à jour")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
