#!/usr/bin/env python3
"""QuizzNSI : la bibliothèque de l'accueil, tirée de cours/catalogue.json (la seule source).

    python3 -I outils/bibliotheque.py            # contrôle le catalogue et que index.html est à jour
    python3 -I outils/bibliotheque.py --ecrire   # réécrit la bibliothèque de index.html d'après le catalogue

Le catalogue décrit chaque cours-quiz : niveau, thème du programme de 2019, type (gabarit), durée,
nombre de questions, notions. La liste écrite dans index.html (entre les deux marques
« bibliotheque:debut » et « bibliotheque:fin ») en est la copie : sans JavaScript, c'est la liste
complète ; avec JavaScript, js/accueil.js la filtre sans rien recharger.
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


def sans_accents(s):
    """Minuscules, sans accents ni ligatures : la même règle que js/accueil.js (normaliser)."""
    s = unicodedata.normalize("NFD", str(s).lower()).replace("œ", "oe").replace("æ", "ae")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip()


def charger(racine=RACINE):
    with open(os.path.join(racine, "cours", "catalogue.json"), encoding="utf-8") as f:
        return json.load(f)


def controler(cat):
    """Les erreurs de forme du catalogue (liste de phrases ; vide si tout est conforme)."""
    e = []
    if cat.get("format") != "quizz-nsi-catalogue/2":
        e.append(f"« format » vaut {cat.get('format')!r}, attendu 'quizz-nsi-catalogue/2'")
    niveaux = {n.get("titre"): n for n in cat.get("niveaux", [])}
    themes = {t.get("id"): t for t in cat.get("themes", [])}
    types = {t.get("id"): t for t in cat.get("types", [])}
    for n in cat.get("niveaux", []):
        if not ID.match(str(n.get("id", ""))) or not n.get("titre"):
            e.append(f"niveau mal formé : {n!r}")
    for t in cat.get("themes", []):
        if t.get("niveau") not in niveaux or not t.get("titre") or not re.match(r"^[a-z0-9.-]{1,80}$", str(t.get("id", ""))):
            e.append(f"thème mal formé ou de niveau inconnu : {t!r}")
    for t in cat.get("types", []):
        if not ID.match(str(t.get("id", ""))) or not t.get("titre") or not t.get("puce"):
            e.append(f"type mal formé : {t!r}")
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
        notions = c.get("notions")
        if not isinstance(notions, list) or not notions or not all(isinstance(x, str) and x.strip() for x in notions):
            e.append(f"{nom} : « notions » doit être une liste de mots non vide")
    return e


def a(s):
    """Une valeur d'attribut."""
    return html.escape(str(s), quote=True)


def t(s):
    """Un texte (les apostrophes restent lisibles dans la source)."""
    return html.escape(str(s), quote=False)


def carte(c, types):
    i = a(c["id"])
    demo = c.get("demonstration") is True
    ty = types.get(c.get("gabarit"), {})
    puce = "Démonstration" if demo else ty.get("puce", "")
    meta = "un exemple de chaque type, non noté" if demo else f"{c['questions']} questions · {c['duree_minutes']}&#xA0;min"
    classe = "qz-carte" + (" rev" if c.get("gabarit") == "revision" else "") + (" demo" if demo else "")
    mots = sans_accents(" ".join([c["titre"]] + c.get("notions", [])))
    return (
        f'<li class="{classe}" data-cours="{i}" data-type="{a(c.get("gabarit", "demonstration"))}" data-theme="{a(c["theme"])}" data-mots="{a(mots)}">'
        f'<span class="puce">{t(puce)}</span>'
        f'<h4 id="t-{i}">{t(c["titre"])}</h4>'
        f'<p class="qz-meta">{meta}</p>'
        f'<p class="qz-notions"><span class="visuel-cache">Notions : </span>{t(", ".join(c.get("notions", [])))}</p>'
        f'<div class="qz-actions">'
        f'<a class="bt p" href="animer.html?cours={i}" aria-describedby="t-{i}">Animer en classe</a>'
        f'<a class="bt" href="revision.html?cours={i}" aria-describedby="t-{i}">Réviser seul·e</a></div>'
        f'<p class="qz-papier">Sur papier : <a href="imprimer.html?cours={i}" aria-describedby="t-{i}">les questions</a>'
        f' · <a href="imprimer.html?cours={i}&amp;corrige" aria-describedby="t-{i}">le corrigé</a></p>'
        f"</li>"
    )


