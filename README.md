# 🌟 Sky - SvelteKit Edition

Version moderne et performante du système de généalogie étudiante EMSE.

## 🚀 Démarrage Rapide

```bash
# Installer les dépendances
bun install

# Lancer le serveur de développement
bun run dev

# Ouvrir http://localhost:5173
```

## ✅ Migration Complétée - Phase 1

### Architecture
- ✅ SvelteKit configuré avec adapter-node
- ✅ TypeScript activé
- ✅ Tailwind CSS intégré
- ✅ Structure des dossiers (inspirée de MiGallery)
- ✅ Alias de chemins configurés

### Backend
- ✅ Système d'authentification (better-sqlite3)
- ✅ Routes API (`/api/auth/*`)
- ✅ Hooks serveur pour session management
- ✅ Types TypeScript complets

### Données
- ✅ data.json migré vers `/static/data/`
- ✅ positions.json migré
- ✅ Images migrées vers `/static/images/`
- ✅ Script Python calcul_positions.py conservé

## 📁 Structure

```
sky-sveltekit/
├── src/
│   ├── lib/
│   │   ├── components/     # Composants réutilisables
│   │   ├── server/        # Code serveur (auth.ts)
│   │   ├── stores/        # Svelte stores (à créer)
│   │   ├── types/         # TypeScript types
│   │   └── utils/         # Utilitaires
│   ├── routes/
│   │   ├── api/          # Routes API
│   │   ├── admin/        # Interface admin (à créer)
│   │   └── +page.svelte  # Page d'accueil
│   ├── app.css           # Styles globaux
│   ├── app.d.ts          # Types globaux
│   └── hooks.server.ts   # Hooks SvelteKit
├── static/
│   ├── data/
│   │   ├── data.json
│   │   └── positions.json
│   ├── images/
│   └── sky.png
└── scripts/
    └── calcul_positions.py
```

## 🔄 Prochaines Étapes

### Phase 2 : Stores Svelte (En cours)
- [ ] `authStore` - Gestion utilisateur
- [ ] `graphStore` - État du graphe
- [ ] `cameraStore` - Zoom/pan
- [ ] `themeStore` - Thème clair/sombre

### Phase 3 : Composants Canvas
- [ ] `GraphCanvas.svelte` - Rendu principal
- [ ] `StarfieldCanvas.svelte` - Arrière-plan
- [ ] `ProfileModal.svelte` - Fiche détaillée
- [ ] `TopBar.svelte` - Navigation
- [ ] `SearchBox.svelte` - Recherche

### Phase 4 : Admin
- [ ] Interface CRUD personnes
- [ ] Interface CRUD relations
- [ ] Export JSON

### Phase 5 : Tests & Optimisations
- [ ] Viewport culling
- [ ] Web Workers
- [ ] Tests Vitest

## 🛠️ Commandes

```bash
bun run dev          # Développement
bun run build        # Production
bun run preview      # Prévisualiser le build
python scripts/calcul_positions.py  # Recalculer positions
```

## 🔐 Authentification

L'API d'authentification est fonctionnelle :
- `POST /api/auth/login` - Connexion
- `POST /api/auth/logout` - Déconnexion
- `GET /api/auth/me` - Utilisateur actuel

## 📊 Comparaison Vanilla JS vs SvelteKit

| Avantage | Description |
|----------|-------------|
| **Réactivité** | `$state`, `$derived` - pas de `useState` |
| **Performance** | SSR, code splitting automatique |
| **DX** | TypeScript natif, HMR |
| **Routing** | File-based, simple |
| **Bundle** | ~15kb compilé vs ~50kb vanilla |

## 🎯 Différences avec MiGallery

- Pas de CAS EMSE (pour l'instant - login simulé)
- Canvas au lieu de galerie photos
- Focus sur visualisation de graphe
- Même architecture, même stack technique

## 📚 Technologies

- **Framework**: SvelteKit 2.x + Svelte 5
- **Langage**: TypeScript
- **Styles**: Tailwind CSS
- **Base de données**: better-sqlite3
- **Runtime**: Bun
- **Layout**: Python (NetworkX)

---

Migration en cours par étapes - Suivre [MIGRATION_SVELTEKIT.md](../Sky/MIGRATION_SVELTEKIT.md) pour le plan complet.
