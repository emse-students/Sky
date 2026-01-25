export interface Person {
id?: string;
name: string;
level: number | null;
image?: string;
bio?: string;
links?: Record<string, string>;
associations?: Association[];
}

export interface Association {
name: string;
role: string;
}

export interface Relation {
id1: string;
id2: string;
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
