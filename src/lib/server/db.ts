import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { TagOption, ThreadSearch, ThreadSummary, UserSummary } from '$lib/types';

type SessionRow = {
	expiresAt: string;
	id: number;
	username: string;
	email: string;
	role: string;
};

type LoginUserRow = {
	id: number;
	username: string;
	email: string;
	passwordHash: string;
	role: string;
};

export type AuthUser = {
	id: number;
	username: string;
	email: string;
	role: string;
};

type TagRow = {
	id: number;
	name: string;
};

type ThreadSummaryRow = {
	id: number;
	title: string;
	summary: string | null;
	mainContent: string;
	createdAt: string;
	views: number;
	author: string;
	authorId: number;
	cveId: string | null;
	cvssScore: number | null;
	affectedOs: string | null;
	affectedProtocol: string | null;
	exploitType: string | null;
	escalationSteps: string | null;
	mitigation: string | null;
	patchUrl: string | null;
	tags: string | null;
};

type ThreadSearchOptions = {
	page: number;
	pageSize: number;
	includeCount?: boolean;
};

type ThreadSearchResult = {
	threads: ThreadSummary[];
	totalCount: number;
};

type ThreadSearchQuery = {
	whereClause: string;
	params: Array<string | number>;
};

type LinkRow = {
	threadId: number;
	url: string;
	description: string | null;
};

type UserSummaryRow = {
	id: number;
	username: string;
	email: string;
	role: string;
};

type ThreadLinkInput = {
	url: string;
	description?: string | null;
};

type NewThreadInput = {
	title: string;
	summary?: string | null;
	mainContent: string;
	authorId: number;
	cveId?: string | null;
	cvssScore?: number | null;
	affectedOs?: string | null;
	affectedProtocol?: string | null;
	exploitType?: string | null;
	escalationSteps?: string | null;
	mitigation?: string | null;
	patchUrl?: string | null;
	tags?: string[];
	links?: ThreadLinkInput[];
};

type UpdateThreadInput = NewThreadInput & {
	threadId: number;
};

const DB_PATH = resolve('data', 'app.db');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const HASH_ITERATIONS = 120_000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = 'sha256';

let db: DatabaseSync | null = null;
let initialized = false;

//init bazy i schematu, aby start byl szybki i bez globalnych efektow ubocznych.
function getDb(): DatabaseSync {
	if (!db) {
		mkdirSync(dirname(DB_PATH), { recursive: true });
		db = new DatabaseSync(DB_PATH);
	}

	if (!initialized) {
		initializeSchema(db);
		initialized = true;
	}

	return db;
}

// Tworzy schemat bazy i podstawowe dane startowe (role, tagi, admin).
function initializeSchema(database: DatabaseSync): void {
	database.exec('PRAGMA foreign_keys = ON;');
	database.exec(`
		CREATE TABLE IF NOT EXISTS Roles (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE
		);

		CREATE TABLE IF NOT EXISTS Users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role_id INTEGER NOT NULL DEFAULT 1,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (role_id) REFERENCES Roles(id)
		);

		CREATE TABLE IF NOT EXISTS Tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tag_name TEXT NOT NULL UNIQUE
		);

		CREATE TABLE IF NOT EXISTS Threads (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			summary TEXT,
			main_content TEXT NOT NULL,
			author_id INTEGER NOT NULL,
			views INTEGER NOT NULL DEFAULT 0,
			is_published INTEGER NOT NULL DEFAULT 1,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (author_id) REFERENCES Users(id) ON DELETE CASCADE
		);

		CREATE TRIGGER IF NOT EXISTS threads_updated_at
		AFTER UPDATE ON Threads
		FOR EACH ROW
		WHEN NEW.updated_at = OLD.updated_at
		BEGIN
			UPDATE Threads SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
		END;

		CREATE TABLE IF NOT EXISTS Exploit_Meta (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			thread_id INTEGER NOT NULL UNIQUE,
			cve_id TEXT,
			cvss_score REAL,
			affected_os TEXT,
			affected_protocol TEXT,
			exploit_type TEXT,
			escalation_steps TEXT,
			mitigation TEXT,
			patch_url TEXT,
			FOREIGN KEY (thread_id) REFERENCES Threads(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS Links (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			thread_id INTEGER NOT NULL,
			url TEXT NOT NULL,
			description TEXT,
			FOREIGN KEY (thread_id) REFERENCES Threads(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS Thread_Tags (
			thread_id INTEGER NOT NULL,
			tag_id INTEGER NOT NULL,
			PRIMARY KEY (thread_id, tag_id),
			FOREIGN KEY (thread_id) REFERENCES Threads(id) ON DELETE CASCADE,
			FOREIGN KEY (tag_id) REFERENCES Tags(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS Likes (
			user_id INTEGER NOT NULL,
			thread_id INTEGER NOT NULL,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (user_id, thread_id),
			FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
			FOREIGN KEY (thread_id) REFERENCES Threads(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS Sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token TEXT NOT NULL UNIQUE,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			expires_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
		);
	`);

	seedInitialData(database);
}

