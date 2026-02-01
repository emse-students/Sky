export interface Person {
  id: string;
  level: number | null;
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
