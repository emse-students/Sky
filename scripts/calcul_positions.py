import numpy as np
import json
import math
import networkx as nx
import os
import sqlite3
import logging
import time
import random

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Chemins
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_FILE = os.path.join(BASE_DIR, "database", "sky.db")
POSITIONS_FILE = os.path.join(BASE_DIR, "static", "data", "positions.json")

def circles_pack_in_circle(comp_radii, comp_pts):
    """
    Pack circles (subgraphs) into a larger circle.
    Optimized to reduce iterations.
    """
    n = len(comp_radii)
    if n == 0:
        return {}, 0

    indices = list(range(n))
    indices.sort(key=lambda i: comp_radii[i], reverse=True)

    pos = {}
    # Place biggest circle at center
    pos[indices[0]] = np.array([0.0, 0.0])

    def no_overlap(i, p_i, current_pos):
        """Check if circle i at p_i overlaps with any circle in current_pos."""
        r_i = comp_radii[i]
        for j, p_j in current_pos.items():
            if i == j: continue
            # Optimization: check squared distance
            d_sq = np.sum((p_i - p_j)**2)
            min_dist = r_i + comp_radii[j]
            if d_sq < min_dist * min_dist:
                return False
        return True

    logger.info(f"Packing {n} subgraphs...")
    
    # 1. Initial heuristic packing
    for k in range(1, n):
        i = indices[k]
        r_i = comp_radii[i]
        
        best_pos = None
        best_dist = float("inf")

        # Reduced angles to 36 (every 10 deg)
        num_angles = 36 
        
        # Limit search to already placed circles
        # Optimization: Only check circles that are "exposed"? (ignoring for now)
        
        for j in pos.keys():
            r_j = comp_radii[j]
            xj, yj = pos[j]
            R = r_i + r_j
            
            angles = np.linspace(0, 2*np.pi, num_angles, endpoint=False)
            
            for theta in angles:
                p = np.array([xj + R * np.cos(theta), yj + R * np.sin(theta)])
                
                # Check overlap
                if no_overlap(i, p, pos):
                    dist = np.linalg.norm(p)
                    if dist < best_dist:
                        best_dist = dist
                        best_pos = p

        if best_pos is not None:
            pos[i] = best_pos
        else:
            # Fallback: place far away
            max_r = 0
            if pos:
                 max_r = max([np.linalg.norm(p) + comp_radii[idx] for idx, p in pos.items()])
            pos[i] = np.array([max_r + r_i + 10.0, 0])

    # 2. Centering and Compacting
    # Calculate bounding circle size
    if not pos:
        return {}, 0
        
    x_coords = [p[0] for p in pos.values()]
    y_coords = [p[1] for p in pos.values()]
    all_radii = [comp_radii[i] for i in pos.keys()]
    
    x_min = min(x - r for x, r in zip(x_coords, all_radii))
    x_max = max(x + r for x, r in zip(x_coords, all_radii))
    y_min = min(y - r for y, r in zip(y_coords, all_radii))
    y_max = max(y + r for y, r in zip(y_coords, all_radii))

    width = x_max - x_min
    height = y_max - y_min
    diameter = max(width, height)
    outer_radius = diameter / 2

    center = np.array([(x_min + x_max) / 2, (y_min + y_max) / 2])

    # Recentering
    new_pos = {i: p - center for i, p in pos.items()}

    # 3. Refinement Step (Compacting)
    # Trying to move circles closer to center if possible
    # Skipping heavy refinement if too many components to keep it fast
    if n < 100:
        logger.info("Refining packing (compacting)...")
        num_rings = 4 
        num_angles = 24 
        sorted_indices = indices 

        for i in sorted_indices:
            # Skip the very largest one at center (usually index 0) if it's at 0,0
            if i == indices[0] and np.linalg.norm(new_pos[i]) < 0.1:
                continue
                
            pi = new_pos[i]
            ri = comp_radii[i]
            current_dist = np.linalg.norm(pi)
            
            # Search closer to center
            max_r = max(0.0, current_dist - 1.0)
            if max_r <= 0.1: continue
            
            radii_test = np.linspace(0.1, max_r, num_rings)
            found_better = False
            
            for rad in radii_test:
                thetas = np.linspace(0, 2*np.pi, num_angles, endpoint=False)
                for theta in thetas:
                    cand = np.array([rad * np.cos(theta), rad * np.sin(theta)])
                    if no_overlap(i, cand, new_pos):
                         new_pos[i] = cand
                         found_better = True
                         break
                if found_better: break

    return new_pos, outer_radius

