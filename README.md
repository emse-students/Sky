# 🌟 Sky - EMSE Student Network

Application web moderne de visualisation et gestion du réseau de parrainage/adoption de l'EMSE (École des Mines de Saint-Étienne).

## 🚀 Démarrage Rapide

```bash
# Installation des dépendances
bun install

# Lancement en développement
bun run dev

# Accès à l'application
# http://localhost:5173
```

## 🏗️ Stack Technique

- **Framework:** SvelteKit 2.x + Svelte 5
- **Langage:** TypeScript
- **Styles:** Tailwind CSS
- **Base de données:** SQLite3 (better-sqlite3)
- **Visualisation:** Canvas 2D + layout ForceAtlas2 (graphology, TypeScript in-process)
- **Runtime:** Bun

## 📁 Structure du Projet

```
sky/
├── .github/
│   └── workflows/     # Configuration CI/CD
├── tests/            # Tests unitaires et d'intégration (Vitest)
├── src/
│   ├── lib/
│   │   ├── components/     # Composants Svelte réutilisables
│   │   │   ├── server/        # Code backend (database.ts, auth.ts, positions.ts)
│   │   ├── stores/        # Stores Svelte (état global)
│   │   ├── types/         # Définitions TypeScript
│   │   └── utils/         # Fonctions utilitaires
│   ├── routes/
│   │   ├── api/          # API REST
│   │   ├── profile/      # Pages profil
│   │   └── +page.svelte  # Page d'accueil (graphe)
│   └── hooks.server.ts   # Middleware d'authentification
├── database/
│   ├── sky.db            # Base de données SQLite
│   ├── schema.sql        # Schéma SQL (v3.0)
│   └── SCHEMA_REFERENCE.md  # Documentation complète
├── scripts/             # Scripts Node (init-db.js, migrations, packaging)
├── static/
│   ├── data/
│   │   ├── data.json     # Export JSON (généré)
│   │   └── positions.json # Positions des nœuds
│   └── images/           # Avatars
└── build/                # Build de production
```

## 🎯 Fonctionnalités

### Interface Principale

- ✅ **Visualisation interactive** du graphe de parrainage
- ✅ **Recherche** par nom, prénom ou promotion
- ✅ **Zoom/Pan** avec mini-carte de navigation
- ✅ **Profils détaillés** avec liens sociaux
- ✅ **Thème clair/sombre** avec persistance

### Système d'Authentification

- ✅ Connexion avec ID utilisateur
- ✅ Sessions persistantes (cookies)
- ✅ Gestion de profil
- ✅ Middleware de protection des routes

### Base de Données (SQLite)

- ✅ **5100+ profils** étudiants
- ✅ **1500+ relations** de parrainage/adoption
- ✅ Recherche full-text (FTS5)
- ✅ Contraintes d'intégrité référentielle
- ✅ Triggers de synchronisation

### Administration

- ✅ Interface Web harmonisée (Svelte 5)
- ✅ CRUD complet (personnes, relations, liens)
- ✅ Fusion de profils (merge)
- ✅ Gestion granulaire des relations (Officiel/Adoption)
- ✅ **Recalcul automatique** du graphe lors des modifications

## 🔄 CI/CD & Qualité

- **GitHub Actions:** Pipeline de vérification automatique
- **Linting:** ESLint + Prettier
- **Tests:** Vitest pour les tests unitaires et d'API
- **Type Checking:** Svelte-check strict

## 🛠️ Commandes Disponibles

```bash
# Développement
bun run dev              # Serveur dev (http://localhost:5173)
bun run build            # Build de production
bun run preview          # Preview du build

# Base de données
bun run db:init          # Initialise la base (schema + migrations)
# Administration via l'interface web /admin ; positions recalculees en
# TypeScript in-process a chaque modification du graphe.

# Tests
bun run test             # Tests unitaires (Vitest)
```

## 📊 Base de Données

### Tables Principales

| Table            | Description                            | Entrées  |
| ---------------- | -------------------------------------- | -------- |
| `people`         | Profils individuels                    | ~5100    |
| `relationships`  | Relations parrainage/adoption          | ~1500    |
| `external_links` | Liens sociaux (LinkedIn, GitHub, etc.) | Variable |

### Types de Relations

- **`parrainage`** - Relation officielle de parrainage
- **`adoption`** - Relation d'adoption

Voir [database/SCHEMA_REFERENCE.md](database/SCHEMA_REFERENCE.md) pour la documentation complète.

## 🔐 Authentification

L'API REST fournit les endpoints suivants :

```typescript
POST / api / auth / login; // Connexion
POST / api / auth / logout; // Déconnexion
GET / api / auth / me; // Utilisateur connecté
```

Les sessions sont gérées via cookies HTTP-only sécurisés.

## 🎨 Développement

### Stores Svelte

- **`authStore`** - État d'authentification
- **`graphStore`** - Données du graphe
- **`cameraStore`** - Position caméra (zoom/pan)
- **`themeStore`** - Thème visuel

### Composants Principaux

- **`GraphCanvas.svelte`** - Rendu du graphe (Canvas 2D)
- **`StarfieldCanvas.svelte`** - Arrière-plan animé
- **`Navbar.svelte`** - Barre de navigation
- **`Tooltip.svelte`** - Infobulles

### Optimisations

- ✅ **Viewport culling** - Rendu uniquement des nœuds visibles
- ✅ **Code splitting** automatique (SvelteKit)
- ✅ **SSR** pour le SEO
- ✅ **Image lazy loading**

## 🚀 Déploiement

```bash
# Build de production
bun run build

# Le dossier build/ contient l'app Node.js
# Démarrage avec :
node build/index.js
```

### Variables d'environnement

Créer un fichier `.env` (voir `.env.example`) :

```bash
MICONNECT_BASE_URL=https://auth.canari-emse.fr
MICONNECT_CLIENT_ID=<client OIDC de l app Sky>
MICONNECT_CLIENT_SECRET=<secret OIDC associe>
MIGALLERY_API_KEY=<cle API MiGallery>
SKY_ADMIN_SUBS=<sub Authentik admins, separes par des virgules>
```

## 📚 Documentation

- [database/SCHEMA_REFERENCE.md](database/SCHEMA_REFERENCE.md) - Schéma de base de données
- [database/README.md](database/README.md) - Guide de la base de données
- [SvelteKit Docs](https://kit.svelte.dev/) - Documentation officielle

## 🤝 Contribution

### Workflow Git

```bash
# Créer une branche
git checkout -b feature/nouvelle-fonctionnalite

# Commit avec message clair
git commit -m "feat: ajout de X"

# Push et pull request
git push origin feature/1 (Mise à jour CI/CD & API - 5
```

## 📝 Licence

Projet interne EMSE - Tous droits réservés

---

**Version actuelle:** 3.0 (Base de données nettoyée - 1er février 2026)
