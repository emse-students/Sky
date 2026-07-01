# 📚 Sky Database - Référence Complète du Schéma

> **Version:** 3.0 (Nettoyage complet - suppression des champs inutilisés)  
> **Dernière mise à jour:** 1 février 2026  
> **Type:** SQLite3 avec FTS5 (Full-Text Search)

---

## 🎯 Vue d'ensemble

La base de données Sky stocke les informations sur les membres de l'ICM (Institut Camille Jordan) et leurs relations de parrainage/adoption. Elle est structurée comme un **graphe orienté** où :

- Les **nœuds** = personnes (`people`)
- Les **arêtes** = relations (`relationships`)

---

## 📋 Tables Principales

### 1. `people` — Profils individuels

Stocke toutes les informations sur chaque personne.

| Colonne      | Type      | Nullable | Description                           |
| ------------ | --------- | -------- | ------------------------------------- |
| `id`         | TEXT      | ❌       | Identifiant unique (ex: `prenom.nom`) |
| `first_name` | TEXT      | ❌       | Prénom                                |
| `last_name`  | TEXT      | ❌       | Nom de famille                        |
| `level`      | INTEGER   | ✅       | Année de promotion (ex: 2024)         |
| `image_url`  | TEXT      | ✅       | URL de l'avatar (MiGallery ou local)  |
| `created_at` | TIMESTAMP | ✅       | Date de création                      |
| `updated_at` | TIMESTAMP | ✅       | Date de dernière modification         |

**Clé primaire:** `id`

**Index:**

- `idx_people_level` sur `level`
- `idx_people_last_name` sur `last_name`
- `idx_people_first_name` sur `first_name`

---

### 2. `relationships` — Relations généalogiques

Représente les liens de parrainage/adoption entre deux personnes.  
**Structure orientée:** `source_id` → `target_id`

| Colonne     | Type    | Nullable | Description                          |
| ----------- | ------- | -------- | ------------------------------------ |
| `id`        | INTEGER | ❌       | ID auto-incrémenté                   |
| `source_id` | TEXT    | ❌       | ID du parrain/marraine (nœud source) |
| `target_id` | TEXT    | ❌       | ID du filleul(e) (nœud cible)        |
| `type`      | TEXT    | ❌       | Type de relation (voir ci-dessous)   |
| `year`      | INTEGER | ✅       | Année d'établissement de la relation |

| `**Clé primaire:**`id`

**Contraintes:**

- `UNIQUE(source_id, target_id, type)` — Évite les doublons
- `FOREIGN KEY source_id → people(id) ON DELETE CASCADE`
- `FOREIGN KEY target_id → people(id) ON DELETE CASCADE`
- `FOREIGN KEY type → relationship_types(type)`

**Index:**

- `idx_relationships_source` sur `source_id`
- `idx_relationships_target` sur `target_id`
- `idx_relationships_type` sur `type`

#### 📌 Types de relations (`type`)

| Valeur       | Signification       | Statut   | Couleur   |
| ------------ | ------------------- | -------- | --------- |
| `family1`    | Parrainage OFFICIEL | ✅ Actif | `#3b82f6` |
| `family2`    | Adoption            | ✅ Actif | `#8b5cf6` |
| `parrainage` | Ancien format       | Statut   | Couleur   |
| ------------ | -------------       | -------- | --------- |
| `parrainage` | Officiel            | ✅ Actif | `#3b82f6` |
| `adoption`   | Adoption            | ✅ Actif | `#8b5cf6` |

Parent (source_id) ──[type]──> Child (target_id)
Parrain Filleul

````

**Exemple:**