def pack_subgraphs(G, pos, padding=200):
    components = list(nx.connected_components(G))
    N_comp = len(components)
    logger.info(f"Found {N_comp} connected components.")
    
    comp_radii = []
    comp_pts = []
    
    # Calculate approximate radius for each component
    for comp in components:
        n_nodes = len(comp)
        comp_pts.append(n_nodes)
        
        # Radius heuristic
        if n_nodes < 10:
            comp_radii.append(padding * math.sqrt(n_nodes) * 0.8)
        else:
            comp_radii.append(padding * (math.sqrt(n_nodes)) * 1.2)

    # Pack the components
    comp_pos, big_radius = circles_pack_in_circle(comp_radii, comp_pts)
    final_pos = pos.copy()

    logger.info("Computing fine-grained layouts for components...")
    
    for idx, comp in enumerate(components):
        if idx % 10 == 0 and idx > 0 and N_comp > 50:
            logger.info(f"  Processed {idx}/{N_comp} components...")
            
        subG = G.subgraph(comp)
        
        if idx not in comp_pos: # Should not happen
            continue
            
        cx, cy = comp_pos[idx] * 2.5 
        radius = comp_radii[idx]

        try:
             # Use Kamada Kawai for cleaner layouts on smaller graphs
             if len(comp) < 80:
                 local_pos = nx.kamada_kawai_layout(
                    subG,
                    center=(cx, cy),
                    scale=radius * 1.0,  # Increased scale for more space
                )
             else:
                 # Much better spacing for large families
                 k_val = 3.5 / math.sqrt(len(comp)) if len(comp) > 0 else 1  # Increased spacing
                 # Many more iterations for complete untangling
                 if len(comp) < 150:
                     iterations = 300
                 elif len(comp) < 300:
                     iterations = 500
                 else:
                     iterations = 600
                 
                 local_pos = nx.spring_layout(
                    subG,
                    center=(cx, cy),
                    scale=radius * 1.1,  # Increased scale
                    k=k_val, 
                    iterations=iterations,
                    seed=42
                )
        except Exception as e:
             logger.error(f"Layout error for component {idx}: {e}")
             local_pos = nx.circular_layout(subG, center=(cx,cy), scale=radius)

        for n, p in local_pos.items():
            final_pos[n] = p
            
    return final_pos

