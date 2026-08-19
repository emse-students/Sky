# 📚 Sky Database — Complete Schema Reference

> **Version:** 3.0 (Full cleanup — removal of unused fields)  
> **Last updated:** February 1, 2026  
> **Type:** SQLite3 with FTS5 (Full-Text Search)

---

## 🎯 Overview

The Sky database stores information about ICM (Institut Camille Jordan) members
and their godparent/adoption relationships. It is structured as a **directed
graph** where:

- **Nodes** = people (`people`)
- **Edges** = relationships (`relationships`)

---

## 📋 Main Tables

### 1. `people` — Individual Profiles

Stores all information about each person.

| Column       | Type      | Nullable | Description                          |
| ------------ | --------- | -------- | ------------------------------------ |
| `id`         | TEXT      | ❌       | Unique identifier (ex: `first.last`) |
| `first_name` | TEXT      | ❌       | First name                           |
| `last_name`  | TEXT      | ❌       | Last name                            |
| `level`      | INTEGER   | ✅       | Promotion year (ex: 2024)            |
| `image_url`  | TEXT      | ✅       | Avatar URL (MiGallery or local)      |
| `created_at` | TIMESTAMP | ✅       | Creation date                        |
| `updated_at` | TIMESTAMP | ✅       | Last modification date               |

**Primary key:** `id`

**Indexes:**

- `idx_people_level` on `level`
- `idx_people_last_name` on `last_name`
- `idx_people_first_name` on `first_name`

---

### 2. `relationships` — Genealogical Relationships

Represents godparent/adoption links between two people.  
**Directed structure:** `source_id` → `target_id`

| Column      | Type    | Nullable | Description                           |
| ----------- | ------- | -------- | ------------------------------------- |
| `id`        | INTEGER | ❌       | Auto-incremented ID                   |
| `source_id` | TEXT    | ❌       | Godparent ID (source node)            |
| `target_id` | TEXT    | ❌       | Godchild ID (target node)             |
| `type`      | TEXT    | ❌       | Relationship type (see below)         |
| `year`      | INTEGER | ✅       | Year the relationship was established |

**Primary key:** `id`

**Constraints:**

- `UNIQUE(source_id, target_id, type)` — Prevents duplicates
- `FOREIGN KEY source_id → people(id) ON DELETE CASCADE`
- `FOREIGN KEY target_id → people(id) ON DELETE CASCADE`

**Indexes:**

- `idx_relationships_source` on `source_id`
- `idx_relationships_target` on `target_id`
- `idx_relationships_type` on `type`

#### 📌 Relationship Types (`type`)

| Value        | Meaning            | Status    | Color     |
| ------------ | ------------------ | --------- | --------- |
| `parrainage` | Official godparent | ✅ Active | `#3b82f6` |
| `adoption`   | Adoption           | ✅ Active | `#8b5cf6` |

```
Godparent (source_id) ──[type]──> Godchild (target_id)
```

**Example:**

```sql
-- Lucas is Jolan's official godparent
INSERT INTO relationships (source_id, target_id, type)
VALUES ('lucas.hausner', 'jolan.boudin', 'parrainage');
```

To retrieve:

- **Jolan's godparents:** `WHERE target_id = 'jolan.boudin'`
- **Lucas's godchildren:** `WHERE source_id = 'lucas.hausner'`

---

### 3. `external_links` — External Links

Stores social media and other external links associated with a person.

| Column          | Type      | Nullable | Description                |
| --------------- | --------- | -------- | -------------------------- |
| `id`            | INTEGER   | ❌       | Auto-incremented ID        |
| `person_id`     | TEXT      | ❌       | Reference to `people(id)`  |
| `type`          | TEXT      | ❌       | Link type (see below)      |
| `url`           | TEXT      | ❌       | Link URL                   |
| `label`         | TEXT      | ✅       | Custom label (optional)    |
| `display_order` | INTEGER   | ✅       | Display order (default: 0) |
| `created_at`    | TIMESTAMP | ✅       | Creation date              |

**Primary key:** `id`

**Constraints:**

- `FOREIGN KEY person_id → people(id) ON DELETE CASCADE`

**Indexes:**

- `idx_external_links_person` on `person_id`

#### 📌 Link Types (`type`)

| Value       | Description       |
| ----------- | ----------------- |
| `LinkedIn`  | LinkedIn profile  |
| `Email`     | Email address     |
| `GitHub`    | GitHub profile    |
| `Instagram` | Instagram profile |
| `Phone`     | Phone number      |
| `Website`   | Personal website  |

---

## 🔍 Full-Text Search (FTS5)

### `people_fts` Table

Virtual table for fast name search.

**Indexed columns:**

- `first_name`
- `last_name`

**Non-indexed field:**

- `id` (UNINDEXED, for reference only)

**Automatic synchronization:**
The `people_fts` table is kept up to date automatically via triggers:

- `people_fts_insert` — New person added
- `people_fts_update` — Name modified
- `people_fts_delete` — Person deleted

**Search example:**

```sql
-- Search for "jolan"
SELECT p.*
FROM people p
JOIN people_fts fts ON p.rowid = fts.rowid
WHERE people_fts MATCH 'jolan*'
ORDER BY rank;
```

---

## 📊 SQL Views

### `v_people_complete`

Enriched view with all information related to a person.

**Additional columns:**

