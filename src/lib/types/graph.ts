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

/** Direction of an entourage link from the user's point of view. */
export type RelationRole = "parrain" | "fillot";

/** Sponsorship link type (client mirror of the server type). */
export type RelationKind = "parrainage" | "adoption";

/** An entourage member as returned by /api/entourage. */
export interface EntourageMember {
  relId: number;
  kind: RelationKind;
  id: string;
  prenom: string;
  nom: string;
  level: number | null;
  /** True when linked to a real account; false = editable placeholder. */
  linked: boolean;
}

/** A member's current club (public Canari projection). */
export interface CanariAssociation {
  name: string;
  slug: string;
  role: string;
  logoUrl: string | null;
  /** Absolute logo URL, resolved on the Sky server (else null). */
  logo?: string | null;
}

/** Former club or honorary role (Canari CV). */
export interface CanariFormerAssociation {
  name: string;
  role: string;
  logoUrl: string | null;
  /** Absolute logo URL, resolved on the Sky server (else null). */
  logo?: string | null;
  startYear: number | null;
  endYear: number | null;
}

/** Aggregated public Canari profile (bio + clubs), keyed by Authentik sub. */
export interface CanariProfile {
  sub: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  promo: number | null;
  formation: string | null;
  bio: string | null;
  associations: CanariAssociation[];
  formerAssociations: CanariFormerAssociation[];
}

/** Response of /api/canari/[id]: link state + optional Canari profile. */
export interface CanariProfileResponse {
  linked: boolean;
  profile?: CanariProfile | null;
  error?: string;
}

/** Response of /api/entourage: centered person + parrains/fillots + maxima. */
export interface EntourageResponse {
  person: { id: string; prenom: string; nom: string; level: number | null };
  parrains: EntourageMember[];
  fillots: EntourageMember[];
  maxParrains: Record<RelationKind, number>;
  maxFillots: Record<RelationKind, number>;
  /** Whether the requesting user may edit this tree (admin or same family). */
  canEdit: boolean;
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
