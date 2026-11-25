#!/usr/bin/env python3
"""QuizzNSI : vérificateur d'un fichier de cours-quiz (cours/<id>.json).

Lancement, depuis la racine de QuizzNSI :
    python3 -I outils/verifier_cours.py cours/piles-files.json
    python3 -I outils/verifier_cours.py --tous            (tous les fichiers de cours/)
    python3 -I outils/verifier_cours.py --sans-execution cours/x.json

Ce qu'il contrôle (le détail est dans cours/FORMAT.md) :
- la forme : champs obligatoires, types de diapositives, schémas connus ;
- le gabarit du cours (« gabarit ») :
  « introduction » : 15 minutes, 12 questions (à choix, plus 2 au plus de type relier, puzzle ou ligne
  fautive, jamais de nuage de mots), 8 écrans de cours au plus, 25 mots au plus par écran (hors code) ;
  « revision » (la valeur par défaut, le format d'avant T113) : 20 questions à choix ;
  un cours de démonstration (« demonstration »: true) : moins de questions, aucun gabarit ;
  et la durée estimée de la séance ;
- les questions (règle 22) : 4 options, une seule juste, un feedback
  pour chaque option, l'objectif, le nom, aucune mise en avant (gras) ;
- la répartition des bonnes réponses entre A, B, C et D, sans série ni motif évident,
  et la bonne réponse qui n'est pas trop souvent la plus longue ;
- les caractères invisibles ou de contrôle, refusés partout ;
- l'exécution : le prélude Python, puis le code affiché, puis chaque vérification ;
  la sortie et l'erreur attendues doivent être exactement celles obtenues ;
- les autres types de questions (nuage de mots, relier, puzzle de code, ligne fautive) : leur forme,
  l'exécution de leur code (la solution du puzzle, le code fautif et le code corrigé, les paires « code et
  sortie »), et l'ordre mélangé qui ne laisse jamais la solution en place (le même calcul que js/commun.js).

Code de sortie : 0 si tout est conforme (des avertissements sont possibles), 1 sinon.
Licence MIT, Babash - NSI Tani Malandi.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata

FORMAT = "quizz-nsi/1"
LETTRES = "ABCD"
TYPES_DIAPO = {"titre", "partie", "classe", "humour", "notion", "question", "bilan", "nuage", "relier", "puzzle", "ligne"}
AUTRES_TYPES = {"nuage", "relier", "puzzle", "ligne"}   # les autres types de questions (js/activites.js)
RELIER_MAX, PUZZLE_MIN, PUZZLE_MAX, INDENT_MAX, LIGNES_MAX = 6, 3, 12, 6, 40
TYPES_SCHEMA = {"pile", "file", "etapes", "deux-piles", "liste", "decalage", "svg"}
LARGEUR_MAX = 27          # caractères par ligne de code : écrans d'introduction, questions, options, lignes fautives (320 px)
FEEDBACK_MIN = 40          # caractères : un feedback plus court n'explique rien
TEXTE_NOTION_MAX = 3       # puces par notion (peu de texte, règle 3)
PUCE_MAX = 300             # caractères par puce
DELAI = 20                 # secondes par exécution
# Un message d'erreur cité dans un texte (`AttributeError: … Did you mean: 'empiler'?`) : il doit être, mot pour mot,
# la dernière ligne d'une erreur obtenue en exécutant le code du cours (Python 3.13).
MESSAGE_CITE = re.compile(r"`([A-Z][A-Za-z]*(?:Error|Exception|Warning)(?::[^`]*)?)`")
MESSAGES_OBTENUS = set()   # rempli par executer(), vidé au début de chaque cours

# Les gabarits (cours/FORMAT.md, « Les gabarits »). « revision » est la valeur par défaut : c'est le format
# des cours écrits avant T113 (20 questions à choix, les autres types en bonus, non comptés).
GABARITS = {
    "introduction": {"questions": 12, "autres_max": 2, "nuage": False, "ecrans_max": 8, "mots_max": 25,
                     "phrases_max": 2, "code_notion_max": 10, "duree": 15, "bilan_lignes_max": 5},
    "revision": {"questions": 20},
}
ECRANS = {"notion", "classe", "humour", "partie"}   # les écrans de cours (ni question, ni titre, ni bilan)
# La durée estimée, en minutes, d'après une séance projetée (réponse au téléphone, puis correction commentée).
DUREE = {"titre": 0.5, "ecran": 0.5, "question": 0.75, "code": 0.15, "autre": 1.0, "bilan": 0.5}


class Rapport:
    def __init__(self):
        self.erreurs, self.avertissements = [], []

    def erreur(self, ou, msg):
        self.erreurs.append(f"{ou} : {msg}")

    def avert(self, ou, msg):
        self.avertissements.append(f"{ou} : {msg}")


def caracteres_interdits(texte):
    """Renvoie les caractères de contrôle, invisibles ou privés d'une chaîne."""
    mauvais = []
    for c in texte:
        cat = unicodedata.category(c)
        if c == "\n" or c == " ":
            continue
        if cat in ("Cc", "Cf", "Co", "Cs", "Cn", "Zl", "Zp") or (cat == "Zs" and c != " " and c != chr(0xA0) and c != chr(0x202F)):
            mauvais.append(f"U+{ord(c):04X}")
    return mauvais


def parcourir_chaines(obj, chemin="cours"):
    if isinstance(obj, str):
        yield chemin, obj
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from parcourir_chaines(v, f"{chemin}[{i}]")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from parcourir_chaines(v, f"{chemin}.{k}")


def liste_de_chaines(v):
    return isinstance(v, list) and all(isinstance(x, str) for x in v)