- `links` (JSON) — Array of external links
- `associations` (JSON) — Array of associations
- `relationship_count` (INTEGER) — Total number of relationships

### `v_relationships_detailed`

Enriched view of relationships with full names.

**Columns:**

- All columns from `relationships`
- `source_name` — Godparent name
- `target_name` — Godchild name
- `type_display` — Display name of the type
- `type_color` — Color of the type

---

## 🗂️ CASCADE Rules

All secondary tables use `ON DELETE CASCADE`:

| Table            | Action                               |
| ---------------- | ------------------------------------ |
| `relationships`  | Auto-delete when a person is deleted |
| `external_links` | Auto-delete when a person is deleted |

**Example:**

```sql
-- Deleting a person automatically deletes:
-- - All their relationships (as source OR target)
-- - All their external links
DELETE FROM people WHERE id = 'john.doe';
```

---

## 🔄 Migration History

### Migration 2.0 → 3.0 (February 1, 2026)

**Changes applied:**

1. ✅ **Relationship type renaming**
   - `family1` → `parrainage` (1495 relationships updated)
   - `family2` → `adoption` (13 relationships updated)

2. ✅ **Removal of unused columns**
   - `relationships.year` (0% used)
   - `relationships.notes` (0% used)
   - `people.bio` (0% used)
   - `external_links.label` (0% used)

3. ✅ **Removal of obsolete tables**
   - Table `associations` (empty)
   - Table `relationship_types` (replaced by direct values)

4. ✅ **Migration scripts used:**
   - `scripts/cleanup_db.py` — Full database cleanup

### Migration 1.0 → 2.0 (February 1, 2026)

**Changes applied:**

1. ✅ **Removal of `nickname`**
   - Column removed from `people`
   - FTS triggers rebuilt without `nickname`
   - TypeScript backend updated

2. ✅ **Initial type conversion**
   - `parrainage` → `family1`

3. ✅ **Migration scripts used:**
   - `scripts/remove_nickname_db.py`
   - `scripts/fix_db.py`

---

## 🛠️ Administration Tools

Administration is done via the **`/admin` web interface** (Svelte 5, reserved
for admins):

- ✅ Profile search and visualization
- ✅ Full CRUD editing of people
- ✅ Social link management
- ✅ Relationship management (Godparent/Adoption × Godparents/Godchildren)
- ✅ Profile merging, with "one star = one person" lock
- ✅ Automatic CASCADE deletion
- ✅ Manual graph position recalculation

---

## 📝 Best Practices

### ✅ DO

1. **Always use `parrainage` and `adoption`** for new relationships
2. **Verify ID existence** before inserting relationships
3. **Use transactions** for multi-step operations
4. **Respect direction**: Godparent (source) → Godchild (target)

### ❌ DON'T

1. **Never** reference `nickname`, `bio`, `year`, `notes`, `label` (no longer exist)
2. **Do not** create direct circular relationships (even if technically possible)
3. **Do not** insert duplicates (UNIQUE constraint)
4. **Do not** use the old types `family1`/`family2` (obsolete)

---

## 🔧 Useful Queries

### Find all godparents of a person

```sql
SELECT p.first_name, p.last_name, r.type
FROM relationships r
JOIN people p ON r.source_id = p.id
WHERE r.target_id = 'jolan.boudin'
AND r.type IN ('parrainage', 'adoption');
```

### Find all godchildren of a person

```sql
SELECT p.first_name, p.last_name, r.type
FROM relationships r
JOIN people p ON r.target_id = p.id
WHERE r.source_id = 'lucas.hausner'
AND r.type IN ('parrainage', 'adoption');
```

### Statistics by promotion

```sql
SELECT
    level,
    COUNT(*) as nb_people,
    COUNT(DISTINCT CASE WHEN image_url IS NOT NULL THEN id END) as nb_with_photo
FROM people
GROUP BY level
ORDER BY level DESC;
```

### Detect orphan relationships

```sql
SELECT r.*
FROM relationships r
LEFT JOIN people p1 ON r.source_id = p1.id
LEFT JOIN people p2 ON r.target_id = p2.id
WHERE p1.id IS NULL OR p2.id IS NULL;
```

---

## 📦 Related Files

| File                          | Description                             |
| ----------------------------- | --------------------------------------- |
| `database/schema.sql`         | Reference SQL definition                |
| `database/sky.db`             | Active SQLite3 database                 |
| `database/sky.db.backup`      | Safety backup                           |
| `src/lib/server/database.ts`  | TypeScript data access layer (Backend)  |
| `src/lib/types/graph.ts`      | TypeScript type definitions             |
| `src/routes/admin/`           | Web administration interface (Svelte 5) |
| `src/lib/server/positions.ts` | Position computation for visualization  |

---

## 🎨 Entity-Relationship Diagram (ERD)

```
┌─────────────────┐
│     people      │
│─────────────────│
│ id (PK)         │◄─────┐
│ first_name      │      │
│ last_name       │      │
│ level           │      │
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
│ display_order     │    │
└───────────────────┘    │
                          │
┌────────────────────┐   │
│   relationships    │   │
│────────────────────│   │
│ id (PK)            │   │
│ source_id (FK) ────┼──► people(id)
│ target_id (FK) ────┼──► people(id)
│ type               │   │
│ year               │   │
└────────────────────┘   │
```

---

**End of reference document** 🚀