def run():
    if not os.path.exists(DB_FILE):
        logger.error(f"Database not found: {DB_FILE}")
        return

    logger.info("Loading data from SQLite...")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM people")
    nodes = [r[0] for r in cursor.fetchall()]
    logger.info(f"Loaded {len(nodes)} people.")

    cursor.execute("SELECT source_id, target_id FROM relationships")
    edges_raw = cursor.fetchall()
    
    node_set = set(nodes)
    edges = []
    for s, t in edges_raw:
        if s in node_set and t in node_set:
            edges.append((s, t))
            
    logger.info(f"Loaded {len(edges)} relationships.")
    conn.close()

    if not nodes:
        logger.warning("No nodes found.")
        return

    G = nx.Graph()
    G.add_nodes_from(nodes)
    G.add_edges_from(edges)

    # Identify isolated nodes (no connections)
    isolated_nodes = [n for n in G.nodes() if G.degree(n) == 0]
    connected_nodes = [n for n in G.nodes() if G.degree(n) > 0]
    
    logger.info(f"Found {len(isolated_nodes)} isolated nodes and {len(connected_nodes)} connected nodes.")

    start_time = time.time()
    pos_new = {}

    if connected_nodes:
        logger.info("Calculating layout for connected nodes...")
        G_connected = G.subgraph(connected_nodes)
        
        # Dummy pos for connected nodes only
        dummy_pos = {n: (0, 0) for n in connected_nodes}
        
        logger.info("Starting Graph Packing Algorithm...")
        pos_connected = pack_subgraphs(G_connected, dummy_pos, padding=250)
        pos_new.update(pos_connected)
        
        # Calculate bounding radius of connected graph
        if pos_connected:
            max_radius = max(np.linalg.norm(np.array([pos[0], pos[1]])) 
                           for pos in pos_connected.values())
        else:
            max_radius = 0
    else:
        max_radius = 0

    # Place isolated nodes like a realistic starfield with clusters and galactic structures
    if isolated_nodes:
        logger.info(f"Scattering {len(isolated_nodes)} isolated nodes like stars...")
        
        random.seed(42)
        np.random.seed(42)
        
        # Create realistic star field with multiple structures
        num_isolated = len(isolated_nodes)
        
        # Define galactic structures
        # 1. Main galactic band (like Milky Way) - 40% of stars
        # 2. Star clusters - 30% of stars in 5-8 clusters
        # 3. Diffuse background - 30% of stars scattered
        
        num_band = int(num_isolated * 0.40)
        num_clusters = int(num_isolated * 0.30)
        num_diffuse = num_isolated - num_band - num_clusters
        
        # Shuffle nodes for random assignment
        shuffled_nodes = isolated_nodes.copy()
        random.shuffle(shuffled_nodes)
        
        idx = 0
        
        # 1. Galactic band (dense band across the sky)
        band_angle = random.uniform(0, 2 * np.pi)  # Random orientation
        band_width = 4000
        band_length = max_radius + 20000
        
        for i in range(num_band):
            # Position along the band
            t = np.random.beta(2, 2)  # More dense in center
            along = (t - 0.5) * 2 * band_length
            
            # Perpendicular offset (Gaussian for band thickness)
            across = np.random.normal(0, band_width / 3)
            
            # Rotate by band angle
            x = along * np.cos(band_angle) - across * np.sin(band_angle)
            y = along * np.sin(band_angle) + across * np.cos(band_angle)
            
            pos_new[shuffled_nodes[idx]] = np.array([x, y])
            idx += 1
        
        # 2. Star clusters (dense groups)
        num_cluster_groups = random.randint(5, 8)
        stars_per_cluster = num_clusters // num_cluster_groups
        
        for c in range(num_cluster_groups):
            # Random cluster center
            cluster_r = random.uniform(max_radius + 3000, max_radius + 18000)
            cluster_angle = random.uniform(0, 2 * np.pi)
            cluster_cx = cluster_r * np.cos(cluster_angle)
            cluster_cy = cluster_r * np.sin(cluster_angle)
            
            # Cluster radius
            cluster_radius = random.uniform(800, 2000)
            
            # Place stars in this cluster
            for s in range(stars_per_cluster):
                if idx >= len(shuffled_nodes):
                    break
                    
                # Use normal distribution for cluster shape
                offset_r = abs(np.random.normal(0, cluster_radius / 2))
                offset_angle = random.uniform(0, 2 * np.pi)
                
                x = cluster_cx + offset_r * np.cos(offset_angle)
                y = cluster_cy + offset_r * np.sin(offset_angle)
                
                pos_new[shuffled_nodes[idx]] = np.array([x, y])
                idx += 1
        
        # 3. Diffuse background stars
        for i in range(idx, len(shuffled_nodes)):
            # Wide exponential distribution for natural falloff
            r_normalized = np.random.exponential(scale=0.6)
            r_normalized = min(r_normalized, 5.0)
            
            r = max_radius + 2000 + r_normalized * 4000
            angle = random.uniform(0, 2 * np.pi)
            
            x = r * np.cos(angle)
            y = r * np.sin(angle)
            
            pos_new[shuffled_nodes[i]] = np.array([x, y])

    # Save
    logger.info(f"Saving positions to {POSITIONS_FILE}...")
    pos_json = {
        node: {"x": float(coords[0]), "y": float(coords[1])}
        for node, coords in pos_new.items()
    }

    os.makedirs(os.path.dirname(POSITIONS_FILE), exist_ok=True)
    with open(POSITIONS_FILE, "w") as f:
        json.dump(pos_json, f, indent=2)

    duration = time.time() - start_time
    logger.info(f"Done in {duration:.2f} seconds. Positioned {len(pos_new)} nodes.")

if __name__ == "__main__":
    run()
