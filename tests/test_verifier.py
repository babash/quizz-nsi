"""QuizzNSI : tests du vérificateur de cours.

Lancement, depuis la racine de QuizzNSI : python3 -I -m unittest discover -s tests -p "test_*.py"
"""
import copy
import json
import os
import sys
import tempfile
import unittest

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(RACINE, "outils"))
import verifier_cours as V  # noqa: E402

with open(os.path.join(RACINE, "cours", "piles-files.json"), encoding="utf-8") as f:
    MODELE = json.load(f)


with open(os.path.join(RACINE, "cours", "demo-types-de-questions.json"), encoding="utf-8") as f:
    DEMO = json.load(f)
with open(os.path.join(RACINE, "cours", "revision-conditions-boucles.json"), encoding="utf-8") as f:
    REVISION = json.load(f)


def autre(c, t):
    return next(d for d in c["diapositives"] if d["type"] == t)


def questions(c):
    return [d for d in c["diapositives"] if d["type"] == "question"]


class TestVerifier(unittest.TestCase):
    def verifier(self, cours, executer=False):
        with tempfile.TemporaryDirectory() as d:
            chemin = os.path.join(d, cours["id"] + ".json")
            with open(chemin, "w", encoding="utf-8") as f:
                json.dump(cours, f, ensure_ascii=False)
            r, _ = V.verifier_cours(chemin, executer_code=executer)
        return r.erreurs

    def modifie(self, f):
        c = copy.deepcopy(MODELE)
        f(c)
        return self.verifier(c)

    def test_le_cours_livre_est_conforme_avec_execution(self):
        self.assertEqual(self.verifier(copy.deepcopy(MODELE), executer=True), [])

    # ── les autres types de questions ──
    def rev(self, f, executer=False):
        c = copy.deepcopy(DEMO)
        f(c)
        return self.verifier(c, executer)

    def test_demonstration_conforme_avec_execution(self):
        self.assertEqual(self.verifier(copy.deepcopy(DEMO), executer=True), [])

    def test_revision_conforme_avec_execution(self):
        self.assertEqual(self.verifier(copy.deepcopy(REVISION), executer=True), [])

    def test_sans_demonstration_il_faut_20_questions(self):
        e = self.rev(lambda c: c.pop("demonstration"))
        self.assertTrue(any("0 questions au lieu de 20" in x for x in e))

    def test_demonstration_vide(self):
        e = self.rev(lambda c: c.update(diapositives=c["diapositives"][:1]))
        self.assertTrue(any("au moins une question" in x for x in e))

    def test_le_melange_est_celui_du_navigateur(self):
        # les mêmes valeurs que js/commun.js (tests/test_moteur.js) : la page et le vérificateur voient le même ordre
        self.assertEqual(V.graine("a02"), 3771486418)
        self.assertEqual(V.melanger(range(10), V.graine("a02")), [8, 5, 1, 3, 4, 7, 0, 6, 9, 2])

    def test_relier_une_seule_paire(self):
        e = self.rev(lambda c: autre(c, "relier").update(paires=autre(c, "relier")["paires"][:1]))
        self.assertTrue(any("paires" in x for x in e))

    def test_relier_deux_reponses_identiques(self):
        e = self.rev(lambda c: autre(c, "relier")["paires"][1].update(droite=autre(c, "relier")["paires"][0]["droite"]))
        self.assertTrue(any("identiques" in x for x in e))

    def test_relier_verification_fausse(self):
        e = self.rev(lambda c: autre(c, "relier")["paires"][0]["verification"].update(sortie="16"), executer=True)
        self.assertTrue(any("sortie attendue" in x for x in e))

    def test_puzzle_solution_executee(self):
        e = self.rev(lambda c: autre(c, "puzzle")["verifications"][0].update(sortie="25"), executer=True)
        self.assertTrue(any("sortie attendue '25'" in x for x in e))

    def test_puzzle_indentation_irreguliere(self):
        e = self.rev(lambda c: autre(c, "puzzle")["lignes"].__setitem__(2, "  if i % 2 == 0:"))
        self.assertTrue(any("indentation" in x for x in e))

    def test_puzzle_sans_verification(self):
        e = self.rev(lambda c: autre(c, "puzzle").pop("verifications"))
        self.assertTrue(any("vérification" in x for x in e))

    def test_ligne_fautive_hors_du_code(self):
        e = self.rev(lambda c: autre(c, "ligne").update(ligne=99))
        self.assertTrue(any("numéro" in x for x in e))

    def test_ligne_correction_qui_ne_corrige_pas(self):
        e = self.rev(lambda c: autre(c, "ligne").update(correction="    for i in range(1, n + 2):"), executer=True)
        self.assertTrue(any("code corrigé" in x for x in e))

    def test_ligne_piege_sur_la_bonne_ligne(self):
        e = self.rev(lambda c: autre(c, "ligne")["pieges"].update({"3": "Ce feedback vise la bonne ligne, ce n'est pas un piège du tout."}))
        self.assertTrue(any("pieges" in x for x in e))

    def test_autre_type_champ_inconnu(self):
        e = self.rev(lambda c: autre(c, "nuage").update(html="<b>x</b>"))
        self.assertTrue(any("champ inconnu" in x for x in e))

    def test_toujours_20_questions_a_choix(self):
        c = copy.deepcopy(REVISION)
        c["diapositives"].remove(questions(c)[0])
        e = self.verifier(c)
        self.assertTrue(any("19 questions" in x for x in e))

    def test_trois_options(self):
        e = self.modifie(lambda c: questions(c)[0]["options"].pop())
        self.assertTrue(any("4 options" in x for x in e))

    def test_deux_reponses_justes(self):
        e = self.modifie(lambda c: questions(c)[0]["options"][0].update(juste=True))
        self.assertTrue(any("une seule option juste" in x for x in e))

    def test_feedback_vide(self):
        e = self.modifie(lambda c: questions(c)[2]["options"][1].update(feedback="Non."))
        self.assertTrue(any("feedback" in x for x in e))

    def test_objectif_manquant(self):
        e = self.modifie(lambda c: questions(c)[3].pop("objectif"))
        self.assertTrue(any("objectif" in x for x in e))

    def test_gras_dans_une_option(self):
        e = self.modifie(lambda c: questions(c)[0]["options"][1].update(texte="Une **pile**"))
        self.assertTrue(any("gras" in x for x in e))

    def test_caractere_invisible(self):
        e = self.modifie(lambda c: questions(c)[0].update(nom="Pile" + chr(0x200B)))
        self.assertTrue(any("U+200B" in x for x in e))

    def test_nombre_de_questions(self):
        def retirer(c):
            q = questions(c)[-1]
            c["diapositives"].remove(q)
        e = self.modifie(retirer)
        self.assertTrue(any("11 questions au lieu de 12" in x for x in e))

    # ── le gabarit « introduction » (le modèle, piles-files) ──
    def test_introduction_12_questions_et_15_minutes(self):
        self.assertEqual(MODELE["gabarit"], "introduction")
        self.assertEqual(len(questions(MODELE)) + len([d for d in MODELE["diapositives"] if d["type"] in ("relier", "puzzle", "ligne")]), 12)
        e = self.modifie(lambda c: c.update(duree_minutes=20))
        self.assertTrue(any("15 minutes" in x for x in e))

    def test_introduction_trop_d_ecrans(self):
        e = self.modifie(lambda c: c["diapositives"].insert(1, {"type": "notion", "titre": "Encore", "texte": ["Un écran de trop."]}))
        self.assertTrue(any("9 écrans de cours" in x for x in e))

    def test_introduction_trop_de_mots(self):
        def f(c):
            n = next(d for d in c["diapositives"] if d["type"] == "notion")
            n["texte"] = ["Une pile range les éléments les uns sur les autres et on ne peut prendre que celui du dessus, qui est le dernier arrivé, jamais un autre."]
        self.assertTrue(any("mots : 25 au plus" in x for x in self.modifie(f)))

    def test_introduction_trois_phrases(self):
        def f(c):
            next(d for d in c["diapositives"] if d["type"] == "notion")["texte"] = ["Un.", "Deux.", "Trois."]
        self.assertTrue(any("3 phrases" in x for x in self.modifie(f)))

    def test_introduction_sans_nuage(self):
        nuage = copy.deepcopy(autre(DEMO, "nuage"))
        e = self.modifie(lambda c: c["diapositives"].insert(2, nuage))
        self.assertTrue(any("nuage" in x for x in e))

    def test_introduction_trois_autres_types(self):
        def f(c):
            for t in ("relier", "puzzle"):
                c["diapositives"].insert(-1, copy.deepcopy(autre(DEMO, t)))
        e = self.modifie(f)
        self.assertTrue(any("3 questions relier, puzzle ou ligne fautive" in x for x in e))

    def test_introduction_code_d_ecran_execute(self):
        c = copy.deepcopy(MODELE)
        next(d for d in c["diapositives"] if d["type"] == "notion" and d.get("code"))["code"] = ["p = Pile()", "p.depiler()"]
        self.assertTrue(any("ne s'exécute pas" in x for x in self.verifier(c, executer=True)))

    def test_demonstration_sans_gabarit(self):
        e = self.rev(lambda c: c.update(gabarit="revision"))
        self.assertTrue(any("pas de gabarit" in x for x in e))

    def test_console_comparee_a_l_execution(self):
        c = copy.deepcopy(MODELE)
        d = autre(c, "ligne")
        d["console"] = [d["console"][0].split(". Did you mean")[0]]  # le message sans la suggestion de Python 3.13
        self.assertTrue(any("console : Python affiche" in x for x in self.verifier(c, executer=True)))

    def test_message_cite_compare_a_l_execution(self):
        c = copy.deepcopy(MODELE)
        autre(c, "ligne")["feedback"] = "Bien vu : Python affiche `AttributeError: 'Pile' object has no attribute 'enfiler'` et s'arrête."
        self.assertTrue(any("message d'erreur cité" in x and "Did you mean" in x for x in self.verifier(c, executer=True)))

    def test_message_cite_complet_accepte(self):
        c = copy.deepcopy(MODELE)
        autre(c, "ligne")["feedback"] = "Bien vu : Python affiche `AttributeError: 'Pile' object has no attribute 'enfiler'. Did you mean: 'empiler'?` et s'arrête."
        self.assertEqual(self.verifier(c, executer=True), [])

    def test_ligne_fautive_d_indentation(self):
        # la correction ne diffère que par l'indentation : permis (une IndentationError se corrige ainsi)
        c = copy.deepcopy(DEMO)
        d = autre(c, "ligne")
        d.update(code=["def f(n):", "return n + 1", "print(f(2))"], ligne=2, correction="    return n + 1", pieges={},
                 verifications=[{"code": [], "erreur": "IndentationError"}], verifications_corrigees=[{"code": [], "sortie": "3"}])
        d.pop("console", None)
        self.assertEqual([x for x in self.verifier(c, executer=True) if "ligne" in x], [])

    def test_ligne_fautive_trop_large(self):
        e = self.modifie(lambda c: autre(c, "ligne")["code"].__setitem__(1, 'for v in ["taxi", "bus", "camion"]:'))
        self.assertTrue(any("27 au plus" in x for x in e))

    def test_gabarit_inconnu(self):
        self.assertTrue(any("gabarit" in x for x in self.modifie(lambda c: c.update(gabarit="long"))))

    def test_revision_par_defaut(self):
        # un cours sans « gabarit » (le format d'avant T113) est une révision : 20 questions à choix
        self.assertNotIn("gabarit", REVISION)
        c = copy.deepcopy(MODELE)
        del c["gabarit"]
        self.assertTrue(any("11 questions au lieu de 20" in x for x in self.verifier(c)))

    def test_compter_les_mots(self):
        self.assertEqual(V.mots("On l'écrit ==du haut vers le bas== : le sommet d'abord."), 10)
        self.assertEqual(V.mots("Avant de dépiler, on teste `p.est_vide()`."), 6)
        self.assertEqual(V.mots("Le bouton « Annuler » (Ctrl + Z)."), 5)

    def test_duree_estimee(self):
        self.assertAlmostEqual(V.duree_estimee(MODELE["diapositives"]), 15, delta=1)

    def test_repartition_desequilibree(self):
        def tout_en_a(c):
            for q in questions(c):
                j = next(o for o in q["options"] if o.get("juste"))
                q["options"].remove(j)
                q["options"].insert(0, j)
        e = self.modifie(tout_en_a)
        self.assertTrue(any("répartition" in x for x in e))

    def repartition(self, lettres):
        r = V.Rapport()
        V.verifier_repartition(["ABCD".index(x) for x in lettres], r, len(lettres))
        return r.erreurs

    def test_motif_partiel_meme_rang(self):
        # D juste aux questions 3, 7, 11, 15, 19 (l'ancienne révision piles et files)
        e = self.repartition("BADCACDBACDBCADBACDB")
        self.assertTrue(any("D est juste aux questions 3, 7, 11, 15" in x for x in e), e)

    def test_motif_groupe_repete(self):
        e = self.repartition("CADBBACADBDC")
        self.assertTrue(any("le groupe CADB se répète" in x for x in e), e)

    def test_repartition_sans_motif_acceptee(self):
        self.assertEqual(self.repartition("ACBDBACDABDCCADBBDAC"), [])

    def test_code_de_question_trop_large(self):
        e = self.modifie(lambda c: questions(c)[1].__setitem__("code", ["p = Pile()", "p.empiler(4)  # le premier véhicule"]))
        self.assertTrue(any("question" in x and "27 au plus" in x for x in e), e)

    def test_code_d_option_trop_large(self):
        def f(c):
            q = next(q for q in questions(c) if any("code" in o for o in q["options"]))
            o = next(o for o in q["options"] if "code" in o)
            o["code"] = list(o["code"]) + ["print(\"la pile est maintenant vide\")"]
        e = self.modifie(f)
        self.assertTrue(any("option" in x and "27 au plus" in x for x in e), e)

    def test_sortie_fausse_detectee_a_l_execution(self):
        c = copy.deepcopy(MODELE)
        questions(c)[3]["verifications"][0]["sortie"] = "[4, 1, 3]"
        e = self.verifier(c, executer=True)
        self.assertTrue(any("sortie attendue" in x for x in e))

    def test_erreur_attendue_detectee(self):
        c = copy.deepcopy(MODELE)
        questions(c)[4]["verifications"][0]["erreur"] = "KeyError"
        e = self.verifier(c, executer=True)
        self.assertTrue(any("erreur attendue" in x for x in e))

    def test_code_sans_verification(self):
        e = self.modifie(lambda c: next(q for q in questions(c) if q.get("code")).pop("verifications"))
        self.assertTrue(any("vérification" in x for x in e))

    def test_svg_avec_script_refuse(self):
        e = self.modifie(lambda c: questions(c)[0].update(schema={"type": "svg", "code": '<svg onload="x()"></svg>'}))
        self.assertTrue(any("svg" in x for x in e))


    def schema(self, c, test):
        return next(d["schema"] for d in c["diapositives"] if isinstance(d.get("schema"), dict) and test(d["schema"]))

    def test_schema_deux_piles_faux(self):
        # l'erreur relevée par le Gardien : la pile auxiliaire dessinée dans le même ordre que p
        c = copy.deepcopy(MODELE)
        questions(c)[0]["schema"] = {"type": "deux-piles", "gauche": {"nom": "p", "elements": []}, "droite": {"nom": "aux", "elements": ["c", "b", "a"]},
                                     "code": ["p = Pile()", "for e in [\"c\", \"b\", \"a\"]:", "    p.empiler(e)", "aux = Pile()",
                                              "while not p.est_vide():", "    aux.empiler(p.depiler())"]}
        self.assertTrue(any("schéma faux" in x and "aux" in x for x in self.verifier(c, executer=True)))

    def test_schema_etapes_etat_faux(self):
        c = copy.deepcopy(MODELE)
        self.schema(c, lambda s: s.get("variable") == "f")["etapes"][3]["elements"] = ["a", "b"]
        self.assertTrue(any("schéma faux" in x for x in self.verifier(c, executer=True)))

    def test_schema_etapes_valeur_renvoyee_fausse(self):
        c = copy.deepcopy(MODELE)
        s = self.schema(c, lambda s: s.get("variable") == "p" and s["etapes"][0]["op"] == "p = Pile()")
        s["etapes"][3]["op"] = "p.depiler() → 4"
        self.assertTrue(any("renvoie 1" in x for x in self.verifier(c, executer=True)))


    def test_nom_de_variable_inconnu_dans_une_option(self):
        def f(c):
            q = next(q for q in questions(c) if q.get("code") and any("Pile()" in l for l in q["code"]))
            q["options"][1]["texte"] = "Il faut écrire `file.pop(0)`."
        self.assertTrue(any("« file »" in x for x in self.modifie(f)))

    def test_renvoi_a_une_question_suivante(self):
        def f(c):
            q = questions(c)[3]
            q["enonce"][0] += " Comme à la question 4."
        self.assertTrue(any("renvoi à la question 4" in x for x in self.modifie(f)))


