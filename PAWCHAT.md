# Ce fork — pour PawChat

Ce dépôt est un fork de [clockworklabs/SpacetimeDB](https://github.com/clockworklabs/SpacetimeDB)
qui backe la production de [PawChat](https://github.com/mairie-creusot/pawchat), une app
communautaire Discord-like avec un métavers VR. La branche de production de ce fork est
**`pawchat-trimmed`** (pas `master`) — c'est elle que consomment `docker-compose.dev.yml` et
`docker-compose.prod.yml` de PawChat.

Ce fichier documente ce qui diverge d'upstream et pourquoi, pour qu'un futur rebase/merge
depuis `clockworklabs/SpacetimeDB` sache quels changements sont fork-spécifiques (à
conserver ou réadapter) plutôt que des reliquats à jeter.

## Résumé des changements

| Sujet | Commit(s) | Pourquoi |
|---|---|---|
| Build "trimmed" : `spacetimedb-core` compilé `default-features = false` | `a1b3ee9f4` | Désactive le host JS/TS (V8) et le profiler Tracy — PawChat n'utilise que des modules Rust/WASM, ni l'un ni l'autre n'est nécessaire en prod. `crates/core/src/host/v8_stub.rs` remplace le vrai host V8 par un stub qui compile mais ne fait rien (voir les warnings `dead_code` sur ce fichier au build — attendus). |
| Schéma de version `+pawchat.N` (métadonnée de build), jamais `-pawchat.N` (pré-version) | `a1b3ee9f4` puis corrigé par `0c5c80767` | Le premier essai (`2.7.0-pawchat.1`, suffixe `-`) a **cassé le démarrage en prod une fois** — un suffixe SemVer *pre-release* change la sémantique de comparaison de version ailleurs dans le moteur (résolution de compatibilité client/schéma). `+pawchat.N` (métadonnée de build, RFC SemVer) n'a pas ce problème : il s'affiche mais ne participe jamais aux comparaisons. **Ne jamais revenir à un suffixe `-`.** |
| Bannière de démarrage affiche la version | `8f7b11f78` | Confort opérationnel — savoir immédiatement quelle version tourne en lisant les logs de démarrage du conteneur. |
| Compression zstd des segments/snapshots froids : niveau 3 → 12 | `bb00a225c` | Le disque du VPS de prod est le facteur limitant, pas le CPU — un niveau de compression plus agressif sur les données froides réduit l'empreinte disque au prix d'un peu de CPU au moment de la compression (pas de la lecture). |
| `Dockerfile.pawchat` (`crates/standalone/`) | `a1b3ee9f4` | Image de prod : cross-compile vers `x86_64-unknown-linux-musl` sur un stage `rust:1.93.0` (glibc), stage final `alpine:3.20` minimal. Ne build que `spacetimedb-standalone`, jamais le CLI ni le host JS/TS — cohérent avec le build trimmed ci-dessus. |
| Image réduite de 77,8 Mo à 51,1 Mo (-34 %) | `ada6a4da1` (PR [#3](https://github.com/mairie-creusot/SpacetimeDB/pull/3)) | `CARGO_PROFILE_RELEASE_{STRIP,LTO,CODEGEN_UNITS}` en `ARG`/`ENV` du Dockerfile (pas dans le `[profile.release]` partagé du workspace, pour ne pas fuiter vers les autres builds du monorepo) : strip des tables de symboles (-13,1 Mo) + LTO fat/1 unité de codegen (-12,0 Mo). Retrait de `apk add ca-certificates libgcc` (-1,6 Mo) : binaire static-pie sans aucun `DT_NEEDED`, magasin de confiance déjà présent dans la couche de base alpine (vérifié par un vrai fetch HTTPS du JWKS Google). `panic = "abort"` explicitement écarté : `crates/core/src/util/jobs.rs` et `host/scheduler.rs` s'appuient sur `catch_unwind` pour qu'un panic dans le travail d'une base ne tue pas tout le process. Nouveau `Dockerfile.pawchat.dockerignore` (le `.dockerignore` racine laissait passer `target/`/`node_modules/` locaux, >1 Go de contexte). Contrepartie : les backtraces de panic de cette image n'ont plus de noms de fonctions (`--build-arg CARGO_STRIP=none` pour les retrouver au besoin). |
| SDK TypeScript (`crates/bindings-typescript/`) : plus aucun `Function(...)` / `eval` dynamique à l'exécution | `2998608b4` (PR [#2](https://github.com/mairie-creusot/SpacetimeDB/pull/2)) | Le SDK construisait ses (dé)sérialiseurs à l'exécution via `Function("reader", body)` — traité comme `eval()` par les navigateurs, donc bloqué par toute CSP `script-src` stricte (sans `'unsafe-eval'`). Bug connu côté upstream ([#4669](https://github.com/clockworklabs/SpacetimeDB/issues/4669), [#4966](https://github.com/clockworklabs/SpacetimeDB/issues/4966), [#5180](https://github.com/clockworklabs/SpacetimeDB/issues/5180) toujours ouverte) : réécrit en closures récursives, zéro `eval`, format sur le fil identique (vérifié octet pour octet), 226/226 tests du SDK. Publié pour PawChat via une [GitHub Release](https://github.com/mairie-creusot/SpacetimeDB/releases/tag/pawchat-sdk-2.7.0-csp-fix) (tarball npm), en attendant une éventuelle reprise upstream. |
| `.github/workflows/docker-pawchat.yml` | `e92664cfe` (PR [#1](https://github.com/mairie-creusot/SpacetimeDB/pull/1)) | Publie automatiquement `ghcr.io/mairie-creusot/pawchat-spacetimedb` (build de `Dockerfile.pawchat`) sur push vers `pawchat-trimmed` touchant le code serveur, ou manuellement via `workflow_dispatch`. Avant ce workflow, cette image était bâtie à la main sur un poste local puis poussée manuellement — aucune trace de comment `trimmed-musl-v4` avait été produite. **Le tag épinglé par les `docker-compose` de PawChat n'est jamais republié automatiquement** (seulement `:latest`/`:sha-*`) — republier le tag stable est un `workflow_dispatch` manuel explicite, pour ne jamais faire évoluer silencieusement ce que la prod pointe déjà. **Piège vécu une fois** : supprimer un package GHCR existant pour réparer sa liaison au dépôt (voir plus bas) supprime AUSSI tous ses tags, y compris ceux dont d'autres services dépendent — republier immédiatement après. |

## Consommation côté PawChat

- **Image serveur** : `ghcr.io/mairie-creusot/pawchat-spacetimedb` (voir `docker-compose.dev.yml` /
  `docker-compose.prod.yml` côté PawChat). Buildée par `.github/workflows/docker-pawchat.yml`
  ci-dessus depuis `crates/standalone/Dockerfile.pawchat`.
- **SDK client TypeScript** : PawChat référence directement le tarball de la
  [Release GitHub](https://github.com/mairie-creusot/SpacetimeDB/releases) correspondant au
  dernier fix pertinent (voir `package.json` de PawChat, dépendance `spacetimedb` en URL directe
  vers un asset de release, verrouillée par hash d'intégrité dans `package-lock.json`) — pas
  publié sur le registre npm public.

## Workflow de contribution sur ce fork

- La branche de travail/production est **`pawchat-trimmed`**, pas `master`. Les PR de ce fork
  ciblent `pawchat-trimmed`.
- Le check CI `Based on \`master\`` (hérité d'upstream) échouera systématiquement sur ce fork —
  c'est attendu, il suppose que toute PR cible `master`. Idem pour `Internal Tests`, qui déclenche
  un pipeline interne Clockwork Labs nécessitant des secrets absents de ce fork. Les deux sont du
  bruit hérité, pas des échecs réels — se fier aux checks pertinents (`TypeScript - Tests`,
  `Build and test wasm bindings`, `Lints`).
- Réglage repo requis pour que `docker-pawchat.yml` puisse publier sur GHCR : **Settings → Actions
  → General → Workflow permissions → "Read and write permissions"**.
- Un package GHCR nouvellement créé est **privé par défaut**, même sur un dépôt public —
  `GITHUB_TOKEN` ne peut pas changer cette visibilité via l'API. Après le tout premier push
  réussi d'une nouvelle image, il faut la passer en **Public** une fois à la main (page du
  package sur GitHub → Package settings → Change visibility).
- **Si `docker/build-push-action` échoue avec `permission_denied: write_package` alors que
  "Workflow permissions" et "Manage Actions access" (rôle Admin) sont déjà corrects** : c'est
  probablement qu'un package du même nom existe déjà, poussé un jour à la main (hors CI), dont
  la liaison interne au dépôt est cassée côté registre — l'UI "Manage Actions access" peut
  afficher un lien correct sans que ce soit réellement le cas. Le correctif qui a marché :
  supprimer entièrement le package existant (page du package → Danger Zone → Delete this
  package), puis relancer le workflow — le package recréé automatiquement se lie correctement.
  **Attention** : supprimer le package supprime AUSSI tous ses tags existants, y compris ceux
  que d'autres services référencent déjà (vécu avec `trimmed-musl-v4`, republié dans la foulée
  via `workflow_dispatch` avec l'input `tag`) — vérifier qui pointe sur l'image avant de
  supprimer, et republier immédiatement les tags encore utilisés.