def rendre(cat):
    """Le bloc HTML de la bibliothèque, à placer entre les deux marques de index.html."""
    types = {t["id"]: t for t in cat["types"]}
    classe = [c for c in cat["cours"] if c.get("demonstration") is not True]
    demos = [c for c in cat["cours"] if c.get("demonstration") is True]
    L = [f'<p id="compteur" class="qz-compteur" role="status">{len(classe)} cours-quiz, rangés par niveau, puis par thème du programme.</p>']
    for n in cat["niveaux"]:
        du_niveau = [c for c in classe if c["niveau"] == n["titre"]]
        if not du_niveau:
            continue
        nid = a(n["id"])
        L.append(f'<section class="qz-niveau" data-niveau="{nid}" aria-labelledby="n-{nid}">')
        L.append(f'<h2 class="qz-titre-niveau" id="n-{nid}">{t(n["titre"])}</h2>')
        for th in (x for x in cat["themes"] if x["niveau"] == n["titre"]):
            du_theme = [c for c in du_niveau if c["theme"] == th["id"]]
            if not du_theme:
                continue
            tid = a(th["id"])
            hid = "h-" + tid.replace(".", "-")
            L.append(f'<section class="qz-bloc" data-theme="{tid}" aria-labelledby="{hid}">')
            L.append(f'<h3 class="qz-theme" id="{hid}">{t(th["titre"])}</h3>')
            L.append('<ul class="qz-grille">')
            L.extend(carte(c, types) for c in du_theme)
            L.append("</ul></section>")
        L.append("</section>")
    if demos:
        L.append('<section class="qz-niveau qz-decouvrir" aria-labelledby="n-decouvrir">')
        L.append('<h2 class="qz-titre-niveau petit" id="n-decouvrir">Pour découvrir les types de questions</h2>')
        L.append('<ul class="qz-grille">' + "".join(carte(c, types) for c in demos) + "</ul></section>")
    return "\n".join(L)


def filtres(cat):
    """Les filtres (cachés sans JavaScript) : niveau, type, thème."""
    classe = [c for c in cat["cours"] if c.get("demonstration") is not True]
    L = ['<fieldset class="qz-f-niveau"><legend>Niveau</legend>',
         '<label><input type="radio" name="niveau" value="" checked> Tous les niveaux</label>']
    for n in cat["niveaux"]:
        nb = sum(1 for c in classe if c["niveau"] == n["titre"])
        if nb:
            L.append(f'<label><input type="radio" name="niveau" value="{a(n["id"])}"> {t(n["titre"])}</label>')
        else:
            L.append(f'<label class="qz-bientot"><input type="radio" name="niveau" value="{a(n["id"])}" disabled> {t(n["titre"])} (bientôt)</label>')
    L.append("</fieldset>")
    L.append('<fieldset class="qz-f-type"><legend>Type</legend>')
    for ty in cat["types"]:
        L.append(f'<label><input type="checkbox" name="type" value="{a(ty["id"])}" checked> {t(ty["titre"])}</label>')
    L.append("</fieldset>")
    L.append('<fieldset class="qz-f-theme"><legend>Thème du programme</legend>')
    for n in cat["niveaux"]:
        ths = [x for x in cat["themes"] if x["niveau"] == n["titre"] and any(c["theme"] == x["id"] for c in classe)]
        if not ths:
            continue
        L.append(f'<div class="qz-f-groupe" data-niveau="{a(n["id"])}"><p class="qz-f-sous" aria-hidden="true">{t(n["titre"])}</p>')
        for th in ths:
            L.append(f'<label><input type="checkbox" name="theme" value="{a(th["id"])}" checked> {t(th["titre"])}<span class="visuel-cache"> ({t(n["titre"])})</span></label>')
        L.append("</div>")
    L.append("</fieldset>")
    return "\n".join(L)


def bloc(cat):
    """Le bloc complet entre les deux marques : les filtres (cachés sans JavaScript) et la bibliothèque."""
    return "\n".join([
        DEBUT,
        '<div class="qz-corps">',
        '<aside class="qz-filtres" id="filtres" aria-label="Chercher et filtrer" hidden>',
        '<form id="form-filtres" role="search" aria-label="Chercher un cours-quiz">',
        '<label class="lab" for="recherche">Chercher</label>',
        '<input id="recherche" name="q" type="search" class="champ" placeholder="pile, tri, SQL…" autocomplete="off" spellcheck="false" aria-describedby="aide-recherche">',
        '<p class="qz-aide" id="aide-recherche">Dans les titres et les notions ; les accents ne comptent pas.</p>',
        '<details class="qz-plus" id="plus-filtres"><summary>Niveau, type et thème</summary>',
        filtres(cat),
        "</details>",
        '<button class="bt mini qz-tout" type="button" id="tout-montrer">Tout montrer</button>',
        "</form>",
        "</aside>",
        '<div class="qz-res" id="bibliotheque">',
        rendre(cat),
        '<div class="qz-aucun carte pointille" id="aucun" hidden tabindex="-1"></div>',
        "</div>",
        "</div>",
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
    print(f"== bibliothèque : {len(cat['cours'])} cours, {len({c['theme'] for c in cat['cours']})} thèmes, index.html à jour")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
