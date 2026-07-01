# Sky Database

Base de données SQLite pour le système de généalogie étudiante EMSE.

## 📁 Fichiers

- **`sky.db`** - Base de données SQLite principale
- **`sky.db.backup`** - Sauvegarde de sécurité
- **`schema.sql`** - Schéma de référence (v3.0)
- **`SCHEMA_REFERENCE.md`** - Documentation complète du schéma

## 🚀 Utilisation

### Administration

L'administration se fait via l'interface web **`/admin`** (Svelte 5, reservee aux
admins) : recherche/edition des profils, gestion des relations (Parrainage/
Adoption) et des liens, fusion de profils, suppression avec CASCADE.

### Recalcul des Positions

Les positions du graphe sont calculees en **TypeScript in-process**
(`src/lib/server/positions.ts`, ForceAtlas2 via graphology) et ecrites dans
`database/positions.json`. Le recalcul est automatique a chaque modification du
graphe (creation/suppression de lien ou de fiche, import) ; un bouton
**« Recalculer »** dans `/admin` permet aussi de le relancer manuellement.

## 📊 Structure

### Tables Principales

1. **`people`** - Profils individuels (5100+ entrées)
2. **`relationships`** - Relations de parrainage/adoption (1500+ relations)
3. **`external_links`** - Liens sociaux (LinkedIn, GitHub, etc.)

### Types de Relations

- **`parrainage`** - Relation officielle de parrainage (1495 relations)
- **`adoption`** - Relation d'adoption (13 relations)

## 🔧 Migrations

Voir `SCHEMA_REFERENCE.md` pour l'historique complet des migrations.

**Dernière migration:** v3.0 (1er février 2026)

- Renommage `family1` → `parrainage`, `family2` → `adoption`
- Suppression des colonnes inutilisées (`bio`, `year`, `notes`, `label`)
- Suppression des tables obsolètes (`associations`, `relationship_types`)

## 📖 Documentation

Consulter [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md) pour :

- Description détaillée de toutes les tables
- Guide d'utilisation complet
- Requêtes SQL utiles
- Bonnes pratiques