def verifier_schema(s, ou, r):
    if not isinstance(s, dict) or s.get("type") not in TYPES_SCHEMA:
        r.erreur(ou, f"schéma inconnu (types permis : {', '.join(sorted(TYPES_SCHEMA))})")
        return
    t = s["type"]
    if t in ("pile", "file", "liste", "decalage") and not isinstance(s.get("elements"), list):
        r.erreur(ou, f"le schéma « {t} » demande une liste « elements »")
    if "code" in s and s.get("type") != "svg" and not liste_de_chaines(s["code"]):
        r.erreur(ou, "« code » d'un schéma : une liste de lignes")
    if t == "etapes":
        if s.get("structure") not in ("pile", "file"):
            r.erreur(ou, "le schéma « etapes » demande « structure » : pile ou file")
        et = s.get("etapes")
        if not isinstance(et, list) or not et or not all(isinstance(e, dict) and isinstance(e.get("op"), str) and isinstance(e.get("elements"), list) for e in et):
            r.erreur(ou, "le schéma « etapes » demande des étapes { op, elements }")
        elif len(et) > 6:
            r.avert(ou, "plus de 6 étapes : le schéma sera serré à 320 px")
    if t == "deux-piles":
        for cote in ("gauche", "droite"):
            c = s.get(cote)
            if not isinstance(c, dict) or not isinstance(c.get("nom"), str) or not isinstance(c.get("elements"), list):
                r.erreur(ou, f"le schéma « deux-piles » demande « {cote} » : {{ nom, elements }}")
    if t == "svg":
        code = s.get("code", "")
        if (not isinstance(code, str) or not code.strip().startswith("<svg") or "<script" in code.lower()
                or re.search(r"\son[a-z]+\s*=", code.lower()) or "javascript:" in code.lower()):
            r.erreur(ou, "le schéma « svg » doit commencer par <svg et ne contenir ni script ni attribut on…")


def programme_schema(s):
    """Le programme Python qui recalcule l'état dessiné par un schéma, ou None s'il ne se déduit d'aucun code.

    - « etapes » avec « variable » : chaque « op » est du code ; « code → valeur » vérifie aussi la valeur
      renvoyée ; après chaque étape, le contenu de la variable doit être exactement « elements »
      (une pile du bas vers le haut, une file de la tête vers la queue, comme le dessin) ;
    - « pile », « file », « liste », « deux-piles » avec « code » : après le code, chaque variable dessinée
      (« variable », ou le « nom » de chaque pile pour deux-piles) contient exactement « elements »."""
    t = s.get("type")
    lignes = []
    if t == "etapes" and s.get("variable"):
        v = s["variable"]
        if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", v):
            return None
        classe = "Pile" if s.get("structure") == "pile" else "File"
        if not s["etapes"] or "=" not in s["etapes"][0]["op"].split("→")[0]:
            lignes.append(f"{v} = {classe}()")
        for k, e in enumerate(s["etapes"]):
            code, _, attendu = e["op"].partition("→")
            code, attendu = code.strip(), attendu.strip()
            if attendu:
                lignes.append(f"__r = {code}")
                lignes.append(f"assert __r == ({attendu}), {f'étape {k + 1} : {code} renvoie '!r} + repr(__r) + {f', le schéma dit {attendu}'!r}")
            else:
                lignes.append(code)
            dessin = e["elements"]
            msg1, msg2 = f"étape {k + 1} ({code}) : état obtenu ", f", état dessiné {dessin!r}"
            lignes.append(f"assert {v}.contenu == {dessin!r}, {msg1!r} + repr({v}.contenu) + {msg2!r}")
        return lignes
    if t in ("pile", "file", "liste", "deux-piles") and isinstance(s.get("code"), list):
        lignes = list(s["code"])
        if t == "deux-piles":
            cotes = [(s["gauche"]["nom"], s["gauche"]["elements"]), (s["droite"]["nom"], s["droite"]["elements"])]
        else:
            cotes = [(s.get("variable", "p" if t == "pile" else "f" if t == "file" else "liste"), s["elements"])]
        for nom, el in cotes:
            if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", nom):
                return None
            contenu = nom if t == "liste" else nom + ".contenu"
            lignes.append(f"assert {contenu} == {el!r}, {f'{nom} : état obtenu '!r} + repr({contenu}) + {f', état dessiné {el!r}'!r}")
        return lignes
    return None


def verifier_schema_execution(s, prelude, ou, r):
    if not isinstance(s, dict):
        return
    prog = programme_schema(s)
    if prog is None:
        return
    sortie, err, detail = executer(list(prelude) + prog)
    if err:
        msg = detail.splitlines()[-1] if detail else err
        r.erreur(ou, f"schéma faux : {msg}")


def executer(lignes, delai=DELAI):
    """Exécute un programme Python isolé ; renvoie (sortie, nom de l'erreur ou None, message)."""
    with tempfile.TemporaryDirectory() as d:
        chemin = os.path.join(d, "essai.py")
        with open(chemin, "w", encoding="utf-8") as f:
            f.write("\n".join(lignes) + "\n")
        try:
            p = subprocess.run([sys.executable, "-I", chemin], capture_output=True, text=True, timeout=delai, cwd=d,
                               env={"PYTHONIOENCODING": "utf-8", "PATH": os.environ.get("PATH", "")})
        except subprocess.TimeoutExpired:
            return "", "Timeout", f"plus de {delai} s"
    erreur = None
    if p.returncode != 0:
        derniere = [l for l in p.stderr.strip().splitlines() if l.strip()]
        derniere = derniere[-1] if derniere else ""
        erreur = derniere.split(":")[0].strip() or "Erreur"
        MESSAGES_OBTENUS.add(derniere.strip())
    return p.stdout.rstrip("\n"), erreur, p.stderr.strip()