// Seed danych, ktore sa wymagane do dzialania aplikacji.
function seedInitialData(database: DatabaseSync): void {
	const roleCount = database.prepare('SELECT COUNT(*) AS count FROM Roles').get() as {
		count: number;
	};

	if (roleCount.count === 0) {
		database
			.prepare('INSERT INTO Roles (name) VALUES (?), (?), (?), (?)')
			.run('Guest', 'User', 'Contributor', 'Admin');
	}

	const tagCount = database.prepare('SELECT COUNT(*) AS count FROM Tags').get() as {
		count: number;
	};

	if (tagCount.count === 0) {
		database
			.prepare(
				`INSERT INTO Tags (tag_name) VALUES
				('RCE'),
				('LPE'),
				('SQLi'),
				('XSS'),
				('CSRF'),
				('BufferOverflow'),
				('Windows'),
				('Linux'),
				('macOS'),
				('Android'),
				('Web'),
				('Network'),
				('Critical'),
				('High'),
				('Medium'),
				('Low'),
				('ZeroDay');`
			)
			.run();
	}

	const adminRoleId = getRoleIdByName('Admin', database);
	const hasAdmin = database
		.prepare('SELECT 1 FROM Users WHERE role_id = ? LIMIT 1')
		.get(adminRoleId);

	if (!hasAdmin) {
		const passwordHash = hashPassword('admin123');
		database
			.prepare(
				'INSERT INTO Users (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)'
			)
			.run('admin', 'admin@example.com', passwordHash, adminRoleId);
	}
}

// Hash w formacie: pbkdf2$iterations$salt$hash
export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString(
		'hex'
	);
	return `pbkdf2$${HASH_ITERATIONS}$${salt}$${hash}`;
}

// Waliduje format i porownuje hash w sposob odporny na timing attacks.
export function verifyPassword(password: string, stored: string): boolean {
	try {
		const [scheme, iterationsRaw, salt, hash] = stored.split('$');
		if (scheme !== 'pbkdf2' || !iterationsRaw || !salt || !hash) {
			return false;
		}

		const iterations = Number(iterationsRaw);
		if (!Number.isFinite(iterations) || iterations <= 0) {
			return false;
		}

		const storedBuffer = Buffer.from(hash, 'hex');
		const derived = pbkdf2Sync(password, salt, iterations, storedBuffer.length, HASH_DIGEST);
		return timingSafeEqual(storedBuffer, derived);
	} catch {
		return false;
	}
}

function getRoleIdByName(name: string, database?: DatabaseSync): number {
	const activeDb = database ?? getDb();
	const row = activeDb.prepare('SELECT id FROM Roles WHERE name = ?').get(name) as
		| { id: number }
		| undefined;

	if (!row) {
		throw new Error(`Role not found: ${name}`);
	}

	return row.id;
}

export function isUsernameTaken(username: string): boolean {
	const database = getDb();
	const row = database
		.prepare('SELECT 1 FROM Users WHERE username = ? LIMIT 1')
		.get(username);
	return Boolean(row);
}

export function isEmailTaken(email: string): boolean {
	const database = getDb();
	const row = database.prepare('SELECT 1 FROM Users WHERE email = ? LIMIT 1').get(email);
	return Boolean(row);
}

export function createUser(params: {
	username: string;
	email: string;
	passwordHash: string;
	roleName?: string;
}): number {
	const database = getDb();
	const roleName = params.roleName ?? 'User';
	const roleId = getRoleIdByName(roleName);
	const result = database
		.prepare('INSERT INTO Users (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)')
		.run(params.username, params.email, params.passwordHash, roleId);

	return Number(result.lastInsertRowid);
}

export function getUserByIdentifier(identifier: string): LoginUserRow | null {
	const database = getDb();
	const row = database
		.prepare(
			`SELECT Users.id AS id,
				Users.username AS username,
				Users.email AS email,
				Users.password_hash AS passwordHash,
				Roles.name AS role
			FROM Users
			JOIN Roles ON Roles.id = Users.role_id
			WHERE Users.username = ? OR Users.email = ?
			LIMIT 1`
		)
		.get(identifier, identifier) as LoginUserRow | undefined;

	return row ?? null;
}

