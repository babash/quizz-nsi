/* QuizzNSI : chiffrement des réponses des élèves (MIT, Babash - NSI Tani Malandi).
   Le canal temps réel est public : tout message y est reçu par tous les appareils de la séance.
   La réponse d'un·e élève n'est donc lisible que par la page projetée : celle-ci publie une clé
   publique (ECDH P-256) dans sa présence ; chaque téléphone en tire une clé AES-GCM qu'il partage
   avec elle, et chiffre sa réponse. Les autres téléphones ne voient qu'un message illisible ; une fausse page
   projetée, ouverte avec le code de séance, recevrait aussi les réponses (risque accepté, docs/DONNEES.md).
   La clé publique du téléphone est dans sa présence (la page projetée y relie l'identifiant de l'élève), jamais sur
   l'enveloppe d'une réponse : la page projetée essaie les clés qu'elle connaît, et un tiers ne relie aucun envoi à un pseudo.
   Tout passe par l'API Web Crypto du navigateur (pages en https ou en local). */
(function (racine) {
  'use strict';
  const Q = racine.QuizzNSI = racine.QuizzNSI || {};
  const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
  const B64 = /^[A-Za-z0-9_-]+$/;

  const versB64 = octets => { let s = ''; for (const b of new Uint8Array(octets)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const depuisB64 = t => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  // une clé publique : deux coordonnées de 32 octets, en base64url (43 caractères)
  const estClePublique = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 2
    && typeof v.x === 'string' && typeof v.y === 'string' && v.x.length === 43 && v.y.length === 43 && B64.test(v.x) && B64.test(v.y);

  const disponible = () => !!(racine.crypto && racine.crypto.subtle);
  async function paire() {
    const p = await crypto.subtle.generateKey(ECDH, false, ['deriveKey']); // clé privée non extractible ; la publique s'exporte toujours
    const j = await crypto.subtle.exportKey('jwk', p.publicKey);
    return { prive: p.privateKey, publique: { x: j.x, y: j.y } };
  }
  async function cleCommune(prive, publique) {
    const autre = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: publique.x, y: publique.y, ext: true }, ECDH, false, []);
    return crypto.subtle.deriveKey({ name: 'ECDH', public: autre }, prive, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /* Aucune attribution par un tiers (T131b) : l'enveloppe d'une réponse ne porte ni identifiant ni clé de l'expéditeur
     ({ iv, donnees } seulement), et sa longueur est toujours la même : le texte clair est complété par des espaces jusqu'à
     TAILLE octets (JSON.parse les ignore), donc donnees fait toujours DONNEES caractères. Un·e élève qui écoute le canal
     ne peut relier aucun envoi à un pseudo, ni par la clé, ni par la taille. */
  const TAILLE = 384, DONNEES = Math.ceil((TAILLE + 16) * 4 / 3); // 16 octets d'étiquette AES-GCM ; 534 caractères
  const decouper = e => ({ x: e.slice(0, 43), y: e.slice(43) });

  /* La page projetée : sa clé publique, et le déchiffrement d'une enveloppe { iv, donnees }. Elle essaie les clés
     publiques des élèves qu'elle connaît (candidats : leurs empreintes, js/animer.js) ; AES-GCM refuse toute autre clé
     que la bonne (étiquette d'authenticité). Renvoie { objet, de } (de : l'empreinte de la clé qui a déchiffré), ou null
     (illisible, forgée, ou venue d'une clé inconnue). Coût : une tentative de déchiffrement par élève, en parallèle. */
  async function hote() {
    const p = await paire(), cache = new Map();
    const commune = e => { if (!cache.has(e)) { if (cache.size > 5000) cache.clear(); cache.set(e, cleCommune(p.prive, decouper(e)).catch(() => null)); } return cache.get(e); };
    return {
      publique: p.publique,
      async dechiffrer(m, candidats) {
        if (!m || typeof m.iv !== 'string' || m.iv.length !== 16 || !B64.test(m.iv) || typeof m.donnees !== 'string' || m.donnees.length !== DONNEES || !B64.test(m.donnees)) return null;
        const iv = depuisB64(m.iv), donnees = depuisB64(m.donnees);
        const essais = await Promise.all([...new Set(candidats || [])].filter(e => typeof e === 'string' && /^[A-Za-z0-9_-]{86}$/.test(e)).map(async e => {
          try { const k = await commune(e); if (!k) return null; return { e, clair: await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, donnees) }; } catch (x) { return null; }
        }));
        const bons = essais.filter(Boolean);
        if (bons.length !== 1) return null;
        try { return { objet: JSON.parse(new TextDecoder().decode(bons[0].clair)), de: bons[0].e }; } catch (x) { return null; }
      },
    };
  }

  /* Un téléphone : chiffrer un objet pour une clé publique de la page projetée.
     garde : la paire de clés du téléphone, gardée sur l'appareil pour la séance ({ x, y, d } en base64url, voir
     js/rejoindre.js) ; la page projetée relie l'identifiant de l'élève à cette clé publique (js/animer.js), et un
     rechargement de la page doit donc retrouver la même. Sans garde valable (ou illisible), une nouvelle paire.
     La partie privée ne sort jamais de l'appareil : elle n'est ni envoyée ni affichée. */
  const estGarde = v => estClePublique(v && typeof v === 'object' ? { x: v.x, y: v.y } : null) && typeof v.d === 'string' && v.d.length === 43 && B64.test(v.d) && Object.keys(v).length === 3;
  async function eleve(garde) {
    let prive = null, publique = null, cle = null;
    if (estGarde(garde)) {
      try {
        prive = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: garde.x, y: garde.y, d: garde.d, ext: true }, ECDH, false, ['deriveKey']);
        publique = { x: garde.x, y: garde.y }; cle = { x: garde.x, y: garde.y, d: garde.d };
      } catch (e) { prive = null; }
    }
    if (!prive) {
      // extractible une seule fois, pour être gardée sur l'appareil ; la clé importée ensuite ne l'est plus
      const p = await crypto.subtle.generateKey(ECDH, true, ['deriveKey']);
      const j = await crypto.subtle.exportKey('jwk', p.privateKey);
      prive = p.privateKey; publique = { x: j.x, y: j.y }; cle = { x: j.x, y: j.y, d: j.d };
    }
    const cles = new Map();
    return {
      publique, cle,
      async chiffrer(objet, publiqueHote) {
        const k = publiqueHote.x + publiqueHote.y;
        if (!cles.has(k)) cles.set(k, cleCommune(prive, publiqueHote));
        const iv = crypto.getRandomValues(new Uint8Array(12)), texte = new TextEncoder().encode(JSON.stringify(objet));
        if (texte.length > TAILLE) throw new Error('réponse trop longue');
        const plein = new Uint8Array(TAILLE).fill(0x20); plein.set(texte); // longueur constante (espaces)
        const donnees = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cles.get(k), plein);
        return { iv: versB64(iv), donnees: versB64(donnees) }; // ni identifiant ni clé de l'expéditeur
      },
    };
  }
  // l'empreinte d'une clé publique (ce que la page projetée relie à l'identifiant d'un·e élève)
  const empreinte = c => estClePublique(c) ? c.x + c.y : null;

  Q.chiffre = { disponible, hote, eleve, estClePublique, estGarde, empreinte, DONNEES };
})(typeof window !== 'undefined' ? window : globalThis);