def verifier_console(lignes, console, ou, r):
    """« console » : ce que Python affiche en exécutant le code, mot pour mot (la sortie, puis la dernière ligne
    de l'erreur, « Did you mean » compris)."""
    if not liste_de_chaines(console) or not console:
        r.erreur(ou, "« console » : une liste de lignes")
        return
    sortie, err, detail = executer(lignes)
    obtenu = sortie.splitlines() if sortie else []
    if err:
        obtenu.append([l for l in detail.splitlines() if l.strip()][-1].strip())
    if obtenu != console:
        r.erreur(ou, f"console : Python affiche {obtenu!r}, le cours cite {console!r}")


def verifier_question(q, n, prelude, r, executer_code=True):
    ou = f"question {n} ({q.get('id', '?')})"
    for champ in ("id", "nom", "objectif"):
        if not isinstance(q.get(champ), str) or not q[champ].strip():
            r.erreur(ou, f"champ « {champ} » manquant ou vide")
    if not liste_de_chaines(q.get("enonce")) or not q.get("enonce"):
        r.erreur(ou, "« enonce » doit être une liste de paragraphes non vide")
    if "code" in q and not liste_de_chaines(q["code"]):
        r.erreur(ou, "« code » doit être une liste de lignes")
    elif "code" in q:
        for k, l in enumerate(q["code"]):
            if len(l) > LARGEUR_MAX:
                r.erreur(ou, f"ligne de code {k + 1} : {len(l)} caractères ; {LARGEUR_MAX} au plus (lisible à 320 px)")
    if "console" in q:
        if not q.get("code"):
            r.erreur(ou, "« console » : seulement sous un code")
        elif executer_code:
            verifier_console(list(prelude) + q["code"], q["console"], ou, r)
    if "schema" in q:
        verifier_schema(q["schema"], ou, r)
        if executer_code:
            verifier_schema_execution(q["schema"], prelude, ou + ", schéma", r)
    if not isinstance(q.get("explication"), str) or not q["explication"].strip():
        r.erreur(ou, "« explication » manquante (la phrase qui consolide, montrée après la réponse)")
    opts = q.get("options")
    if not isinstance(opts, list) or len(opts) != 4:
        r.erreur(ou, "il faut exactement 4 options (QCU, règle 22)")
        return None, 0
    justes = [i for i, o in enumerate(opts) if isinstance(o, dict) and o.get("juste") is True]
    if len(justes) != 1:
        r.erreur(ou, f"il faut une seule option juste ({len(justes)} trouvée·s)")
    vus, longueurs = set(), []
    for i, o in enumerate(opts):
        oo = f"{ou}, option {LETTRES[i]}"
        if not isinstance(o, dict):
            r.erreur(oo, "une option est un objet { texte ou code, feedback, juste? }")
            longueurs.append(0)
            continue
        inconnus = set(o) - {"texte", "code", "feedback", "juste"}
        if inconnus:
            r.erreur(oo, f"champ inconnu : {', '.join(sorted(inconnus))}")
        if "juste" in o and o["juste"] is not True:
            r.erreur(oo, "« juste » vaut true, ou n'est pas écrit")
        texte = o.get("texte", "")
        code = o.get("code", [])
        if not (isinstance(texte, str) and texte.strip()) and not (liste_de_chaines(code) and code):
            r.erreur(oo, "l'option n'a ni « texte » ni « code »")
        if "code" in o and not liste_de_chaines(code):
            r.erreur(oo, "« code » doit être une liste de lignes")
        elif "code" in o:
            for k, l in enumerate(code):
                if len(l) > LARGEUR_MAX:
                    r.erreur(oo, f"ligne de code {k + 1} : {len(l)} caractères ; {LARGEUR_MAX} au plus (lisible à 320 px)")
        contenu = (texte if isinstance(texte, str) else "") + "\n".join(code if liste_de_chaines(code) else [])
        if "**" in contenu or "==" in contenu.replace("== ", "").replace(" ==", "") or "<b>" in contenu.lower() or "<strong" in contenu.lower():
            r.erreur(oo, "aucune mise en avant dans une option (gras interdit)")
        if contenu in vus:
            r.erreur(oo, "option identique à une autre")
        vus.add(contenu)
        longueurs.append(len(contenu))
        fb = o.get("feedback")
        if not isinstance(fb, str) or len(fb.strip()) < FEEDBACK_MIN:
            r.erreur(oo, f"feedback manquant ou trop court (au moins {FEEDBACK_MIN} caractères qui expliquent)")
    # les noms cités en code dans les options et les feedbacks (`impressions.pop(0)`, `aux[0]`)
    # doivent exister dans le code de la question (ou dans le prélude)
    if q.get("code"):
        connus = set(re.findall(r"[A-Za-z_]\w*", "\n".join(q["code"] + list(prelude))))
        for i, o in enumerate(opts):
            if not isinstance(o, dict):
                continue
            for champ in ("texte", "feedback"):
                for seg in re.findall(r"`([^`]+)`", str(o.get(champ, ""))):
                    m = re.match(r"\s*([A-Za-z_]\w*)\s*[.\[]", seg)
                    if m and m.group(1) not in connus:
                        r.erreur(f"{ou}, option {LETTRES[i]}", f"« {m.group(1)} » ({champ}) n'existe pas dans le code de la question")
    # un renvoi « question n » vise une question déjà posée, jamais elle-même ni une suivante
    textes = list(q.get("enonce", [])) + [str(q.get("explication", ""))] + [str(o.get(k, "")) for o in opts if isinstance(o, dict) for k in ("texte", "feedback")]
    for t in textes:
        for m in re.finditer(r"[Qq]uestion (\d+)", t):
            if int(m.group(1)) >= n:
                r.erreur(ou, f"renvoi à la question {m.group(1)} : elle n'est pas encore posée (ou c'est celle-ci)")
    juste = justes[0] if len(justes) == 1 else None
    plus_longue = juste is not None and longueurs[juste] == max(longueurs) and longueurs.count(max(longueurs)) == 1

    # l'exécution
    verifs = q.get("verifications", [])
    if not isinstance(verifs, list):
        r.erreur(ou, "« verifications » doit être une liste")
        verifs = []
    if (q.get("code") or any(isinstance(o, dict) and o.get("code") for o in opts)) and not verifs and not q.get("note_verification"):
        r.erreur(ou, "du code est affiché : il faut au moins une vérification par exécution")
    if executer_code:
        for k, v in enumerate(verifs):
            ov = f"{ou}, vérification {k + 1}"
            if not isinstance(v, dict) or not liste_de_chaines(v.get("code", [])):
                r.erreur(ov, "une vérification est { code: [lignes], sortie?, erreur?, reprendre_code? }")
                continue
            if "sortie" not in v and "erreur" not in v:
                r.erreur(ov, "indique « sortie » ou « erreur » attendue")
                continue
            lignes = list(prelude)
            if v.get("reprendre_code", True):
                lignes += q.get("code", [])
            lignes += v["code"]
            sortie, err, detail = executer(lignes)
            attendue = v.get("erreur")
            if err != attendue:
                r.erreur(ov, f"erreur attendue {attendue!r}, obtenue {err!r}" + (f" ({detail.splitlines()[-1]})" if detail else ""))
            if "sortie" in v and sortie != v["sortie"]:
                r.erreur(ov, f"sortie attendue {v['sortie']!r}, obtenue {sortie!r}")
    return juste, plus_longue


