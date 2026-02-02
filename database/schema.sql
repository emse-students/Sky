-- Sky Database Schema v3.0
-- Cleaned schema for storing ICM family tree data
-- Migration date: 1er février 2026

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
    level INTEGER,  -- Year of graduation (promotion)
    
    -- Profile
    image_url TEXT,  -- Can be from MiGallery API or local
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Full-text search optimization
    UNIQUE(id)
);

-- Index for faster searches by name and level
CREATE INDEX IF NOT EXISTS idx_people_level ON people(level);
CREATE INDEX IF NOT EXISTS idx_people_last_name ON people(last_name);
CREATE INDEX IF NOT EXISTS idx_people_first_name ON people(first_name);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS people_fts USING fts5(
    id UNINDEXED,
    first_name,
    last_name,
    content=people,
    content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS people_fts_insert AFTER INSERT ON people BEGIN
    INSERT INTO people_fts(rowid, id, first_name, last_name)
    VALUES (NEW.rowid, NEW.id, NEW.first_name, NEW.last_name);
END;

CREATE TRIGGER IF NOT EXISTS people_fts_delete AFTER DELETE ON people BEGIN
    DELETE FROM people_fts WHERE rowid = OLD.rowid;
END;

CREATE TRIGGER IF NOT EXISTS people_fts_update AFTER UPDATE ON people BEGIN
    UPDATE people_fts SET 
        first_name = NEW.first_name,
        last_name = NEW.last_name
    WHERE rowid = NEW.rowid;
END;

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
-- EXTERNAL_LINKS TABLE
-- Stores external links for people (LinkedIn, alumni site, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS external_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id TEXT NOT NULL,
    
    -- Link information
    type TEXT NOT NULL,  -- 'linkedin', 'alumni', 'github', 'personal', etc.
    url TEXT NOT NULL,
    label TEXT,  -- Optional custom label
    
    -- Display order
    display_order INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
    UNIQUE(person_id, url)
);

CREATE INDEX IF NOT EXISTS idx_external_links_person ON external_links(person_id);

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
-- METADATA TABLE
-- Stores schema version and other metadata
-- ============================================
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '3.0');
INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_migration', datetime('now'));