```sql
-- Lucas est le parrain officiel de Jolan
INSERT INTO relationships (source_id, target_id, type)
VALUES ('lucas.hausner', 'jolan.boudin', 'family1');
````

Pour récupérer :

- **Parrains de Jolan:** `WHERE target_id = 'jolan.boudin'`
- **Filleuls de Lucas:** `WHERE source_id = 'lucas.hausner'`

---parrainage

### 3. `external_links` — Liens externes

Stocke les réseaux sociaux et autres liens externes associés à une personne.

| Colonne         | Type      | Nullable | Description                    |
| --------------- | --------- | -------- | ------------------------------ |
| `id`            | INTEGER   | ❌       | ID auto-incrémenté             |
| `person_id`     | TEXT      | ❌       | Référence à `people(id)`       |
| `type`          | TEXT      | ❌       | Type de lien (voir ci-dessous) |
| `url`           | TEXT      | ❌       | URL du lien                    |
| `label`         | TEXT      | ✅       | Label personnalisé (optionnel) |
| `display_order` | INTEGER   | ✅       | Ordre d'affichage (défaut: 0)  |
| `created_at`    | TIMESTAMP | ✅       | Date de création               |

**Clé primaire:** `id`

**Contraintes:**

- `FOREIGN KEY person_id → people(id) ON DELETE CASCADE`

**Index:**

- `idx_external_links_person` sur `person_id`

#### 📌 Types de liens (`type`)

| Valeur      | Description         |
| ----------- | ------------------- |
| `LinkedIn`  | Profil LinkedIn     |
| `Email`     | Adresse email       |
| `GitHub`    | Profil GitHub       |
| `Instagram` | Profil Instagram    |
| `Phone`     | Numéro de téléphone |
| `Website`   | Site web personnel  |

---

## 🔍 Full-Text Search (FTS5)

### Table `people_fts`

Table virtuelle pour la recherche rapide dans les noms.

**Colonnes indexées:**

- `first_name`
- `last_name`

**Champ non-indexé:**

- `id` (UNINDEXED, juste pour référence)

**Synchronisation automatique:**
La table `people_fts` est maintenue à jour automatiquement via des triggers :

- `people_fts_insert` — Ajout d'une nouvelle personne
- `people_fts_update` — Modification d'un nom
- `people_fts_delete` — Suppression d'une personne

**Exemple de recherche:**

```sql
-- Rechercher "jolan"
SELECT p.*
FROM people p
JOIN people_fts fts ON p.rowid = fts.rowid
WHERE people_fts MATCH 'jolan*'
ORDER BY rank;
```

---

## 📊 Vues SQL (Views)

### `v_people_complete`

Vue enrichie avec toutes les informations liées à une personne.

**Colonnes supplémentaires:**

- `links` (JSON) — Array des liens externes
- `associations` (JSON) — Array des associations
- `relationship_count` (INTEGER) — Nombre total de relations

### `v_relationships_detailed`

Vue enrichie des relations avec les noms complets.

**Colonnes:**

- Toutes les colonnes de `relationships`
- `source_name` — Nom du parrain/marraine
- `target_name` — Nom du filleul(e)
- `type_display` — Nom affiché du type
- `type_color` — Couleur du type

---

## 🗂️ Règles de CASCADE

Toutes les tables secondaires utilisent `ON DELETE CASCADE` :

| Table            | Action                                 |
| ---------------- | -------------------------------------- |
| `relationships`  | Suppression auto si personne supprimée |
| `external_links` | Suppression auto si personne supprimée |

**Exemple:**

```sql
-- Supprimer une personne supprime automatiquement :
-- - Toutes ses relations (en tant que source OU target)
-- - Tous ses liens externes
DELETE FROM people WHERE id = 'john.doe';
```

---

## 🔄 Historique des Migrations

### Migration 2.0 → 3.0 (1er février 2026)

**Changements appliqués:**

1. ✅ **Renommage des types de relation**
   - `family1` → `parrainage` (1495 relations mises à jour)
   - `family2` → `adoption` (13 relations mises à jour)

2. ✅ **Suppression de colonnes inutilisées**
   - `relationships.year` (0% utilisé)
   - `relationships.notes` (0% utilisé)
   - `people.bio` (0% utilisé)
   - `external_links.label` (0% utilisé)

3. ✅ **Suppression de tables obsolètes**
   - Table `associations` (vide)
   - Table `relationship_types` (remplacée par des valeurs directes)

4. ✅ **Scripts de migration utilisés:**
   - `scripts/cleanup_db.py` — Nettoyage complet de la base

### Migration 1.0 → 2.0 (1er février 2026)

**Changements appliqués:**

1. ✅ **Suppression de `nickname`**
   - Colonne supprimée de `people`
   - FTS triggers reconstruits sans `nickname`
   - Backend TypeScript mis à jour

2. ✅ **Conversion initiale des types**
   - `parrainage` → `family1`

3. ✅ **Scripts de migration utilisés:**
   - `scripts/remove_nickname_db.py`
   - `scripts/fix_db.py`

---

## 🛠️ Outils d'Administration

### Interface Graphique (Tkinter)

```bash
python scripts/db_gui.py
```

**Fonctionnalités:**

- ✅ Recherche et visualisation des profils
- ✅ Édition CRUD complète des personnes
- ✅ Gestion des liens sociaux
- ✅ Gestion des relations (4 quadrants : Parrainage/Adoption × Parrains/Filleuls)
- ✅ Fusion de profils (merge)
- ✅ Suppression avec CASCADE automatique

### Script CLI (Python)

```bash
python scripts/db_explorer.py
```

**Fonctionnalités:**

- Exploration basique en ligne de commande
- Requêtes SQL directes

---

## 📝 Bonnes Pratiques

### ✅ À FAIRE

1. **Toujours utiliser `parrainage` et `adoption`** pour les nouvelles relations
2. **Vérifier l'existence des IDs** avant d'insérer des relations
3. **Utiliser les transactions** pour les opérations multiples
4. **Respecter la direction** : Parrain (source) → Filleul (target)

### ❌ À ÉVITER

1. **Ne jamais** référencer `nickname`, `bio`, `year`, `notes`, `label` (n'existent plus)
2. **Ne pas** créer de relations circulaires directes (même si techniquement possible)
3. **Ne pas** insérer de doublons (contrainte UNIQUE)
4. **Ne pas** utiliser les anciens types `family1`/`family2` (obsolètes)

---

## 🔧 Requêtes Utiles

### Trouver tous les parrains d'une personne

```sql
SELECT p.first_name, p.last_name, r.type
FROM relationships r
JOIN people p ON r.source_id = p.id
WHERE r.target_id = 'jolan.boudin'
AND r.type IN ('parrainage', 'adoption');
```

### Trouver tous les filleuls d'une personne

```sql
SELECT p.first_name, p.last_name, r.type
FROM relationships r
JOIN people p ON r.target_id = p.id
WHERE r.source_id = 'lucas.hausner'
AND r.type IN ('parrainage', 'adoption');
```

### Statistiques par promotion

```sql
SELECT
    level,
    COUNT(*) as nb_personnes,
    COUNT(DISTINCT CASE WHEN image_url IS NOT NULL THEN id END) as nb_avec_photo
