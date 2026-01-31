import Database from 'better-sqlite3';
import type { User, Session } from '$types/api';

class AuthService {
	private db: Database.Database;

	constructor(dbPath: string = 'auth.db') {
		this.db = new Database(dbPath);
		this.initDatabase();
	}

	private initDatabase() {
		this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                profile_id TEXT,
                role TEXT DEFAULT 'user',
                first_login INTEGER DEFAULT 1,
                avatar TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

		this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

		const adminExists = this.db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
		if (!adminExists) {
			this.db.prepare(
				'INSERT INTO users (email, name, role, first_login) VALUES (?, ?, ?, ?)'
			).run('admin@emse.fr', 'Administrateur', 'admin', 0);
		}
	}

	getOrCreateUser(email: string, name: string, profileId?: string): User {
		let user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

		if (!user) {
			this.db.prepare(
				'INSERT INTO users (email, name, profile_id) VALUES (?, ?, ?)'
			).run(email, name, profileId || null);
			user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User;
		} else if (profileId && user.profile_id !== profileId) {
			// Update profile_id if different and provided
			this.db.prepare('UPDATE users SET profile_id = ? WHERE email = ?').run(profileId, email);
			user.profile_id = profileId;
		}
		return user;
	}

	createSession(email: string, name: string): { token: string; user: User } {
		// Extract ID from email (before @)
		const userId = email.split('@')[0];
		
		let user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

		if (!user) {
			this.db.prepare(
				'INSERT INTO users (email, name, profile_id) VALUES (?, ?, ?)'
			).run(email, name, userId);
			user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User;
		} else if (!user.profile_id) {
			// Update existing user with profile_id if missing
			this.db.prepare('UPDATE users SET profile_id = ? WHERE email = ?').run(userId, email);
			user.profile_id = userId;
		}

		const token = crypto.randomUUID();
		const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 7;

		this.db.prepare(
			'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
		).run(token, user.id, expiresAt);

		return { token, user };
	}

	validateSession(token: string): User | null {
		const session = this.db.prepare(`
            SELECT s.*, u.* FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > strftime('%s', 'now')
        `).get(token) as (Session & User) | undefined;

		return session ? {
			id: session.id,
			email: session.email,
			name: session.name,
			profile_id: session.profile_id,
			role: session.role,
			first_login: session.first_login,
			avatar: session.avatar
		} : null;
	}

	deleteSession(token: string) {
		this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
	}

	linkProfile(userId: number, profileId: string) {
		this.db.prepare(
			'UPDATE users SET profile_id = ?, first_login = 0 WHERE id = ?'
		).run(profileId, userId);
	}

	getUserById(id: number): User | null {
		return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined || null;
	}

	updateUser(userId: number, updates: Partial<User>) {
		const fields = Object.keys(updates)
			.filter(k => k !== 'id')
			.map(k => `${k} = ?`)
			.join(', ');
		const values = Object.keys(updates)
			.filter(k => k !== 'id')
			.map(k => updates[k as keyof User]);

		if (fields) {
			this.db.prepare(
				`UPDATE users SET ${fields} WHERE id = ?`
			).run(...values, userId);
		}
	}
}

export const auth = new AuthService();
