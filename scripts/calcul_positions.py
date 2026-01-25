import numpy as np
import json
import math
import networkx as nx

# Charger data.json au lieu de SQL
DATA_FILE = "data.json"
POSITIONS_FILE = "positions.json"
def plot_circle_packing(comp_pos, comp_radii, comp_sizes, big_radius):
    pass
    # # Calcul automatique du grand cercle si nécessaire
    # if big_radius <= 0:
    #     max_dist = 0.0
    #     for i, (x, y) in comp_pos.items():
    #         r = comp_radii[i]
    #         dist = np.linalg.norm([x, y]) + r
    #         max_dist = max(max_dist, dist)
    #     big_radius = max_dist

    # fig, ax = plt.subplots(figsize=(8, 8))

    # for i, (x, y) in comp_pos.items():
    #     r = comp_radii[i]
    #     size = comp_sizes[i]

    #     circ = plt.Circle(
    #         (x, y),
    #         r,
    #         alpha=0.5,
    #         edgecolor='black'
    #     )
    #     ax.add_patch(circ)

    #     ax.text(
    #         x,
    #         y,
    #         str(size),
    #         ha='center',
    #         va='center',
    #         fontsize=8,
    #         fontweight='bold'
    #     )

    # outer = plt.Circle(
    #     (0, 0),
    #     big_radius,
    #     fill=False,
    #     edgecolor='red',
    #     linewidth=2
    # )
    # ax.add_patch(outer)

    # # Mise à l'échelle
    # ax.set_aspect('equal', 'box')
    # margin = big_radius * 0.1
    # ax.set_xlim(-big_radius - margin, big_radius + margin)
    # ax.set_ylim(-big_radius - margin, big_radius + margin)

    # ax.axis("off")
    # plt.title("Circle Packing — Sous-graphes")
    # plt.show()

def circles_pack_in_circle(comp_radii,comp_pts):
    n = len(comp_radii)
    indices = list(range(n))
    indices.sort(key=lambda i: comp_radii[i], reverse=True)

    pos = {}
    # placer le plus grand au centre
    pos[indices[0]] = np.array([0.0, 0.0])

    def no_overlap(i, p_i):
        for j, p_j in pos.items():
            if i == j:
                continue
            d = np.linalg.norm(p_i - p_j)
            if d < comp_radii[i] + comp_radii[j]:
                return False
        return True

    for k in range(1, n):
        i = indices[k]
        r_i = comp_radii[i]

        best_pos = None
        best_dist = float("inf")

        for j in pos.keys():
            r_j = comp_radii[j]
            xj, yj = pos[j]
            R = r_i + r_j

            for theta in np.linspace(0, 2*np.pi, 80):
                px = xj + R * np.cos(theta)
                py = yj + R * np.sin(theta)
                p = np.array([px, py])

                if no_overlap(i, p):
                    dist = np.linalg.norm(p)
                    if dist < best_dist:
                        best_dist = dist
                        best_pos = p
        pos[i] = best_pos
    plot_circle_packing(comp_pos=pos,comp_radii=comp_radii,comp_sizes=comp_pts,big_radius=0)
    # recentre le packing
    x_mins = []
    x_maxs = []
    y_mins = []
    y_maxs = []

    for i, center in pos.items():
        r = comp_radii[i]
        x, y = center
        x_mins.append(x - r)
        x_maxs.append(x + r)
        y_mins.append(y - r)
        y_maxs.append(y + r)

    x_min, x_max = min(x_mins), max(x_maxs)
    y_min, y_max = min(y_mins), max(y_maxs)

    width = x_max - x_min
    height = y_max - y_min

    # diamètre du grand cercle = le côté le plus grand de la bounding box
    diameter = max(width, height)
    outer_radius = diameter / 2

    # centre du grand cercle
    center_x = (x_min + x_max) / 2
    center_y = (y_min + y_max) / 2
    center = np.array([center_x, center_y])

    # décaler tous les cercles pour que le grand cercle soit centré en (0,0)
    new_pos = {}
    for i, p in pos.items():
        new_pos[i] = p - center
    plot_circle_packing(comp_pos=new_pos, comp_radii=comp_radii, comp_sizes=comp_pts, big_radius=outer_radius)

    # déplacement ordonnée par taille des cercles
    num_rings = 6  # nombre d'anneaux testés entre le centre et l'outer_radius
    num_angles = 48  # nombre d'angles testés par anneau
    min_sep = 10.0  # distance minimale demandée

    # tri des indices par rayon décroissant (plus grands d'abord)
    indices = list(range(n))
    indices.sort(key=lambda i: comp_radii[i], reverse=True)

    visited = set()

    for i in indices:
        pi = new_pos[i]
        ri = comp_radii[i]

        # déterminer si ce cercle est au contact d'autres à la distance minimale près
        contact = False
        for j in range(n):
            if j == i:
                continue
            d = np.linalg.norm(pi - new_pos[j])
            if d <= (ri + comp_radii[j]) + min_sep:
                contact = True
                break

        if not contact:
            continue

        # construire l'ensemble de candidats à tester
        best_candidate = None
        best_min_dist = -1.0

        # rayons à tester depuis le centre (éviter 0 si ri > 0)
        max_place_radius = max(0.0, outer_radius - ri)
        radii_to_test = np.linspace(0.0, max_place_radius, num_rings + 1)[1:]
        radii_to_test = np.concatenate(([0.0], radii_to_test))

        for rad in radii_to_test:
            # angles
            thetas = np.linspace(0.0, 2 * np.pi, num_angles, endpoint=False)
            for theta in thetas:
                cand = np.array([rad * np.cos(theta), rad * np.sin(theta)])

                # condition: rester entièrement dans outer circle
                if np.linalg.norm(cand) + ri > outer_radius:
                    continue

                # calculer la distance center-to-center au plus proche autre cercle
                dists = np.linalg.norm(np.vstack([cand - new_pos[j] for j in range(n) if j != i]), axis=1)
                # condition minimum par rapport aux autres cercles :
                # on exige à la fois non-overlap (ri + rj) et min_sep center-to-center
                reqs = np.array([max(ri + comp_radii[j], min_sep) for j in range(n) if j != i])

                if np.all(dists >= reqs):
                    # candidat valide : prendre la distance minimale center-to-center comme score
                    min_dist = float(dists.min())
                    # on préfère le candidat qui maximise cette min_dist
                    if min_dist > best_min_dist :
                        best_min_dist = min_dist
                        best_candidate = cand.copy()

        if best_candidate is not None:
            new_pos[i] = best_candidate

    plot_circle_packing(comp_pos=new_pos, comp_radii=comp_radii, comp_sizes=comp_pts, big_radius=outer_radius)
    return new_pos, outer_radius