# ── Le hasard reproductible de js/commun.js (Q.graine, Q.hasard, Q.melanger), recalculé à l'identique ──
M32 = 0xFFFFFFFF


def _imul(a, b):
    return (a * b) & M32


def graine(texte):
    h = 0x811c9dc5
    for c in texte:
        h ^= ord(c)
        h = _imul(h, 0x01000193)
    return h


def melanger(liste, g):
    a = g & M32
    l = list(liste)

    def hasard():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = a
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296
    for i in range(len(l) - 1, 0, -1):
        j = int(hasard() * (i + 1))
        l[i], l[j] = l[j], l[i]
    return l


def executer_verifications(base, verifs, ou, r, avec_base=True):
    """Exécute chaque vérification { code, sortie?, erreur?, reprendre_code? } après les lignes « base »."""
    if not isinstance(verifs, list):
        r.erreur(ou, "les vérifications sont une liste")
        return
    for k, v in enumerate(verifs):
        ov = f"{ou}, vérification {k + 1}"
        if not isinstance(v, dict) or not liste_de_chaines(v.get("code", [])) or ("sortie" not in v and "erreur" not in v):
            r.erreur(ov, "une vérification est { code: [lignes], sortie ou erreur }")
            continue
        lignes = (list(base) if v.get("reprendre_code", avec_base) else []) + v["code"]
        sortie, err, detail = executer(lignes)
        if err != v.get("erreur"):
            r.erreur(ov, f"erreur attendue {v.get('erreur')!r}, obtenue {err!r}" + (f" ({detail.splitlines()[-1]})" if detail else ""))
        if "sortie" in v and sortie != v["sortie"]:
            r.erreur(ov, f"sortie attendue {v['sortie']!r}, obtenue {sortie!r}")