export function createSession(userId: number): string {
	const database = getDb();
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

	database
		.prepare('INSERT INTO Sessions (user_id, token, expires_at) VALUES (?, ?, ?)')
		.run(userId, token, expiresAt);

	return token;
}

export function deleteSession(token: string): void {
	const database = getDb();
	database.prepare('DELETE FROM Sessions WHERE token = ?').run(token);
}

// Sprawdza token sesji oraz usuwa wygasle sesje.
export function getUserBySessionToken(token: string): AuthUser | null {
	const database = getDb();
	const row = database
		.prepare(
			`SELECT Users.id AS id,
				Users.username AS username,
				Users.email AS email,
				Roles.name AS role,
				Sessions.expires_at AS expiresAt
			FROM Sessions
			JOIN Users ON Users.id = Sessions.user_id
			JOIN Roles ON Roles.id = Users.role_id
			WHERE Sessions.token = ?
			LIMIT 1`
		)
		.get(token) as SessionRow | undefined;

	if (!row) {
		return null;
	}

	if (new Date(row.expiresAt).getTime() <= Date.now()) {
		deleteSession(token);
		return null;
	}

	return {
		id: row.id,
		username: row.username,
		email: row.email,
		role: row.role
	};
}

export function getAllTags(): TagOption[] {
	const database = getDb();
	const rows = database
		.prepare('SELECT id, tag_name AS name FROM Tags ORDER BY tag_name ASC')
		.all() as TagRow[];

	return rows.map((row) => ({
		id: row.id,
		name: row.name
	}));
}

// Buduje klauzule WHERE oraz parametry w oparciu o filtry wyszukiwania.
function buildThreadSearchQuery(filters: ThreadSearch): ThreadSearchQuery {
	const clauses: string[] = [];
	const params: Array<string | number> = [];

	if (filters.query) {
		const like = `%${filters.query}%`;
		clauses.push(
			`(Threads.title LIKE ?
				OR Threads.summary LIKE ?
				OR Threads.main_content LIKE ?
				OR Exploit_Meta.cve_id LIKE ?
				OR Exploit_Meta.exploit_type LIKE ?
				OR Exploit_Meta.affected_os LIKE ?
				OR Exploit_Meta.affected_protocol LIKE ?)`
		);
		params.push(like, like, like, like, like, like, like);
	}

	if (filters.exploitType) {
		clauses.push('LOWER(Exploit_Meta.exploit_type) LIKE ?');
		params.push(`%${filters.exploitType.toLowerCase()}%`);
	}

	if (filters.affectedOs) {
		clauses.push('LOWER(Exploit_Meta.affected_os) LIKE ?');
		params.push(`%${filters.affectedOs.toLowerCase()}%`);
	}

	if (filters.affectedProtocol) {
		clauses.push('LOWER(Exploit_Meta.affected_protocol) LIKE ?');
		params.push(`%${filters.affectedProtocol.toLowerCase()}%`);
	}

	if (filters.tags.length > 0) {
		const placeholders = filters.tags.map(() => '?').join(', ');
		clauses.push(
			`Threads.id IN (
				SELECT Thread_Tags.thread_id
				FROM Thread_Tags
				JOIN Tags ON Tags.id = Thread_Tags.tag_id
				WHERE Tags.tag_name IN (${placeholders})
			)`
		);
		params.push(...filters.tags);
	}

	return {
		whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
		params
	};
}

