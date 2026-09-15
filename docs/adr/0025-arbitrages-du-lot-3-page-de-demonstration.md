# 0025 : Arbitrages du lot 3 (page de démonstration)

Date : 2026-09-15
Statut : accepté

## Contexte

Le lot 3 ajoute une page Svelte de démonstration du parcours vendeur. Six questions n'étaient
pas tranchées par `specs/lot-3-ui.md`, et le lot introduit un principe de mise en forme qui
mérite d'être écrit plutôt que redécouvert à la lecture du CSS.

## Décision

1. **Projet npm séparé dans `web/`.** `web/package.json` porte `"type": "module"` et ses propres
   dépendances. L'API reste en CommonJS (ADR 0002) et `@sveltejs/vite-plugin-svelte` est
   ESM-only : les mélanger imposerait des contorsions dans la configuration Nest et le
   `tsconfig.json` racine. Coût assumé : un `npm --prefix web install` en plus. Le script racine
   `npm run web` délègue à ce projet, conformément à UI-301.
2. **`typescript` en dépendance de développement de `web/`,** avec un script `check`
   (`tsc --noEmit`). C'est une quatrième dépendance au-delà de Svelte, Vite et leur plugin ;
   sans elle, `web/src/lib/api.ts` serait typé d'après les vues du serveur mais jamais vérifié.
   Elle ne couvre que les fichiers `.ts` : les composants `.svelte` ne sont vérifiés que par la
   compilation de Vite, `svelte-check` n'ayant pas été ajouté.
3. **Le tenant est un UUID, pas le code `LM-FR`.** `TenantMiddleware` exige un UUID dans
   `X-Tenant-Id` et aucun endpoint ne résout un code en identifiant. `VITE_TENANT_ID` porte donc
   l'UUID du tenant `LM-FR` produit par le seed, et le champ de secours de la page attend un UUID.
   UI-302 a été reformulé en conséquence.
4. **Avertissements traduits, erreurs brutes.** Les avertissements de FR-108 arrivent en codes :
   `ZONE_NOT_COVERED` et `OPERATION_REMOVED:<CODE>` sont rendus par une phrase française, tout
   autre code est affiché tel quel. Les erreurs de UI-308 restent affichées avec le `code` et le
   `message` de l'API, sans reformulation : ce sont elles que le développeur lit en démonstration.
5. **Pile de polices système.** Pas de `<link>` vers une fonte distante : la page se démontre
   face à une infra locale et ne doit pas dépendre du réseau. La personnalité typographique passe
   par l'échelle et par les chiffres à chasse fixe sur les montants, les durées et les numéros.
6. **Historique des devis : statuts lus, jamais déduits.** Une ligne est grisée si l'API renvoie
   `SUPERSEDED` ou `EXPIRED` ; le bouton « Accepter » n'apparaît que sur un devis `ISSUED` ; le
   devis détaillé est le premier de la liste, que l'API trie déjà par `issuedAt` décroissant.

**Principe visuel** : ce que le vendeur saisit est sur fond blanc, ce que le serveur calcule est
sur fond teinté (`--computed`). Zone, opérations, avertissements, lignes et totaux sont toujours
sur le fond teinté. La frontière « aucune règle métier côté navigateur » devient visible à
l'écran, et toute règle qui migrerait vers la page se verrait au premier coup d'œil.

## Écarté

- Dépendances Vite à la racine avec un `vite.config.mts` : moins d'installations, mais mélange
  un projet ESM au service CommonJS et expose le build Nest aux sources du front.
- `svelte-check` : une dépendance de plus pour un lot sans test automatisé (ADR 0024).
- Résolution du code d'enseigne en UUID par un nouvel endpoint : hors périmètre du lot.
- Mise en page en deux colonnes « déclaré / calculé » : elle coupait en deux le bloc
  « Prestation » que UI-303 décrit d'un seul tenant.

## Conséquence

Le front se lance en deux temps (`npm --prefix web install` une fois, puis `npm run web`).
Si un lot ultérieur transforme cette page en vrai front, les points 1, 2 et 5 sont les premiers
à revoir : espace de travail npm partagé, `svelte-check`, et fonte auto-hébergée.