def verifier_autre(d, ou, prelude, r, executer_code=True):
    """Un autre type de question : nuage de mots, relier, puzzle de code, ligne fautive."""
    t = d["type"]
    if not isinstance(d.get("id"), str) or not re.fullmatch(r"[a-z0-9-]{1,20}", d["id"]):
        r.erreur(ou, "« id » : minuscules, chiffres et tirets, 20 caractères au plus")
    for champ in ("nom", "objectif"):
        if not isinstance(d.get(champ), str) or not d[champ].strip():
            r.erreur(ou, f"champ « {champ} » manquant ou vide")
    if not liste_de_chaines(d.get("enonce")) or not d.get("enonce"):
        r.erreur(ou, "« enonce » doit être une liste de paragraphes non vide")
    if t != "nuage" and (not isinstance(d.get("explication"), str) or not d["explication"].strip()):
        r.erreur(ou, "« explication » manquante (la phrase « À retenir », montrée après la réponse)")
    if "code" in d and not liste_de_chaines(d["code"]):
        r.erreur(ou, "« code » doit être une liste de lignes")
    code = d.get("code", []) if liste_de_chaines(d.get("code", [])) else []
    connus = {"type", "id", "nom", "objectif", "enonce", "explication", "code", "note_verification", "console"}
    permis = {"nuage": {"exemples"}, "relier": {"paires", "verifications"}, "puzzle": {"lignes", "indentation", "verifications"},
              "ligne": {"ligne", "correction", "feedback", "feedback_autre", "pieges", "verifications", "verifications_corrigees"}}[t]
    inconnus = set(d) - connus - permis
    if inconnus:
        r.erreur(ou, f"champ inconnu : {', '.join(sorted(inconnus))}")

    def fb(v, quoi):
        if not isinstance(v, str) or len(v.strip()) < FEEDBACK_MIN:
            r.erreur(ou, f"{quoi} : au moins {FEEDBACK_MIN} caractères qui expliquent")

    if t == "nuage":
        if "exemples" in d and not liste_de_chaines(d["exemples"]):
            r.erreur(ou, "« exemples » : une liste de mots")
        return
    if t == "relier":
        p = d.get("paires")
        if not isinstance(p, list) or not 2 <= len(p) <= RELIER_MAX or not all(isinstance(x, dict) and isinstance(x.get("gauche"), str) and x["gauche"].strip() and isinstance(x.get("droite"), str) and x["droite"].strip() for x in p):
            r.erreur(ou, f"« paires » : 2 à {RELIER_MAX} paires {{ gauche, droite }}")
            return
        for k, x in enumerate(p):
            if set(x) - {"gauche", "droite", "feedback", "verification"}:
                r.erreur(f"{ou}, paire {k + 1}", f"champ inconnu : {', '.join(sorted(set(x) - {'gauche', 'droite', 'feedback', 'verification'}))}")
            if "feedback" in x:
                fb(x["feedback"], f"paire {k + 1}, feedback")
            if "verification" in x and executer_code:
                executer_verifications(list(prelude) + code, [x["verification"]], f"{ou}, paire {k + 1}", r)
        for cote in ("gauche", "droite"):
            vals = [x[cote].strip() for x in p]
            if len(set(vals)) != len(vals):
                r.erreur(ou, f"deux éléments identiques à {cote}")
        o = melanger(range(len(p)), graine(d.get("id", "")))
        fixes = sum(1 for i, k in enumerate(o) if i == k)
        if fixes == len(p):
            r.erreur(ou, "l'ordre mélangé laisse toutes les paires face à face : change l'identifiant")
        elif fixes > len(p) // 2:
            r.avert(ou, f"l'ordre mélangé laisse {fixes} paires face à face sur {len(p)}")
        if executer_code and "verifications" in d:
            executer_verifications(list(prelude) + code, d["verifications"], ou, r)
        return
    if t == "puzzle":
        lignes = d.get("lignes")
        if "console" in d:
            r.erreur(ou, "« console » : seulement pour une question à choix ou une ligne fautive")
        if not liste_de_chaines(lignes) or not PUZZLE_MIN <= len(lignes) <= PUZZLE_MAX:
            r.erreur(ou, f"« lignes » : la solution, {PUZZLE_MIN} à {PUZZLE_MAX} lignes")
            return
        for k, l in enumerate(lignes):
            n = len(l) - len(l.lstrip(" "))
            if not l.strip():
                r.erreur(ou, f"ligne {k + 1} vide")
            if n % 4 or n // 4 > INDENT_MAX or "\t" in l:
                r.erreur(ou, f"ligne {k + 1} : indentation de 4 espaces par niveau ({INDENT_MAX} niveaux au plus)")
        if "indentation" in d and not isinstance(d["indentation"], bool):
            r.erreur(ou, "« indentation » vaut true ou false")
        if not d.get("verifications"):
            r.erreur(ou, "un puzzle de code a au moins une vérification par exécution de la solution")
        elif executer_code:
            executer_verifications(list(prelude) + lignes, d["verifications"], ou, r)
        return
    if t == "ligne":
        if not 2 <= len(code) <= LIGNES_MAX:
            r.erreur(ou, f"« code » : 2 à {LIGNES_MAX} lignes")
            return
        for k, l in enumerate(code):
            if len(l) > LARGEUR_MAX:
                r.erreur(ou, f"ligne {k + 1} : {len(l)} caractères ; {LARGEUR_MAX} au plus (chaque ligne est un bouton, coupé à 320 px)")
        n = d.get("ligne")
        if not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= len(code):
            r.erreur(ou, "« ligne » : le numéro (à partir de 1) de la ligne qui contient l'erreur")
            return
        corr = d.get("correction")
        # la comparaison garde les espaces de début : une correction d'indentation (IndentationError) est permise
        if not isinstance(corr, str) or not corr.strip() or corr.rstrip() == code[n - 1].rstrip():
            r.erreur(ou, "« correction » : la ligne corrigée, différente de la ligne fautive")
            return
        fb(d.get("feedback"), "« feedback » (pour la bonne ligne)")
        fb(d.get("feedback_autre"), "« feedback_autre » (pour une autre ligne)")
        pieges = d.get("pieges", {})
        if not isinstance(pieges, dict):
            r.erreur(ou, "« pieges » : { \"numéro de ligne\": \"feedback\" }")
        else:
            for k, v in pieges.items():
                if not k.isdigit() or not 1 <= int(k) <= len(code) or int(k) == n:
                    r.erreur(ou, f"« pieges » : {k!r} n'est pas le numéro d'une autre ligne")
                fb(v, f"piège de la ligne {k}")
        if not d.get("verifications") or not d.get("verifications_corrigees"):
            r.erreur(ou, "une ligne fautive a des « verifications » (le code fautif) et des « verifications_corrigees » (le code corrigé)")
        elif executer_code:
            executer_verifications(list(prelude) + code, d["verifications"], ou + " (code fautif)", r)
            if "console" in d:
                verifier_console(list(prelude) + code, d["console"], ou, r)
            corrige = list(code)
            corrige[n - 1] = corr
            executer_verifications(list(prelude) + corrige, d["verifications_corrigees"], ou + " (code corrigé)", r)
        return


def mots(texte):
    """Le nombre de mots d'un texte affiché : un `code` en ligne compte pour un mot ; la ponctuation seule
    (« : », « → », « » ») ne compte pas ; « l'ordre » compte pour un mot."""
    texte = re.sub(r"`[^`]*`", " X ", texte)
    texte = texte.replace("==", " ").replace("**", " ").replace("*", " ")
    return sum(1 for m in texte.split() if re.search(r"\w", m))


def textes_ecran(d):
    """Les textes d'un écran de cours qui comptent dans la limite de mots : tout ce qui se lit à l'écran,
    sauf le titre (ou la question d'une diapositive « classe »), le surtitre, le code et le vocabulaire anglais."""
    t = []
    for champ in ("texte", "pistes", "lignes", "consigne"):
        v = d.get(champ)
        if liste_de_chaines(v):
            t += v
    for champ in ("chute", "sous_titre"):
        if isinstance(d.get(champ), str):
            t.append(d[champ])
    if isinstance(d.get("schema"), dict) and isinstance(d["schema"].get("legende"), str):
        t.append(d["schema"]["legende"])
    return t


def mots_ecran(d):
    return sum(mots(x) for x in textes_ecran(d))