def pack_subgraphs(G, pos, padding=200):
    components = list(nx.connected_components(G))
    comp_radii = []
    comp_pts = []
    for comp in components:
        pts = np.array([pos[n] for n in comp])
        comp_pts.append(len(pts))
        # ajuste le padding en fonctions du nombres de points du sous graphe
        if len(comp) < 11:
            comp_radii.append(padding*math.sqrt(len(comp)/5))
        else:
            comp_radii.append(padding * (len(comp) / 5))

    comp_pos, big_radius = circles_pack_in_circle(comp_radii,comp_pts)
    final_pos = pos.copy()

    for idx, comp in enumerate(components):
        subG = G.subgraph(comp)
        cx, cy = comp_pos[idx]
        radius = comp_radii[idx]

        # layout local
        try:
             # Kamada Kawai produit des graphes plus "écartés" et structurés (constellations)
             # attention complexité O(N^2)
             if len(comp) > 400:
                raise Exception("Too big for KK")
             
             local_pos = nx.kamada_kawai_layout(
                subG,
                center=(cx, cy),
                scale=radius,
            )
        except:
             # Fallback sur spring if trop gros ou erreur
             local_pos = nx.spring_layout(
                subG,
                center=(cx, cy),
                scale=radius,
                k=radius / math.sqrt(len(comp)) * 2, # Force l'écartement
                iterations=50,
                seed=22
            )

        # injecter les nouvelles positions dans final_pos
        for n, p in local_pos.items():
            final_pos[n] = p
    return final_pos

def compute_and_save_positions(people, rels):
    """Construit un graphe NetworkX, calcule les positions, les stocke dans un fichier."""
    G = nx.Graph()

    for p in people:
        G.add_node(str(p["id"]))

    for r in rels:
        G.add_edge(str(r["source"]), str(r["target"]))

    pos = nx.spring_layout(
        G,
        iterations=0,
        seed=22
    )

    pos_new = pack_subgraphs(G, pos)

    # Conversion JSON
    pos_json = {
        node: {"x": float(coords[0]), "y": float(coords[1])}
        for node, coords in pos_new.items()
    }

    with open(POSITIONS_FILE, "w") as f:
        json.dump(pos_json, f, indent=2)

    return pos_json

with open(DATA_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

# Gérer people comme objet ou tableau
if isinstance(data["people"], dict):
    people = list(data["people"].values())
else:
    people = data["people"]

rel = [r for r in data["relationships"] if r["type"] in ["family1", "family2"]]

# Calculer les positions
pos = compute_and_save_positions(people, rel)
print(f"✅ Positions calculées et sauvegardées dans {POSITIONS_FILE}")
print(f"   {len(people)} personnes, {len(rel)} relations")
