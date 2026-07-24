# Sky Database

SQLite database for the EMSE student genealogy system.

## 📁 Files

- **`sky.db`** - Main SQLite database
- **`sky.db.backup`** - Safety backup
- **`schema.sql`** - Reference schema (v3.0)
- **`SCHEMA_REFERENCE.md`** - Complete schema documentation

## 🚀 Usage

### Administration

Administration is done via the **`/admin`** web interface (Svelte 5, reserved
for admins): profile search/editing, relationship management
(Godparent/Adoption) and links, profile merging, CASCADE deletion.

### Position Recalculation

Graph positions are computed **TypeScript in-process**
(`src/lib/server/positions.ts`, ForceAtlas2 via graphology) and written to
`database/positions.json`. Recalculation is automatic on every graph
modification (link or record creation/deletion, import); a **"Recalculate"**
button in `/admin` also allows manual re-triggering.

## 📊 Structure

### Main Tables

1. **`people`** - Individual profiles (5100+ entries)
2. **`relationships`** - Godparent/adoption relationships (1500+ relationships)
3. **`external_links`** - Social links (LinkedIn, GitHub, etc.)

### Relationship Types

- **`parrainage`** - Official godparent relationship (1495 relationships)
- **`adoption`** - Adoption relationship (13 relationships)

## 🔧 Migrations

See `SCHEMA_REFERENCE.md` for the full migration history.

**Latest migration:** v3.0 (February 1, 2026)

- Renamed `family1` → `parrainage`, `family2` → `adoption`
- Removed unused columns (`bio`, `year`, `notes`, `label`)
- Removed obsolete tables (`associations`, `relationship_types`)

## 📖 Documentation

See [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md) for:

- Detailed description of all tables
- Complete usage guide
- Useful SQL queries
- Best practices