def duree_estimee(diapos):
    """La durée estimée d'une séance projetée, en minutes (le modèle est dans cours/FORMAT.md)."""
    m = 0.0
    for d in diapos:
        if not isinstance(d, dict):
            continue
        t = d.get("type")
        if t == "titre":
            m += DUREE["titre"]
        elif t == "bilan":
            m += DUREE["bilan"]
        elif t in ECRANS:
            m += DUREE["ecran"]
        elif t == "question":
            m += DUREE["question"] + (DUREE["code"] if len(d.get("code", []) or []) >= 5 else 0)
        elif t in AUTRES_TYPES:
            m += DUREE["autre"]
    return m


def verifier_gabarit(cours, diapos, questions, autres, prelude, r, executer_code=True):
    """Les règles du gabarit « introduction » : peu d'écrans, peu de mots, 12 questions, 15 minutes."""
    g = GABARITS["introduction"]
    if cours.get("duree_minutes") != g["duree"]:
        r.erreur("gabarit", f"une introduction dure {g['duree']} minutes : « duree_minutes » vaut {g['duree']}")
    nuages = [d for d in autres if d.get("type") == "nuage"]
    if nuages:
        r.erreur("gabarit", "pas de nuage de mots dans une introduction (il ne fait pas apprendre la notion)")
    notes = [d for d in autres if d.get("type") != "nuage"]
    if len(notes) > g["autres_max"]:
        r.erreur("gabarit", f"{len(notes)} questions relier, puzzle ou ligne fautive : {g['autres_max']} au plus")
    total = len(questions) + len(notes)
    if total != g["questions"]:
        r.erreur("cours", f"{total} questions au lieu de {g['questions']} (gabarit introduction : les questions à choix, plus les questions relier, puzzle et ligne fautive)")
    ecrans = [(i, d) for i, d in enumerate(diapos) if isinstance(d, dict) and d.get("type") in ECRANS]
    if len(ecrans) > g["ecrans_max"]:
        r.erreur("gabarit", f"{len(ecrans)} écrans de cours : {g['ecrans_max']} au plus (notion, classe, humour, partie)")
    for i, d in ecrans:
        ou = f"diapositive {i + 1} ({d['type']})"
        n = mots_ecran(d)
        if n > g["mots_max"]:
            r.erreur(ou, f"{n} mots : {g['mots_max']} au plus par écran (hors titre, code et vocabulaire)")
        if d["type"] == "notion" and liste_de_chaines(d.get("texte")) and len(d["texte"]) > g["phrases_max"]:
            r.erreur(ou, f"{len(d['texte'])} phrases : {g['phrases_max']} au plus dans une introduction")
        code = d.get("code")
        if liste_de_chaines(code):
            for k, l in enumerate(code):
                if len(l) > LARGEUR_MAX:
                    r.erreur(ou, f"ligne de code {k + 1} : {len(l)} caractères ; {LARGEUR_MAX} au plus (lisible à 320 px)")
            if len(code) > g["code_notion_max"]:
                r.erreur(ou, f"{len(code)} lignes de code : {g['code_notion_max']} au plus sur un écran")
            elif executer_code:
                _, err, detail = executer(list(prelude) + code)
                if err:
                    r.erreur(ou, f"le code de l'écran ne s'exécute pas : {detail.splitlines()[-1] if detail else err}")
    for i, d in enumerate(diapos):
        if isinstance(d, dict) and d.get("type") == "bilan":
            lignes = (d.get("tableau") or {}).get("lignes", [])
            if isinstance(lignes, list) and len(lignes) > g["bilan_lignes_max"]:
                r.avert(f"diapositive {i + 1} (bilan)", f"{len(lignes)} lignes : {g['bilan_lignes_max']} au plus, l'essentiel seulement")
    estimee = duree_estimee(diapos)
    if estimee > g["duree"] + 2:
        r.avert("gabarit", f"durée estimée {estimee:.0f} min pour {g['duree']} min prévues")


def verifier_repartition(positions, r, n_attendu):
    n = len(positions)
    if None in positions or n == 0:
        return
    comptes = {l: positions.count(i) for i, l in enumerate(LETTRES)}
    bas, haut = n // 4 - 1, -(-n // 4) + 1
    for l, c in comptes.items():
        if c < bas or c > haut:
            r.erreur("répartition", f"{l} est juste {c} fois sur {n} (attendu entre {bas} et {haut})")
    serie, maxi = 1, 1
    for a, b in zip(positions, positions[1:]):
        serie = serie + 1 if a == b else 1
        maxi = max(maxi, serie)
    if maxi >= 3:
        r.erreur("répartition", f"la même lettre est juste {maxi} fois de suite")
    # un motif périodique simple (ABCDABCD…, ABAB…)
    for periode in (2, 3, 4):
        if n >= 2 * periode and all(positions[i] == positions[i % periode] for i in range(n)):
            r.erreur("répartition", f"motif périodique de longueur {periode}")
    # un motif partiel : une lettre juste au même rang modulo 2, 3 ou 4, sur 4 questions de suite de ce rang
    # (D en 3, 7, 11, 15…) ; un groupe de 4 bonnes réponses qui se répète (ACDB … ACDB)
    trouves = set()
    for periode in (2, 3, 4):
        for debut in range(n):
            rangs = list(range(debut, n, periode))[:4]
            if len(rangs) == 4 and len({positions[i] for i in rangs}) == 1 and (periode, debut % periode) not in trouves:
                trouves.add((periode, debut % periode))
                r.erreur("répartition", f"motif : {LETTRES[positions[debut]]} est juste aux questions {', '.join(str(i + 1) for i in rangs)} (tous les {periode} rangs)")
    groupes = {}
    for i in range(n - 3):
        g = tuple(positions[i:i + 4])
        if g in groupes and i - groupes[g] >= 4:
            r.erreur("répartition", f"motif : le groupe {''.join(LETTRES[x] for x in g)} se répète (questions {groupes[g] + 1} et {i + 1})")
            break
        groupes.setdefault(g, i)
    return comptes