FROM people
GROUP BY level
ORDER BY level DESC;
```

### Détecter les relations orphelines

```sql
SELECT r.*
FROM relationships r
LEFT JOIN people p1 ON r.source_id = p1.id
LEFT JOIN people p2 ON r.target_id = p2.id
WHERE p1.id IS NULL OR p2.id IS NULL;
```

---

## 📦 Fichiers Associés

| Fichier                       | Description                                |
| ----------------------------- | ------------------------------------------ |
| `database/schema.sql`         | Définition SQL de référence                |
| `database/sky.db`             | Base de données SQLite3 active             |
| `database/sky.db.backup`      | Backup de sécurité                         |
| `src/lib/server/database.ts`  | Couche d'accès TypeScript (Backend)        |
| `src/lib/types/graph.ts`      | Définitions TypeScript des types           |
| `scripts/db_gui.py`           | Interface graphique d'administration       |
| `src/lib/server/positions.ts` | Calcul des positions pour la visualisation |

---

## 🎨 Schéma Relationnel (ERD)

```
┌─────────────────┐
│     people      │
│─────────────────│
│ id (PK)         │◄─────┐
│ first_name      │      │
│ last_name       │      │
│ level           │      │
│ bio             │      │
│ image_url       │      │
└─────────────────┘      │
         ▲               │
         │               │
         │ person_id (FK)│
         │               │
┌────────┴──────────┐    │
│  external_links   │    │
│───────────────────│    │
│ id (PK)           │    │
│ person_id (FK) ───┘    │
│ type              │    │
│ url               │    │
│ label             │    │
└───────────────────┘    │
                         │
┌────────────────────┐   │
│   associations     │   │
│────────────────────│   │
│ id (PK)            │   │
│ person_id (FK) ────┼───┘
│ name               │
│ role               │
│ start_year         │
│ end_year           │
└────────────────────┘

┌─────────────────────┐
│   relationships     │
│─────────────────────│
│ id (PK)             │
│ source_id (FK) ─────┼──► people(id)
│ target_id (FK) ─────┼──► people(id)
│ type (FK) ──────────┼──► relationship_types(type)
│ year                │
│ notes               │
└─────────────────────┘

┌──────────────────────┐
│ relationship_types   │
│──────────────────────│
│ type (PK)            │
│ display_name         │
│ description          │
│ color                │
│ priority             │
└──────────────────────┘
```

---

**Fin du document de référence** 🚀
