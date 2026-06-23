export interface Person {
  id: string;
  level: number | null;
  bio?: string;
  image?: string;
  links?: Record<string, string>;
  prenom: string;
  nom: string;
}

export interface Relation {
  id1: string;
  id2: string;
  type: string;
}

export interface JsonRelation {
  source: string;
  target: string;
  type: string;
}

/** Sens d un lien d entourage du point de vue de l utilisateur. */
export type RelationRole = "parrain" | "fillot";

/** Type de lien de parrainage (miroir client du type serveur). */
export type RelationKind = "parrainage" | "adoption";

/** Un membre d entourage tel que renvoye par /api/entourage. */
export interface EntourageMember {
  relId: number;
  kind: RelationKind;
  id: string;
  prenom: string;
  nom: string;
  level: number | null;
}

/** Reponse de /api/entourage : personne ciblee + parrains/fillots + maxima. */
export interface EntourageResponse {
  person: { id: string; prenom: string; nom: string; level: number | null };
  parrains: EntourageMember[];
  fillots: EntourageMember[];
  maxParrains: Record<RelationKind, number>;
  maxFillots: Record<RelationKind, number>;
}

export interface Position {
  x: number;
  y: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
}

export interface GraphDataFile {
  people: Record<string, Person>;
  relationships: JsonRelation[];
}