def verifier_cours(chemin, executer_code=True, n_questions=None):
    r = Rapport()
    try:
        with open(chemin, encoding="utf-8") as f:
            cours = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        r.erreur(chemin, f"lecture impossible : {e}")
        return r, None
    if cours.get("format") != FORMAT:
        r.erreur("cours", f"« format » doit valoir {FORMAT!r}")
    for champ in ("id", "titre", "niveau", "programme", "auteur", "licence"):
        if not isinstance(cours.get(champ), str) or not cours[champ].strip():
            r.erreur("cours", f"champ « {champ} » manquant")
    attendu_id = os.path.splitext(os.path.basename(chemin))[0]
    if cours.get("id") != attendu_id:
        r.erreur("cours", f"« id » ({cours.get('id')!r}) doit être le nom du fichier ({attendu_id!r})")
    gabarit = cours.get("gabarit", "revision")
    if gabarit not in GABARITS:
        r.erreur("cours", f"« gabarit » inconnu : {gabarit!r} (permis : {', '.join(sorted(GABARITS))})")
        gabarit = "revision"
    if isinstance(cours.get("duree_minutes"), (int, float)) and cours["duree_minutes"] > 45:
        r.erreur("cours", "« duree_minutes » : 45 au plus (une activité ne dépasse jamais 45 minutes)")
    for champ in ("criteres", "conventions"):
        if not liste_de_chaines(cours.get(champ, [])):
            r.erreur("cours", f"« {champ} » doit être une liste de phrases")
    MESSAGES_OBTENUS.clear()
    prelude = cours.get("prelude_python", [])
    if not liste_de_chaines(prelude):
        r.erreur("cours", "« prelude_python » doit être une liste de lignes")
        prelude = []
    for ou, s in parcourir_chaines(cours):
        m = caracteres_interdits(s)
        if m:
            r.erreur(ou, f"caractère invisible ou de contrôle : {', '.join(m)}")
    diapos = cours.get("diapositives")
    if not isinstance(diapos, list) or not diapos:
        r.erreur("cours", "« diapositives » manquantes")
        return r, cours
    questions, ids, autres = [], set(), []
    for i, d in enumerate(diapos):
        ou = f"diapositive {i + 1}"
        if not isinstance(d, dict) or d.get("type") not in TYPES_DIAPO:
            r.erreur(ou, f"type inconnu (permis : {', '.join(sorted(TYPES_DIAPO))})")
            continue
        if d["type"] in AUTRES_TYPES:
            if d.get("id") in ids:
                r.erreur(ou, f"identifiant en double : {d.get('id')}")
            ids.add(d.get("id"))
            verifier_autre(d, f"{ou} ({d['type']} {d.get('id', '?')})", prelude, r, executer_code)
            autres.append(d)
        elif d["type"] == "question":
            questions.append(d)
            if d.get("id") in ids:
                r.erreur(ou, f"identifiant en double : {d.get('id')}")
            ids.add(d.get("id"))
        elif d["type"] == "partie":
            if not isinstance(d.get("titre"), str) or not d["titre"].strip():
                r.erreur(ou, "une partie a un titre")
        elif d["type"] == "classe":
            if not isinstance(d.get("question"), str) or not d["question"].strip():
                r.erreur(ou, "une question à la classe a une « question »")
            for champ in ("pistes", "texte"):
                if champ in d and not liste_de_chaines(d[champ]):
                    r.erreur(ou, f"« {champ} » : une liste de phrases")
            if "code" in d and not liste_de_chaines(d["code"]):
                r.erreur(ou, "« code » doit être une liste de lignes")
            if "schema" in d:
                verifier_schema(d["schema"], ou, r)
        elif d["type"] == "humour":
            if not isinstance(d.get("titre"), str) or not liste_de_chaines(d.get("lignes", [])) or not d.get("lignes"):
                r.erreur(ou, "une diapositive d'humour a un « titre » et des « lignes »")
        elif d["type"] == "notion":
            if not isinstance(d.get("titre"), str) or not d["titre"].strip():
                r.erreur(ou, "une notion a un titre")
            t = d.get("texte", [])
            if not liste_de_chaines(t) or not t:
                r.erreur(ou, "« texte » : une liste de 1 à 3 phrases courtes")
            else:
                if len(t) > TEXTE_NOTION_MAX:
                    r.avert(ou, f"{len(t)} puces : peu de texte, 3 au plus")
                for p in t:
                    if len(p) > PUCE_MAX:
                        r.avert(ou, f"puce de {len(p)} caractères : à raccourcir")
            if "schema" in d:
                verifier_schema(d["schema"], ou, r)
                if executer_code:
                    verifier_schema_execution(d["schema"], prelude, ou + ", schéma", r)
            if "code" in d and not liste_de_chaines(d["code"]):
                r.erreur(ou, "« code » doit être une liste de lignes")
            if "consigne" in d and not liste_de_chaines(d["consigne"]):
                r.erreur(ou, "« consigne » : une liste de consignes d'observation")
    if diapos and diapos[0].get("type") != "titre":
        r.avert("diapositive 1", "un cours commence d'habitude par une diapositive « titre »")
    demo = cours.get("demonstration") is True
    if "demonstration" in cours and not demo:
        r.erreur("cours", "« demonstration » vaut true, ou n'est pas écrit")
    if demo and "gabarit" in cours:
        r.erreur("cours", "un cours de démonstration n'a pas de gabarit")
    if gabarit == "introduction":
        verifier_gabarit(cours, diapos, questions, autres, prelude, r, executer_code)
    else:
        n_questions = n_questions or GABARITS["revision"]["questions"]
        if demo and len(questions) > n_questions:
            r.erreur("cours", f"un cours de démonstration a au plus {n_questions} questions à choix")
        if demo and not questions and not autres:
            r.erreur("cours", "un cours de démonstration a au moins une question")
        if not demo and len(questions) != n_questions:
            r.erreur("cours", f"{len(questions)} questions au lieu de {n_questions}")
    positions, longues = [], 0
    for n, q in enumerate(questions, 1):
        j, pl = verifier_question(q, n, prelude, r, executer_code)
        positions.append(j)
        longues += 1 if pl else 0
    comptes = verifier_repartition(positions, r, n_questions)
    # chaque message d'erreur cité est celui que donne Python, en entier
    if executer_code:
        for ou, s in parcourir_chaines(cours):
            for m in MESSAGE_CITE.finditer(s):
                cite = m.group(1).strip()
                if ":" in cite and cite not in MESSAGES_OBTENUS:
                    proches = sorted(x for x in MESSAGES_OBTENUS if x.split(":")[0] == cite.split(":")[0])
                    r.erreur(ou, f"message d'erreur cité « {cite} » : aucune exécution du cours ne le donne"
                             + (f" (Python donne : {' ; '.join(proches)})" if proches else ""))
    if questions and longues / len(questions) > 0.4:
        r.erreur("répartition", f"la bonne réponse est la plus longue dans {longues} questions sur {len(questions)} : elle se repère")
    elif questions and longues / len(questions) > 0.25:
        r.avert("répartition", f"la bonne réponse est la plus longue dans {longues} questions sur {len(questions)}")
    ecrans = [d for d in diapos if isinstance(d, dict) and d.get("type") in ECRANS]
    return r, {"cours": cours, "questions": questions, "positions": positions, "comptes": comptes, "longues": longues, "autres": autres,
               "gabarit": gabarit, "ecrans": len(ecrans), "mots": sum(mots_ecran(d) for d in ecrans),
               "mots_max": max((mots_ecran(d) for d in ecrans), default=0), "duree": duree_estimee(diapos)}


