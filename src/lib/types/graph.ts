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
  /** True when linked to a real account; false = editable placeholder. */
  linked: boolean;
}

/** Association actuelle d un membre (projection publique Canari). */
export interface CanariAssociation {
  name: string;
  slug: string;
  role: string;
  logoUrl: string | null;
  /** URL absolue du logo, resolue cote serveur Sky (sinon null). */
  logo?: string | null;
}

/** Association passee ou role honorifique (CV Canari). */
export interface CanariFormerAssociation {
  name: string;
  role: string;
  logoUrl: string | null;
  /** URL absolue du logo, resolue cote serveur Sky (sinon null). */
  logo?: string | null;
  startYear: number | null;
  endYear: number | null;
}

/** Profil public Canari agrege (bio + associations), keye par sub Authentik. */
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

/** Reponse de /api/canari/[id] : etat de liaison + profil Canari eventuel. */
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