// Wyszukiwanie z paginacja i opcjonalnym COUNT dla UI.
export function searchThreadsPaged(
	filters: ThreadSearch,
	options: ThreadSearchOptions
): ThreadSearchResult {
	const database = getDb();
	const { whereClause, params } = buildThreadSearchQuery(filters);
	const page = Math.max(1, Math.floor(options.page));
	const pageSize = Math.max(1, Math.floor(options.pageSize));
	const offset = (page - 1) * pageSize;

	let totalCount = 0;
	if (options.includeCount) {
		const countRow = database
			.prepare(
				`SELECT COUNT(DISTINCT Threads.id) AS count
				FROM Threads
				JOIN Users ON Users.id = Threads.author_id
				LEFT JOIN Exploit_Meta ON Exploit_Meta.thread_id = Threads.id
				LEFT JOIN Thread_Tags ON Thread_Tags.thread_id = Threads.id
				LEFT JOIN Tags ON Tags.id = Thread_Tags.tag_id
				${whereClause}`
			)
			.get(...params) as { count: number } | undefined;
		totalCount = countRow?.count ?? 0;
	}

	const rows = database
		.prepare(
			`SELECT
				Threads.id AS id,
				Threads.title AS title,
				Threads.summary AS summary,
				Threads.main_content AS mainContent,
				strftime('%Y-%m-%d', Threads.created_at) AS createdAt,
				Threads.views AS views,
				Users.username AS author,
				Threads.author_id AS authorId,
				Exploit_Meta.cve_id AS cveId,
				Exploit_Meta.cvss_score AS cvssScore,
				Exploit_Meta.affected_os AS affectedOs,
				Exploit_Meta.affected_protocol AS affectedProtocol,
				Exploit_Meta.exploit_type AS exploitType,
				Exploit_Meta.escalation_steps AS escalationSteps,
				Exploit_Meta.mitigation AS mitigation,
				Exploit_Meta.patch_url AS patchUrl,
				GROUP_CONCAT(DISTINCT Tags.tag_name) AS tags
			FROM Threads
			JOIN Users ON Users.id = Threads.author_id
			LEFT JOIN Exploit_Meta ON Exploit_Meta.thread_id = Threads.id
			LEFT JOIN Thread_Tags ON Thread_Tags.thread_id = Threads.id
			LEFT JOIN Tags ON Tags.id = Thread_Tags.tag_id
			${whereClause}
			GROUP BY Threads.id
			ORDER BY Threads.created_at DESC
			LIMIT ? OFFSET ?`
		)
		.all(...params, pageSize, offset) as ThreadSummaryRow[];

	const threads = rows.map((row) => {
		// Excerpt bazuje na summary lub tresci glownej.
		const summary = row.summary?.trim() ?? '';
		const fallback = row.mainContent.trim();
		const excerptSource = summary || fallback;
		const excerpt = excerptSource.length > 220 ? `${excerptSource.slice(0, 217)}...` : excerptSource;
		const tags = row.tags ? row.tags.split(',').map((tag) => tag.trim()) : [];

		return {
			id: row.id,
			title: row.title,
			summary: row.summary,
			mainContent: row.mainContent,
			excerpt,
			author: row.author,
			authorId: row.authorId,
			createdAt: row.createdAt,
			views: row.views,
			cveId: row.cveId,
			cvssScore: row.cvssScore,
			affectedOs: row.affectedOs,
			affectedProtocol: row.affectedProtocol,
			exploitType: row.exploitType,
			escalationSteps: row.escalationSteps,
			mitigation: row.mitigation,
			patchUrl: row.patchUrl,
			tags
		};
	});

	return {
		threads,
		totalCount
	};
}

export function searchThreads(filters: ThreadSearch): ThreadSummary[] {
	return searchThreadsPaged(filters, { page: 1, pageSize: 200, includeCount: false }).threads;
}

export function getThreadAuthorId(threadId: number): number | null {
	const database = getDb();
	const row = database
		.prepare('SELECT author_id AS authorId FROM Threads WHERE id = ?')
		.get(threadId) as { authorId: number } | undefined;

	return row?.authorId ?? null;
}

export function getLinksByThreadIds(threadIds: number[]): LinkRow[] {
	if (threadIds.length === 0) {
		return [];
	}

	const database = getDb();
	const placeholders = threadIds.map(() => '?').join(', ');
	return database
		.prepare(
			`SELECT thread_id AS threadId, url, description
			FROM Links
			WHERE thread_id IN (${placeholders})
			ORDER BY id ASC`
		)
		.all(...threadIds) as LinkRow[];
}