def main(args):
    executer_code = "--sans-execution" not in args
    fichiers = [a for a in args if not a.startswith("--")]
    erreurs_catalogue = 0
    cat = None
    if "--tous" in args:
        racine = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cours")
        fichiers += sorted(os.path.join(racine, f) for f in os.listdir(racine) if f.endswith(".json") and f != "catalogue.json")
        # le catalogue de l'accueil : chaque cours cité existe, et chaque cours est cité
        with open(os.path.join(racine, "catalogue.json"), encoding="utf-8") as f:
            cat = json.load(f)
        ids = [c.get("id") for c in cat.get("cours", [])]
        presents = sorted(os.path.splitext(os.path.basename(x))[0] for x in fichiers)
        if sorted(ids) != presents:
            print(f"== cours/catalogue.json\n  ERREUR · le catalogue cite {sorted(ids)}, les fichiers sont {presents}")
            erreurs_catalogue = 1
        else:
            print(f"== cours/catalogue.json : {len(ids)} cours, conforme")
        # la bibliothèque de l'accueil : niveaux, thèmes du programme, types, notions, et index.html à jour
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            import bibliotheque
        except ImportError:
            bibliotheque = None
        finally:
            sys.path.pop(0)
        if bibliotheque is not None:
            racine_depot = os.path.dirname(racine)
            if os.path.exists(os.path.join(racine_depot, "index.html")):
                erreurs_catalogue = max(erreurs_catalogue, bibliotheque.main([], racine_depot))
            else:
                for x in bibliotheque.controler(cat):
                    print("  ERREUR · cours/catalogue.json · " + x)
                    erreurs_catalogue = 1
    if not fichiers:
        print(__doc__)
        return 2
    total = 0
    total += erreurs_catalogue
    for chemin in fichiers:
        r, info = verifier_cours(chemin, executer_code)
        # le catalogue de l'accueil annonce le bon nombre de questions, le bon gabarit, la bonne durée et le même titre
        if cat and info and info.get("cours"):
            entree = next((x for x in cat.get("cours", []) if x.get("id") == info["cours"].get("id")), None)
            if entree:
                n = len(info["questions"]) + (len([d for d in info["autres"] if d.get("type") != "nuage"]) if info["gabarit"] == "introduction" else 0)
                for champ, attendu in (("questions", n), ("gabarit", info["gabarit"]), ("duree_minutes", info["cours"].get("duree_minutes")), ("niveau", info["cours"].get("niveau")), ("titre", info["cours"].get("titre"))):
                    if champ in entree and entree[champ] != attendu:
                        r.erreur("cours/catalogue.json", f"« {champ} » vaut {entree[champ]!r}, le cours dit {attendu!r}")
        print(f"== {chemin}")
        if info and info.get("questions"):
            for n, (q, p) in enumerate(zip(info["questions"], info["positions"]), 1):
                lettre = LETTRES[p] if p is not None else "?"
                print(f"  {n:2d}. {lettre}  {q.get('nom', '')}")
            for d in info.get("autres", []):
                print(f"   ·  {d['type']:<6} {d.get('nom', '')}")
            print(f"  Gabarit {info['gabarit']} : {info['ecrans']} écrans de cours, {info['mots']} mots (au plus {info['mots_max']} par écran),"
                  f" durée estimée {info['duree']:.0f} min" + (f" pour {info['cours'].get('duree_minutes')} prévues" if info['cours'].get('duree_minutes') else ""))
            if info.get("comptes"):
                print("  Bonnes réponses : " + ", ".join(f"{l} {c}" for l, c in info["comptes"].items())
                      + f" ; la plus longue : {info['longues']} fois")
        for a in r.avertissements:
            print("  avertissement · " + a)
        for e in r.erreurs:
            print("  ERREUR · " + e)
        print("  " + ("conforme" if not r.erreurs else f"{len(r.erreurs)} erreur(s)")
              + ("" if executer_code else " (sans exécution du code)"))
        total += len(r.erreurs)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
