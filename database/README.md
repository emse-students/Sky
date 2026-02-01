# Sky Database

Base de données SQLite pour le système de généalogie étudiante EMSE.

## 📁 Fichiers

- **`sky.db`** - Base de données SQLite principale
- **`sky.db.backup`** - Sauvegarde de sécurité
- **`schema.sql`** - Schéma de référence (v3.0)
- **`SCHEMA_REFERENCE.md`** - Documentation complète du schéma

## 🚀 Utilisation

### Interface Graphique (Admin)

```bash
python scripts/db_gui.py
```

**Fonctionnalités:**

- Recherche et édition des profils
- Gestion des relations (Parrainage/Adoption)
- Gestion des liens sociaux
- Fusion de profils (merge)
- Suppression avec CASCADE automatique

### Recalcul des Positions

```bash
bun run calcul
```

Génère `static/data/positions.json` pour la visualisation du graphe.

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
