import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '../database/sky.db')

print("=" * 60)
print("NETTOYAGE DE LA BASE DE DONNEES")
print("=" * 60)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

try:
    # 1. Renommer les types de relation (family1 -> parrainage, family2 -> adoption)
    print("\n[1/7] Renommage des types de relation...")
    cursor.execute("UPDATE relationships SET type = 'parrainage' WHERE type = 'family1'")
    print(f"   - family1 -> parrainage : {cursor.rowcount} mises a jour")
    
    cursor.execute("UPDATE relationships SET type = 'adoption' WHERE type = 'family2'")
    print(f"   - family2 -> adoption : {cursor.rowcount} mises a jour")
    
    # 2. Supprimer la table relationship_types (legacy)
    print("\n[2/7] Suppression de la table relationship_types...")
    cursor.execute("DROP TABLE IF EXISTS relationship_types")
    print("   - OK")
    
    # 3. Supprimer la table associations (vide)
    print("\n[3/7] Suppression de la table associations...")
    cursor.execute("DROP TABLE IF EXISTS associations")
    print("   - OK")
    
    # 4. Recréer la table relationships sans year et notes
    print("\n[4/7] Recreation de la table relationships...")
    
    # Backup des données
    cursor.execute("""
        CREATE TABLE relationships_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'parrainage',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (source_id) REFERENCES people(id) ON DELETE CASCADE,
            FOREIGN KEY (target_id) REFERENCES people(id) ON DELETE CASCADE,
            UNIQUE(source_id, target_id, type)
        )
    """)
    
    cursor.execute("""
        INSERT INTO relationships_new (id, source_id, target_id, type, created_at)
        SELECT id, source_id, target_id, type, created_at
        FROM relationships
    """)
    
    cursor.execute("DROP TABLE relationships")
    cursor.execute("ALTER TABLE relationships_new RENAME TO relationships")
    
    # Recréer les index
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type)")
    
    print("   - OK")
    
    # 5. Recréer la table people sans bio
    print("\n[5/7] Recreation de la table people...")
    
    cursor.execute("""
        CREATE TABLE people_new (
            id TEXT PRIMARY KEY,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            level INTEGER,
            image_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(id)
        )
    """)
    
    cursor.execute("""
        INSERT INTO people_new (id, first_name, last_name, level, image_url, created_at, updated_at)
        SELECT id, first_name, last_name, level, image_url, created_at, updated_at
        FROM people
    """)
    
    cursor.execute("DROP TABLE people")
    cursor.execute("ALTER TABLE people_new RENAME TO people")
    
    # Recréer les index
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_people_level ON people(level)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_people_last_name ON people(last_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_people_first_name ON people(first_name)")
    
    print("   - OK")
    
    # 6. Recréer external_links sans label
    print("\n[6/7] Recreation de la table external_links...")
    
    cursor.execute("""
        CREATE TABLE external_links_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id TEXT NOT NULL,
            type TEXT NOT NULL,
            url TEXT NOT NULL,
            display_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
            UNIQUE(person_id, url)
        )
    """)
    
    cursor.execute("""
        INSERT INTO external_links_new (id, person_id, type, url, display_order, created_at)
        SELECT id, person_id, type, url, display_order, created_at
        FROM external_links
    """)
    
    cursor.execute("DROP TABLE external_links")
    cursor.execute("ALTER TABLE external_links_new RENAME TO external_links")
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_external_links_person ON external_links(person_id)")
    
    print("   - OK")
    
    # 7. Recréer la table FTS sans bio
    print("\n[7/7] Recreation de la table FTS...")
    
    cursor.execute("DROP TABLE IF EXISTS people_fts")
    
    cursor.execute("""
        CREATE VIRTUAL TABLE people_fts USING fts5(
            id UNINDEXED,
            first_name,
            last_name,
            content=people,
            content_rowid=rowid
        )
    """)
    
    # Repopuler FTS
    cursor.execute("""
        INSERT INTO people_fts(rowid, id, first_name, last_name)
        SELECT rowid, id, first_name, last_name FROM people
    """)
    
    # Recréer les triggers
    cursor.execute("DROP TRIGGER IF EXISTS people_fts_insert")
    cursor.execute("DROP TRIGGER IF EXISTS people_fts_delete")
    cursor.execute("DROP TRIGGER IF EXISTS people_fts_update")
    
    cursor.execute("""
        CREATE TRIGGER people_fts_insert AFTER INSERT ON people BEGIN
            INSERT INTO people_fts(rowid, id, first_name, last_name)
            VALUES (NEW.rowid, NEW.id, NEW.first_name, NEW.last_name);
        END
    """)
    
    cursor.execute("""
        CREATE TRIGGER people_fts_delete AFTER DELETE ON people BEGIN
            DELETE FROM people_fts WHERE rowid = OLD.rowid;
        END
    """)
    
    cursor.execute("""
        CREATE TRIGGER people_fts_update AFTER UPDATE ON people BEGIN
            UPDATE people_fts SET 
                first_name = NEW.first_name,
                last_name = NEW.last_name
            WHERE rowid = NEW.rowid;
        END
    """)
    
    print("   - OK")
    
    # Supprimer les vues obsolètes
    print("\n[NETTOYAGE] Suppression des vues obsoletes...")
    cursor.execute("DROP VIEW IF EXISTS v_people_complete")
    cursor.execute("DROP VIEW IF EXISTS v_relationships_detailed")
    print("   - OK")
    
    conn.commit()
    
    print("\n" + "=" * 60)
    print("NETTOYAGE TERMINE AVEC SUCCES!")
    print("=" * 60)
    print("\nChangements appliques:")
    print("  - Renommage: family1 -> parrainage, family2 -> adoption")
    print("  - Suppression: relationships.year, relationships.notes")
    print("  - Suppression: people.bio")
    print("  - Suppression: external_links.label")
    print("  - Suppression: table associations (vide)")
    print("  - Suppression: table relationship_types (obsolete)")
    print("=" * 60)

except Exception as e:
    conn.rollback()
    print(f"\nERREUR: {e}")
    print("La base de donnees n'a PAS ete modifiee.")
    raise
finally:
    conn.close()
