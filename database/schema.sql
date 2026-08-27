-- Sky Database Schema v4.0
-- Rebuilt model: placeholder records (id prenom.nom[.promo][.idx]) + Authentik
-- accounts (auth_sub). A person can exist without an account. Parrainage/adoption
-- relations with constraints enforced server-side.

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================
-- PEOPLE TABLE
-- Stores individual information
-- ============================================
CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    
    -- Personal Information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    
    -- Academic Information
    level INTEGER,  -- Promotion: the year of ENTRY, as the SSO 'promo' claim gives it
    
    -- Auth / SSO identity (Authentik). NULL for graph records that never signed
    -- in. auth_sub = the Authentik `sub` claim, also the key for the MiGallery
    -- photo (/api/avatar/{auth_sub}).
    auth_sub TEXT,           -- Authentik sub (unique when not NULL)
    email TEXT,
    formation TEXT,          -- 'ICM', 'ISMIN'... (ICM gating)
    role TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
    last_login INTEGER,      -- epoch of the last SSO login
    created_by TEXT,         -- id of the person who created this placeholder record

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(id)
);

-- Index for faster searches by name and level
CREATE INDEX IF NOT EXISTS idx_people_level ON people(level);
CREATE INDEX IF NOT EXISTS idx_people_last_name ON people(last_name);
CREATE INDEX IF NOT EXISTS idx_people_first_name ON people(first_name);
-- One Authentik account per record (NULLs are not constrained by UNIQUE).
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_auth_sub ON people(auth_sub) WHERE auth_sub IS NOT NULL;

-- No full-text search table here on purpose. `people_fts` (FTS5) and its three
-- sync triggers lived here until 2026-08-26, maintained on every insert, update
-- and delete on `people` - and read by NOTHING. The user-facing search moved to
-- the `personMatchScore` scorer (src/lib/utils/format.ts) precisely because the
-- FTS MATCH returned nothing whenever the index had drifted; the reader was
-- deleted then, the write path and two repair scripts were not. Write
-- amplification and a repair job for an index no query touches is all that
-- remained. See docs/wiki/matching-and-search.md.

-- ============================================
-- RELATIONSHIPS TABLE
-- Stores relationships between people
-- ============================================
CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Relationship participants (directed graph)
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    
    -- Relationship type: 'parrainage' (official) or 'adoption'
    type TEXT NOT NULL DEFAULT 'parrainage',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    FOREIGN KEY (source_id) REFERENCES people(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES people(id) ON DELETE CASCADE,
    
    -- Prevent duplicate relationships
    UNIQUE(source_id, target_id, type)
);

-- Indexes for efficient graph traversal
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);

-- ============================================
-- ASSOCIATIONS TABLE
-- Stores association memberships
-- ============================================
CREATE TABLE IF NOT EXISTS associations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT NOT NULL,
    
    -- Association information
    name TEXT NOT NULL,
    role TEXT,
    logo_url TEXT,
    
    -- Display order
    display_order INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_associations_person ON associations(person_id);

-- ============================================
-- SESSIONS TABLE
-- SSO sessions (opaque token -> people record). Replaces the former auth.db.
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_person ON sessions(person_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================
-- PENDING_LINKS TABLE
-- SSO identities awaiting a link choice (ambiguous login -> /auth/link screen).
-- ============================================
CREATE TABLE IF NOT EXISTS pending_links (
    token TEXT PRIMARY KEY,
    sub TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    level INTEGER,
    email TEXT,
    formation TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    expires_at INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_links_expires ON pending_links(expires_at);

-- ============================================
-- METADATA TABLE
-- Stores schema version and other metadata
-- ============================================
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '4.0');
INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_migration', datetime('now'));