// Transakcja: tworzy wpis, metadane, linki i tagi w jednej operacji.
export function createThread(input: NewThreadInput): number {
	const database = getDb();
	const tags = input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
	const links = input.links?.filter((link) => link.url.trim()) ?? [];

	const insertThread = database.prepare(
		'INSERT INTO Threads (title, summary, main_content, author_id) VALUES (?, ?, ?, ?)'
	);
	const insertMeta = database.prepare(
		`INSERT INTO Exploit_Meta (
			thread_id,
			cve_id,
			cvss_score,
			affected_os,
			affected_protocol,
			exploit_type,
			escalation_steps,
			mitigation,
			patch_url
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	const insertLink = database.prepare(
		'INSERT INTO Links (thread_id, url, description) VALUES (?, ?, ?)'
	);
	const insertTag = database.prepare('INSERT INTO Tags (tag_name) VALUES (?)');
	const getTagId = database.prepare('SELECT id FROM Tags WHERE tag_name = ?');
	const insertThreadTag = database.prepare(
		'INSERT OR IGNORE INTO Thread_Tags (thread_id, tag_id) VALUES (?, ?)'
	);

	database.exec('BEGIN');
	try {
		const threadResult = insertThread.run(
			input.title,
			input.summary ?? null,
			input.mainContent,
			input.authorId
		);
		const threadId = Number(threadResult.lastInsertRowid);

		insertMeta.run(
			threadId,
			input.cveId ?? null,
			input.cvssScore ?? null,
			input.affectedOs ?? null,
			input.affectedProtocol ?? null,
			input.exploitType ?? null,
			input.escalationSteps ?? null,
			input.mitigation ?? null,
			input.patchUrl ?? null
		);

		for (const link of links) {
			insertLink.run(threadId, link.url.trim(), link.description?.trim() || null);
		}

		for (const tag of tags) {
			let tagRow = getTagId.get(tag) as { id: number } | undefined;
			if (!tagRow) {
				insertTag.run(tag);
				tagRow = getTagId.get(tag) as { id: number } | undefined;
			}
			if (tagRow) {
				insertThreadTag.run(threadId, tagRow.id);
			}
		}

		database.exec('COMMIT');
		return threadId;
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

// Transakcja: aktualizuje wpis oraz synchronizuje linki i tagi.
export function updateThread(input: UpdateThreadInput): void {
	const database = getDb();
	const tags = input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];
	const links = input.links?.filter((link) => link.url.trim()) ?? [];

	const updateThreadStmt = database.prepare(
		'UPDATE Threads SET title = ?, summary = ?, main_content = ? WHERE id = ?'
	);
	const upsertMeta = database.prepare(
		`INSERT INTO Exploit_Meta (
			thread_id,
			cve_id,
			cvss_score,
			affected_os,
			affected_protocol,
			exploit_type,
			escalation_steps,
			mitigation,
			patch_url
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(thread_id) DO UPDATE SET
			cve_id = excluded.cve_id,
			cvss_score = excluded.cvss_score,
			affected_os = excluded.affected_os,
			affected_protocol = excluded.affected_protocol,
			exploit_type = excluded.exploit_type,
			escalation_steps = excluded.escalation_steps,
			mitigation = excluded.mitigation,
			patch_url = excluded.patch_url`
	);
	const deleteLinks = database.prepare('DELETE FROM Links WHERE thread_id = ?');
	const insertLink = database.prepare(
		'INSERT INTO Links (thread_id, url, description) VALUES (?, ?, ?)'
	);
	const deleteThreadTags = database.prepare('DELETE FROM Thread_Tags WHERE thread_id = ?');
	const insertTag = database.prepare('INSERT INTO Tags (tag_name) VALUES (?)');
	const getTagId = database.prepare('SELECT id FROM Tags WHERE tag_name = ?');
	const insertThreadTag = database.prepare(
		'INSERT OR IGNORE INTO Thread_Tags (thread_id, tag_id) VALUES (?, ?)'
	);

	database.exec('BEGIN');
	try {
		updateThreadStmt.run(
			input.title,
			input.summary ?? null,
			input.mainContent,
			input.threadId
		);

		upsertMeta.run(
			input.threadId,
			input.cveId ?? null,
			input.cvssScore ?? null,
			input.affectedOs ?? null,
			input.affectedProtocol ?? null,
			input.exploitType ?? null,
			input.escalationSteps ?? null,
			input.mitigation ?? null,
			input.patchUrl ?? null
		);

		deleteLinks.run(input.threadId);
		for (const link of links) {
			insertLink.run(input.threadId, link.url.trim(), link.description?.trim() || null);
		}

		deleteThreadTags.run(input.threadId);
		for (const tag of tags) {
			let tagRow = getTagId.get(tag) as { id: number } | undefined;
			if (!tagRow) {
				insertTag.run(tag);
				tagRow = getTagId.get(tag) as { id: number } | undefined;
			}
			if (tagRow) {
				insertThreadTag.run(input.threadId, tagRow.id);
			}
		}

		database.exec('COMMIT');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

export function listUsers(): UserSummary[] {
	const database = getDb();
	const rows = database
		.prepare(
			`SELECT Users.id AS id,
				Users.username AS username,
				Users.email AS email,
				Roles.name AS role
			FROM Users
			JOIN Roles ON Roles.id = Users.role_id
			ORDER BY Users.username ASC`
		)
		.all() as UserSummaryRow[];

	return rows.map((row) => ({
		id: row.id,
		username: row.username,
		email: row.email,
		role: row.role
	}));
}

export function updateUserRole(userId: number, roleName: string): void {
	const database = getDb();
	// Mapuje nazwe roli na identyfikator z tabeli Roles.
	const roleId = getRoleIdByName(roleName, database);
	database.prepare('UPDATE Users SET role_id = ? WHERE id = ?').run(roleId, userId);
}
