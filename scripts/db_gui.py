import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import sqlite3
import os

# Configuration DB
DB_PATH = os.path.join(os.path.dirname(__file__), '../database/sky.db')

class SkyAdminApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Sky Database Admin (GUI v2)")
        self.root.geometry("1200x850")
        
        self.conn = sqlite3.connect(DB_PATH)
        self.conn.row_factory = sqlite3.Row
        
        self.selected_id = None
        self.merge_target_id = None

        self.setup_ui()
        self.refresh_list()

    def setup_ui(self):
        # MAIN LAYOUT
        self.paned = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        self.paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # === LEFT PANE: SEARCH & LIST ===
        left_frame = ttk.Frame(self.paned, width=350)
        self.paned.add(left_frame, weight=1)

        # Search Box
        search_frame = ttk.LabelFrame(left_frame, text="Recherche")
        search_frame.pack(fill=tk.X, pady=5, padx=5)
        
        self.search_var = tk.StringVar()
        self.search_var.trace("w", self.on_search)
        tk.Entry(search_frame, textvariable=self.search_var).pack(fill=tk.X, padx=5, pady=5)

        # People List
        columns = ("promo", "name", "id")
        self.tree = ttk.Treeview(left_frame, columns=columns, show="headings")
        self.tree.heading("promo", text="P")
        self.tree.heading("name", text="Nom")
        self.tree.heading("id", text="ID")
        
        self.tree.column("promo", width=40)
        self.tree.column("name", width=150)
        self.tree.column("id", width=100)
        
        self.tree.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.tree.bind("<<TreeviewSelect>>", self.on_select)

        # === RIGHT PANE: EDITING ===
        right_frame = ttk.Frame(self.paned)
        self.paned.add(right_frame, weight=3)
        
        # Header
        self.lbl_title = tk.Label(right_frame, text="<Aucune sélection>", font=("Arial", 14, "bold"))
        self.lbl_title.pack(pady=10)

        # --- TABS (Details vs Relations) ---
        self.tabs = ttk.Notebook(right_frame)
        self.tabs.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # TAB 1: INFO PERSO
        self.tab_info = ttk.Frame(self.tabs)
        self.tabs.add(self.tab_info, text="Informations")
        
        self.entries = {}
        fields = [
            ("ID", "id"), 
            ("Prénom", "first_name"), 
            ("Nom", "last_name"), 
            ("Promo", "level")
        ]
        
        for i, (lbl, key) in enumerate(fields):
            f_row = ttk.Frame(self.tab_info)
            f_row.pack(fill=tk.X, pady=5, padx=5)
            ttk.Label(f_row, text=lbl, width=15, anchor="e").pack(side=tk.LEFT, padx=5)
            entry = ttk.Entry(f_row)
            if key == "id": entry.state = "readonly"
            entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
            self.entries[key] = entry
            
        # Social Links Section
        links_frame = ttk.LabelFrame(self.tab_info, text="Liens Sociaux")
        links_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.links_entries = {}
        link_types = ["LinkedIn", "Email", "GitHub", "Instagram", "Phone", "Website"]
        for i, ltype in enumerate(link_types):
            r = i // 2
            c = i % 2
            f = ttk.Frame(links_frame)
            f.grid(row=r, column=c, sticky="ew", padx=5, pady=2)
            ttk.Label(f, text=ltype, width=10).pack(side=tk.LEFT)
            e = ttk.Entry(f, width=30)
            e.pack(side=tk.LEFT, fill=tk.X, expand=True)
            self.links_entries[ltype] = e
        links_frame.columnconfigure(0, weight=1)
        links_frame.columnconfigure(1, weight=1)


        # Action Buttons (Save/Delete/Merge)
        btn_frame = ttk.LabelFrame(self.tab_info, text="Actions")
        btn_frame.pack(fill=tk.X, padx=10, pady=10)
        
        ttk.Button(btn_frame, text="💾 SAUVEGARDER", command=self.save_user).pack(side=tk.LEFT, padx=5, pady=5)
        ttk.Button(btn_frame, text="🗑️ SUPPRIMER", command=self.delete_user).pack(side=tk.LEFT, padx=5, pady=5)
        
        sep = ttk.Separator(btn_frame, orient=tk.VERTICAL)
        sep.pack(side=tk.LEFT, fill=tk.Y, padx=10)
        
        tk.Label(btn_frame, text="Merge:").pack(side=tk.LEFT)
        ttk.Button(btn_frame, text="1. Définir comme MAIN", command=self.set_merge_target).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="2. Fusionner sélection ICI", command=self.merge_into_target).pack(side=tk.LEFT, padx=2)
        self.lbl_merge_target = tk.Label(btn_frame, text="(Aucune cible)", fg="gray")
        self.lbl_merge_target.pack(side=tk.LEFT, padx=5)


        # TAB 2: RELATIONS
        self.tab_rel = ttk.Frame(self.tabs)
        self.tabs.add(self.tab_rel, text="Généalogie")
        
        # 4 Quadrants for Relations
        self.rel_grid = ttk.Frame(self.tab_rel)
        self.rel_grid.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Helper to create listbox with buttons
        def create_rel_box(parent, title, add_cmd, del_cmd):
            frame = ttk.LabelFrame(parent, text=title)
            lb = tk.Listbox(frame, height=8)
            lb.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=2, pady=2)
            btns = ttk.Frame(frame)
            btns.pack(side=tk.RIGHT, fill=tk.Y)
            ttk.Button(btns, text="+", width=3, command=add_cmd).pack(pady=2)
            ttk.Button(btns, text="-", width=3, command=del_cmd).pack(pady=2)
            return frame, lb

        # Quadrant 1: Parrains Officiels
        f1, self.lb_parrains_off = create_rel_box(self.rel_grid, "⬅️ Parrains OFFICIELS (parrainage)", 
                                                 lambda: self.add_parent('parrainage'), 
                                                 lambda: self.del_relation(self.lb_parrains_off, True))
        f1.grid(row=0, column=0, sticky="nsew", padx=2, pady=2)

        # Quadrant 2: Fillots Officiels
        f2, self.lb_fillots_off = create_rel_box(self.rel_grid, "➡️ Filleuls OFFICIELS (parrainage)", 
                                                lambda: self.add_child('parrainage'), 
                                                lambda: self.del_relation(self.lb_fillots_off, False))
        f2.grid(row=0, column=1, sticky="nsew", padx=2, pady=2)

        # Quadrant 3: Parrains Adoption
        f3, self.lb_parrains_adop = create_rel_box(self.rel_grid, "⬅️ Parrains d'ADOPTION (adoption)", 
                                                  lambda: self.add_parent('adoption'), 
                                                  lambda: self.del_relation(self.lb_parrains_adop, True))
        f3.grid(row=1, column=0, sticky="nsew", padx=2, pady=2)

        # Quadrant 4: Fillots Adoption
        f4, self.lb_fillots_adop = create_rel_box(self.rel_grid, "➡️ Filleuls d'ADOPTION (adoption)", 
                                                 lambda: self.add_child('adoption'), 
                                                 lambda: self.del_relation(self.lb_fillots_adop, False))
        f4.grid(row=1, column=1, sticky="nsew", padx=2, pady=2)
        
        self.rel_grid.columnconfigure(0, weight=1)
        self.rel_grid.columnconfigure(1, weight=1)
        self.rel_grid.rowconfigure(0, weight=1)
        self.rel_grid.rowconfigure(1, weight=1)


    # === LOGIC ===

    def refresh_list(self, query=""):
        for item in self.tree.get_children():
            self.tree.delete(item)
        
        cursor = self.conn.cursor()
        sql = "SELECT id, first_name, last_name, level FROM people"
        params = []
        if query:
            sql += " WHERE id LIKE ? OR first_name LIKE ? OR last_name LIKE ?"
            lq = f"%{query}%"
            params = [lq, lq, lq]
        
        sql += " ORDER BY level DESC, last_name LIMIT 100"
        
        try:
            rows = cursor.execute(sql, params).fetchall()
            for row in rows:
                full_name = f"{row['first_name']} {row['last_name']}"
                self.tree.insert("", "end", iid=row['id'], values=(row['level'], full_name, row['id']))
        except sqlite3.OperationalError as e:
            messagebox.showerror("SQL Error", str(e))

    def on_search(self, *args):
        self.refresh_list(self.search_var.get())

    def on_select(self, event):
        sel = self.tree.selection()
        if not sel: return
        self.load_user(sel[0])

    def load_user(self, user_id):
        self.selected_id = user_id
        cursor = self.conn.cursor()
        
        # 1. DETAILS
        user = cursor.execute("SELECT * FROM people WHERE id = ?", (user_id,)).fetchone()
        if not user: return
        
        self.lbl_title.config(text=f"{user['first_name']} {user['last_name']}")
        
        for key, entry in self.entries.items():
            entry.config(state="normal")
            entry.delete(0, tk.END)
            val = user[key] if key in user.keys() else ""
            if val is not None:
                entry.insert(0, str(val))
            if key == "id": entry.config(state="readonly")

        # 2. LINKS
        for key in self.links_entries:
            self.links_entries[key].delete(0, tk.END)
            
        try:
             # Ensure table exists first (in case migration is missing)
            links = cursor.execute("SELECT type, url FROM external_links WHERE person_id = ?", (user_id,)).fetchall()
            for l in links:
                ltype = l['type']
                if ltype in self.links_entries:
                    self.links_entries[ltype].insert(0, l['url'])
        except sqlite3.OperationalError:
            pass # Table might not exist in old migrations

        # 3. RELATIONS
        self.lb_parrains_off.delete(0, tk.END)
        self.lb_fillots_off.delete(0, tk.END)
        self.lb_parrains_adop.delete(0, tk.END)
        self.lb_fillots_adop.delete(0, tk.END)
        
        # Parents: User is TARGET
        parents = cursor.execute("""
            SELECT p.id, p.first_name, p.last_name, r.type 
            FROM relationships r 
            JOIN people p ON r.source_id = p.id 
            WHERE r.target_id = ?
        """, (user_id,)).fetchall()
        
        for p in parents:
            item = f"{p['first_name']} {p['last_name']} ({p['id']})"
            if p['type'] == 'parrainage':
                self.lb_parrains_off.insert(tk.END, item)
            elif p['type'] == 'adoption':
                self.lb_parrains_adop.insert(tk.END, item)

        # Children: User is SOURCE
        children = cursor.execute("""
            SELECT p.id, p.first_name, p.last_name, r.type 
            FROM relationships r 
            JOIN people p ON r.target_id = p.id 
            WHERE r.source_id = ?
        """, (user_id,)).fetchall()
        
        for c in children:
            item = f"{c['first_name']} {c['last_name']} ({c['id']})"
            if c['type'] == 'parrainage':
                self.lb_fillots_off.insert(tk.END, item)
            elif c['type'] == 'adoption':
                self.lb_fillots_adop.insert(tk.END, item)


    # === ACTIONS ===

    def save_user(self):
        if not self.selected_id: return
        data = {k: self.entries[k].get() for k in self.entries if k != 'id'}
        try:
            # Update user info
            self.conn.execute("""
                UPDATE people SET first_name=?, last_name=?, level=?
                WHERE id=?
            """, (data['first_name'], data['last_name'], data['level'], self.selected_id))
            
            # Update links (Delete all and re-insert)
            self.conn.execute("DELETE FROM external_links WHERE person_id=?", (self.selected_id,))
            for ltype, entry in self.links_entries.items():
                url = entry.get().strip()
                if url:
                    self.conn.execute("INSERT INTO external_links (person_id, type, url) VALUES (?, ?, ?)", 
                                      (self.selected_id, ltype, url))
            
            self.conn.commit()
            messagebox.showinfo("OK", "Modifications enregistrées.")
            self.refresh_list(self.search_var.get())
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def delete_user(self):
        if not self.selected_id: return
        if not messagebox.askyesno("CONFIRM", f"Vraiment supprimer {self.selected_id} ?"): return
        try:
            self.conn.execute("DELETE FROM relationships WHERE source_id=? OR target_id=?", (self.selected_id, self.selected_id))
            self.conn.execute("DELETE FROM external_links WHERE person_id=?", (self.selected_id,))
            self.conn.execute("DELETE FROM people WHERE id=?", (self.selected_id,))
            self.conn.commit()
            self.selected_id = None
            self.refresh_list()
        except Exception as e:
             messagebox.showerror("Error", str(e))

    # === RELATION MANAGEMENT ===

    def ask_id(self, prompt):
        target = simpledialog.askstring("Ajout", prompt)
        if not target: return None
        # Verify exists
        exists = self.conn.execute("SELECT 1 FROM people WHERE id=?", (target,)).fetchone()
        if not exists:
            messagebox.showerror("Erreur", "ID introuvable dans la base.")
            return None
        return target

    def add_parent(self, rtype):
        if not self.selected_id: return
        parent_id = self.ask_id(f"ID du Parrain/Marraine ({rtype}):")
        if parent_id:
            try:
                self.conn.execute("INSERT INTO relationships (source_id, target_id, type) VALUES (?, ?, ?)", 
                                  (parent_id, self.selected_id, rtype))
                self.conn.commit()
                self.load_user(self.selected_id)
            except Exception as e:
                messagebox.showerror("Error", str(e))

    def add_child(self, rtype):
        if not self.selected_id: return
        child_id = self.ask_id(f"ID du Filleul(e) ({rtype}):")
        if child_id:
            try:
                self.conn.execute("INSERT INTO relationships (source_id, target_id, type) VALUES (?, ?, ?)", 
                                  (self.selected_id, child_id, rtype))
                self.conn.commit()
                self.load_user(self.selected_id)
            except Exception as e:
                messagebox.showerror("Error", str(e))
    
    def del_relation(self, listbox, is_parent_box):
        # is_parent_box = True if we are deleting a PARENT (we are target)
        # is_parent_box = False if we are deleting a CHILD (we are source)
        if not self.selected_id: return
        sel = listbox.curselection()
        if not sel: return
        text = listbox.get(sel[0]) # "Name (id)"
        other_id = text.split("(")[-1].strip(")")
        
        try:
            if is_parent_box:
                 # Removing parent: source=other, target=me
                self.conn.execute("DELETE FROM relationships WHERE source_id=? AND target_id=?", (other_id, self.selected_id))
            else:
                # Removing child: source=me, target=other
                self.conn.execute("DELETE FROM relationships WHERE source_id=? AND target_id=?", (self.selected_id, other_id))
            
            self.conn.commit()
            self.load_user(self.selected_id)
        except Exception as e:
            messagebox.showerror("Error", str(e))

    # === MERGE ===
    
    def set_merge_target(self):
        if self.selected_id:
            self.merge_target_id = self.selected_id
            self.lbl_merge_target.config(text=f"Cible: {self.merge_target_id}", fg="green")

    def merge_into_target(self):
        if not self.merge_target_id:
            messagebox.showwarning("!", "Définissez d'abord le MAIN.")
            return
        
        source = self.selected_id
        target = self.merge_target_id
        
        if source == target:
            messagebox.showwarning("!", "Impossible de fusionner sur sois-même.")
            return
            
        if not messagebox.askyesno("Fusion", f"Fusionner {source} -> {target} ?\n{source} sera supprimé."):
            return
            
        try:
            c = self.conn.cursor()
            # source as parent -> target as parent
            c.execute("UPDATE OR IGNORE relationships SET source_id=? WHERE source_id=?", (target, source))
            # source as child -> target as child
            c.execute("UPDATE OR IGNORE relationships SET target_id=? WHERE target_id=?", (target, source))
            
            # External Links
            c.execute("UPDATE OR IGNORE external_links SET person_id=? WHERE person_id=?", (target, source))
            
            c.execute("DELETE FROM relationships WHERE source_id=? OR target_id=?", (source, source))
            c.execute("DELETE FROM external_links WHERE person_id=?", (source,))
            c.execute("DELETE FROM people WHERE id=?", (source,))
            self.conn.commit()
            
            messagebox.showinfo("Done", "Fusion terminée.")
            self.refresh_list(self.search_var.get())
            self.load_user(target)
            
        except Exception as e:
            messagebox.showerror("Error", str(e))

if __name__ == "__main__":
    root = tk.Tk()
    app = SkyAdminApp(root)
    root.mainloop()
