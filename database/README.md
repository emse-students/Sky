# Sky Database Schema v2.0

## Overview

Le projet Sky utilise maintenant une base de données SQLite optimisée avec synchronisation automatique vers `data.json` pour maintenir la compatibilité avec `calcul_positions.py`.

## Architecture

### SQLite Database (`database/sky.db`)

- **Source de vérité principale** pour les données
- Schéma normalisé et optimisé
- Support de la recherche full-text
- Relations avec contraintes d'intégrité

### JSON File (`static/data/data.json`)

- **Format de compatibilité** pour `calcul_positions.py`
- Synchronisé automatiquement depuis la base de données
- Format plat optimisé pour NetworkX

## Tables

### `people`

Stocke les informations individuelles.

| Colonne    | Type      | Description                      |
| ---------- | --------- | -------------------------------- |
| id         | TEXT      | Identifiant unique (PRIMARY KEY) |
| name       | TEXT      | Nom complet                      |
| first_name | TEXT      | Prénom                           |
| last_name  | TEXT      | Nom de famille                   |
| nickname   | TEXT      | Surnom                           |
| level      | INTEGER   | Année de promotion               |
| bio        | TEXT      | Biographie                       |
| image_url  | TEXT      | URL de l'image de profil         |
| created_at | TIMESTAMP | Date de création                 |
| updated_at | TIMESTAMP | Date de mise à jour              |

### `relationships`

Stocke les relations entre personnes (graphe dirigé).

| Colonne    | Type      | Description                            |
| ---------- | --------- | -------------------------------------- |
| id         | INTEGER   | ID auto-incrémenté (PRIMARY KEY)       |
| source_id  | TEXT      | ID de la personne source (FOREIGN KEY) |
| target_id  | TEXT      | ID de la personne cible (FOREIGN KEY)  |
| type       | TEXT      | Type de relation (FOREIGN KEY)         |
| year       | INTEGER   | Année d'établissement                  |
| notes      | TEXT      | Notes supplémentaires                  |
| created_at | TIMESTAMP | Date de création                       |

**Types de relations:**

- `parrainage` (alias: `family1`) - Relation de parrainage ICM
- `adoption` (alias: `family2`) - Relation d'adoption ICM

### `external_links`

Stocke les liens externes (LinkedIn, alumni, etc.).

| Colonne       | Type    | Description                                   |
| ------------- | ------- | --------------------------------------------- |
| id            | INTEGER | ID auto-incrémenté (PRIMARY KEY)              |
| person_id     | TEXT    | ID de la personne (FOREIGN KEY)               |
| type          | TEXT    | Type de lien (linkedin, alumni, github, etc.) |
| url           | TEXT    | URL du lien                                   |
| label         | TEXT    | Label personnalisé (optionnel)                |
| display_order | INTEGER | Ordre d'affichage                             |

### `associations`

Stocke les adhésions aux associations.

| Colonne    | Type    | Description                      |
| ---------- | ------- | -------------------------------- |
| id         | INTEGER | ID auto-incrémenté (PRIMARY KEY) |
| person_id  | TEXT    | ID de la personne (FOREIGN KEY)  |
| name       | TEXT    | Nom de l'association             |
| role       | TEXT    | Rôle dans l'association          |
| start_year | INTEGER | Année de début                   |
| end_year   | INTEGER | Année de fin                     |

## Utilisation

### Migration initiale

```bash
# Migrer data.json vers SQLite
bun run db:migrate
```

Cette commande :

1. Crée la base de données SQLite avec le schéma
2. Importe toutes les données depuis `data.json`
3. Exporte les données vers `data.json` pour vérification
4. Maintient la compatibilité avec `calcul_positions.py`

### Synchronisation

Après toute modification de la base de données :

```bash
# Synchroniser DB → JSON
bun run db:sync
```

### Calcul des positions

```bash
# Fonctionne toujours avec data.json
bun run calcul
```

## API TypeScript

### Lire les données

```typescript
import {
  getAllPeople,
  getPersonById,
  getAllRelationships,
} from "$lib/server/database";

// Récupérer toutes les personnes
const people = getAllPeople();

// Récupérer une personne spécifique
const person = getPersonById("doe_john");

// Récupérer toutes les relations
const relationships = getAllRelationships();

// Exporter au format GraphDataFile
import { exportGraphData } from "$lib/server/database";
const graphData = exportGraphData();
```

### Créer/Modifier des données

```typescript
import {
  createPerson,
  updatePerson,
  createRelationship,
} from "$lib/server/database";

// Créer une personne
const newId = createPerson({
  name: "DOE John",
  prenom: "John",
  nom: "DOE",
  level: 2025,
  bio: "Élève-ingénieur ICM",
  links: {
    linkedin: "https://linkedin.com/in/johndoe",
    alumni: "https://alumni.emse.fr/john.doe",
  },
  associations: [{ name: "ICM", role: "Membre" }],
});

// Mettre à jour une personne
updatePerson("doe_john", {
  bio: "Nouvelle biographie",
  level: 2026,
});

// Créer une relation
createRelationship({
  source: "parrain_id",
  target: "filleul_id",
  type: "parrainage",
});
```

### Recherche

```typescript
import { searchPeople } from "$lib/server/database";

// Recherche full-text
const results = searchPeople("John");
```

## Avantages du nouveau schéma

### Performance

- ✅ Indexes sur les colonnes fréquemment utilisées
- ✅ Recherche full-text (FTS5) ultra-rapide
- ✅ Vues pré-calculées pour les jointures courantes

### Intégrité

- ✅ Contraintes de clés étrangères
- ✅ Contraintes d'unicité
- ✅ Cascade delete automatique

### Extensibilité

- ✅ Schéma normalisé facile à étendre
- ✅ Metadata table pour le versioning
- ✅ Support de nouveaux types de relations

### Compatibilité

- ✅ Synchronisation automatique vers JSON
- ✅ `calcul_positions.py` continue de fonctionner
- ✅ Transition transparente

## Migration de l'ancien système

L'ancien format `data.json` reste compatible :

```json
{
  "people": {
    "person_id": {
      "id": "person_id",
      "name": "NAME Firstname",
      "level": 2025,
      "image": "default.jpg"
    }
  },
  "relationships": [
    {
      "source": "person1_id",
      "target": "person2_id",
      "type": "family1"
    }
  ]
}
```

Les types `family1` et `family2` sont automatiquement mappés vers `parrainage` et `adoption`.

## Maintenance

### Backup

```bash
# Backup de la base de données
cp database/sky.db database/sky.backup.db

# Backup du JSON
cp static/data/data.json static/data/data.backup.json
```

### Reconstruction

Si nécessaire, reconstruire la DB depuis JSON :

```bash
bun run db:migrate
```

## Intégration MiGallery

Pour récupérer les photos depuis MiGallery :

```typescript
// À implémenter dans un script séparé
async function syncProfilePicturesFromMiGallery() {
  const people = getAllPeople();

  for (const person of people) {
    try {
      const imageUrl = await fetchFromMiGallery(person.id);
      if (imageUrl) {
        updatePerson(person.id, { image: imageUrl });
      }
    } catch (error) {
      console.error(`Failed to fetch image for ${person.id}`);
    }
  }

  await syncToJson();
}
```