class TestCatalogue(unittest.TestCase):
    """Le contrôle du catalogue de l'accueil (verifier_cours.py --tous) et de sa bibliothèque (outils/bibliotheque.py)."""
    def entree(self, i, n=12, **autres):
        e = {"id": i, "titre": i, "niveau": "Terminale NSI", "theme": "nsi-tle-2019.structures-de-donnees",
             "gabarit": "introduction", "questions": n, "duree_minutes": 15, "notions": ["donnees.pile", "donnees.file"],
             "mots_cles": ["pile", "file"]}
        e.update(autres)
        return {k: v for k, v in e.items() if v is not None}

    def essai(self, ids, n=12, entrees=None, index=None, vocab=None):
        import contextlib, io, shutil
        with open(os.path.join(RACINE, "cours", "catalogue.json"), encoding="utf-8") as f:
            vrai = json.load(f)
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "outils")); os.makedirs(os.path.join(d, "cours"))
            for o in ("verifier_cours.py", "bibliotheque.py"):
                shutil.copy(os.path.join(RACINE, "outils", o), os.path.join(d, "outils"))
            shutil.copy(os.path.join(RACINE, "cours", "piles-files.json"), os.path.join(d, "cours"))
            cat = {k: vrai[k] for k in ("format", "niveaux", "types", "themes")}
            cat["cours"] = entrees if entrees is not None else [self.entree(i, n) for i in ids]
            utiles = {x for c in cat["cours"] for x in (c.get("notions") or []) if isinstance(c.get("notions"), list)}
            cat["notions"] = vocab if vocab is not None else [x for x in vrai["notions"] if x["id"] in utiles]
            with open(os.path.join(d, "cours", "catalogue.json"), "w", encoding="utf-8") as f:
                json.dump(cat, f)
            if index is not None:
                with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
                    f.write(index(cat))
            sys.path.insert(0, os.path.join(d, "outils"))
            import importlib, verifier_cours as W, bibliotheque as B
            importlib.reload(W); importlib.reload(B)
            sys.path.pop(0)
            sortie = io.StringIO()
            with contextlib.redirect_stdout(sortie):
                code = W.main(["--tous", "--sans-execution"])
            return code, sortie.getvalue()

    def test_catalogue_conforme(self):
        self.assertEqual(self.essai(["piles-files"])[0], 0)

    def test_cours_cite_mais_absent(self):
        self.assertEqual(self.essai(["piles-files", "arbres"])[0], 1)

    def test_cours_present_non_cite(self):
        self.assertEqual(self.essai([])[0], 1)

    def test_nombre_de_questions_du_catalogue(self):
        code, sortie = self.essai(["piles-files"], n=20)
        self.assertEqual(code, 1)
        self.assertIn("« questions » vaut 20, le cours dit 12", sortie)

    def test_doublon(self):
        self.assertEqual(self.essai(["piles-files", "piles-files"])[0], 1)

    def test_theme_inconnu(self):
        code, sortie = self.essai([], entrees=[self.entree("piles-files", theme="nsi-tle-2019.chaines")])
        self.assertEqual(code, 1)
        self.assertIn("absent de la liste des thèmes du programme", sortie)

    def test_theme_d_un_autre_niveau(self):
        code, sortie = self.essai([], entrees=[self.entree("piles-files", theme="nsi-1re-2019.types-construits")])
        self.assertEqual(code, 1)
        self.assertIn("est un thème de Première NSI", sortie)

    def test_niveau_different_du_cours(self):
        code, sortie = self.essai([], entrees=[self.entree("piles-files", niveau="Première NSI", theme="nsi-1re-2019.algorithmique")])
        self.assertEqual(code, 1)
        self.assertIn("« niveau » vaut 'Première NSI', le cours dit 'Terminale NSI'", sortie)

    def test_type_et_mots_cles(self):
        code, sortie = self.essai([], entrees=[self.entree("piles-files", gabarit="atelier", mots_cles=[])])
        self.assertEqual(code, 1)
        self.assertIn("type (gabarit) 'atelier' inconnu", sortie)
        self.assertIn("« mots_cles » doit être une liste de mots non vide", sortie)

    def test_notions_de_2_a_5(self):
        for ns in (["donnees.pile"], ["donnees.pile", "donnees.file", "prog.poo", "prog.boucle", "prog.fonction", "algo.tri"]):
            code, sortie = self.essai([], entrees=[self.entree("piles-files", notions=ns)])
            self.assertEqual(code, 1)
            self.assertIn("doit citer de 2 à 5 notions", sortie)

    def test_notion_hors_liste_fermee(self):
        vocab = [{"id": "donnees.pile", "libelle": "Piles"}]
        code, sortie = self.essai([], entrees=[self.entree("piles-files")], vocab=vocab)
        self.assertEqual(code, 1)
        self.assertIn("notion 'donnees.file' absente de la liste fermée", sortie)

    def test_quasi_doublon_et_notion_inutile(self):
        vocab = [{"id": "donnees.pile", "libelle": "Piles"}, {"id": "donnees.file", "libelle": "Files"},
                 {"id": "donnees.pile2", "libelle": "pile"}]
        code, sortie = self.essai([], entrees=[self.entree("piles-files")], vocab=vocab)
        self.assertEqual(code, 1)
        self.assertIn("quasi-doublon", sortie)
        self.assertIn("aucun cours ne la travaille", sortie)

    def test_accueil_a_jour(self):
        page = lambda debut: lambda cat: "<main>" + debut + "<!-- bibliotheque:fin --></main>"
        import bibliotheque as B
        code, sortie = self.essai(["piles-files"], index=page("<!-- bibliotheque:debut -->ancienne liste"))
        self.assertEqual(code, 1)
        self.assertIn("la bibliothèque n'est pas à jour", sortie)
        code, sortie = self.essai(["piles-files"], index=lambda cat: "<main>" + B.bloc(cat) + "</main>")
        self.assertEqual(code, 0, sortie)

    def test_recherche_sans_accents(self):
        import bibliotheque as B
        self.assertEqual(B.sans_accents("Récursivité  Nœud ÉLÈVE"), "recursivite noeud eleve")
        self.assertEqual(B.racine_du_mot("Listes"), B.racine_du_mot("liste"))


class TestCaracteres(unittest.TestCase):
    def test_caracteres_releves(self):
        sys.path.insert(0, os.path.join(RACINE, "outils"))
        import caracteres as C
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "x.md")
            with open(f, "w", encoding="utf-8") as h:
                h.write("a" + chr(0x200B) + "b " + chr(0x202E) + " élève" + chr(0x2022) + "s enseignant·e" + chr(0xA0) + "!")
            self.assertEqual(C.main([f]), 1)
            with open(f, "w", encoding="utf-8") as h:
                h.write("enseignant·e" + chr(0xA0) + "!")
            self.assertEqual(C.main([f]), 0)


if __name__ == "__main__":
    unittest.main()
