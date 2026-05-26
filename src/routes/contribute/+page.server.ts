import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import {
	createThread,
	getAllTags,
	getLinksByThreadIds,
	getThreadAuthorId,
	searchThreadsPaged,
	updateThread
} from '$lib/server/db';
import type { ThreadSearch } from '$lib/types';

const ROLE_ADMIN = 'Admin';
const ROLE_CONTRIBUTOR = 'Contributor';
const MAX_LINKS = 8;
const EDIT_PAGE_SIZE = 200;

const readText = (value: FormDataEntryValue | null): string => {
	return typeof value === 'string' ? value.trim() : '';
};

const toOptional = (value: FormDataEntryValue | null): string | null => {
	const text = readText(value);
	return text ? text : null;
};

const isWebUrl = (value: string): boolean => {
	return /^https?:\/\//i.test(value);
};

// Parsuje liste linkow z textarea (po jednej linii), waliduje format i limit.
const parseLinks = (raw: string): { url: string; description?: string | null }[] => {
	if (!raw) {
		return [];
	}

	const lines = raw
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length > MAX_LINKS) {
		throw new Error(`Maksymalnie ${MAX_LINKS} linkow.`);
	}

	return lines.map((line) => {
		const [urlPart, descriptionPart] = line.split('|').map((part) => part.trim());
		if (!urlPart || !isWebUrl(urlPart)) {
			throw new Error(`Niepoprawny link: ${urlPart || 'brak'}.`);
		}

		return {
			url: urlPart,
			description: descriptionPart || null
		};
	});
};

const canContributeRole = (role: string | undefined): boolean => {
	return role === ROLE_ADMIN || role === ROLE_CONTRIBUTOR;
};

export const load = async ({ locals }: { locals: App.Locals }) => {
	// Dla uprawnionych pobieramy liste edytowalnych watkow wraz z linkami.
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const canContribute = canContributeRole(locals.user.role);
	const tags = getAllTags();

	if (!canContribute) {
		return {
			canContribute,
			tags,
			threads: []
		};
	}

	const search: ThreadSearch = {
		query: '',
		tags: [],
		exploitType: '',
		affectedOs: '',
		affectedProtocol: ''
	};

	const { threads } = searchThreadsPaged(search, {
		page: 1,
		pageSize: EDIT_PAGE_SIZE,
		includeCount: false
	});

	const editableThreads =
		locals.user.role === ROLE_ADMIN
			? threads
			: threads.filter((thread) => thread.authorId === locals.user?.id);

	const linkRows = getLinksByThreadIds(editableThreads.map((thread) => thread.id));
	const linksByThread = new Map<number, { url: string; description: string | null }[]>();
	for (const link of linkRows) {
		const current = linksByThread.get(link.threadId) ?? [];
		current.push({ url: link.url, description: link.description });
		linksByThread.set(link.threadId, current);
	}

	const threadsWithLinks = editableThreads.map((thread) => {
		const linkList = linksByThread.get(thread.id) ?? [];
		const linksText = linkList
			.map((link) => (link.description ? `${link.url} | ${link.description}` : link.url))
			.join('\n');
		return {
			...thread,
			linksText
		};
	});

	return {
		canContribute,
		tags,
		threads: threadsWithLinks
	};
};

export const actions: Actions = {
	createThread: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
		// Walidacja danych formularza + spiecie wpisu z metadanymi, tagami i linkami.
		if (!locals.user) {
			return fail(401, {
				formId: 'createThread',
				error: 'Zaloguj sie, aby dodac wpis.'
			});
		}

		if (!canContributeRole(locals.user.role)) {
			return fail(403, {
				formId: 'createThread',
				error: 'Brak uprawnien do dodawania wpisow.'
			});
		}

		const data = await request.formData();
		const title = readText(data.get('title'));
		const mainContent = readText(data.get('mainContent'));

		if (!title || !mainContent) {
			return fail(400, {
				formId: 'createThread',
				error: 'Wypelnij tytul i tresc wpisu.'
			});
		}

		const summary = toOptional(data.get('summary'));
		const cveId = toOptional(data.get('cveId'));
		const exploitType = toOptional(data.get('exploitType'));
		const affectedOs = toOptional(data.get('affectedOs'));
		const affectedProtocol = toOptional(data.get('affectedProtocol'));
		const escalationSteps = toOptional(data.get('escalationSteps'));
		const mitigation = toOptional(data.get('mitigation'));
		const patchUrl = toOptional(data.get('patchUrl'));

		let cvssScore: number | null = null;
		const cvssRaw = readText(data.get('cvssScore'));
		if (cvssRaw) {
			const parsed = Number(cvssRaw);
			if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
				return fail(400, {
					formId: 'createThread',
					error: 'CVSS musi byc liczba w zakresie 0-10.'
				});
			}
			cvssScore = parsed;
		}

		if (patchUrl && !isWebUrl(patchUrl)) {
			return fail(400, {
				formId: 'createThread',
				error: 'Link do patcha musi zaczynac sie od http:// lub https://.'
			});
		}

		let links: { url: string; description?: string | null }[] = [];
		try {
			links = parseLinks(readText(data.get('links')));
		} catch (error) {
			return fail(400, {
				formId: 'createThread',
				error: error instanceof Error ? error.message : 'Niepoprawne linki.'
			});
		}

		const tags = Array.from(
			new Set(
				data
					.getAll('tags')
					.map((tag): string => (typeof tag === 'string' ? tag.trim() : ''))
					.filter((tag): tag is string => Boolean(tag))
			)
		);

		createThread({
			title,
			summary,
			mainContent,
			authorId: locals.user.id,
			cveId,
			cvssScore,
			affectedOs,
			affectedProtocol,
			exploitType,
			escalationSteps,
			mitigation,
			patchUrl,
			tags,
			links
		});

		return {
			formId: 'createThread',
			success: true
		};
	},
	editThread: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
		// Sprawdza uprawnienia, waliduje dane i aktualizuje powiazane rekordy.
		if (!locals.user) {
			return fail(401, {
				formId: 'editThread',
				error: 'Zaloguj sie, aby edytowac wpis.'
			});
		}

		if (!canContributeRole(locals.user.role)) {
			return fail(403, {
				formId: 'editThread',
				error: 'Brak uprawnien do edycji wpisow.'
			});
		}

		const data = await request.formData();
		const threadId = Number(data.get('threadId'));
		if (!Number.isInteger(threadId) || threadId <= 0) {
			return fail(400, {
				formId: 'editThread',
				error: 'Niepoprawny wpis.'
			});
		}

		const authorId = getThreadAuthorId(threadId);
		if (!authorId) {
			return fail(404, {
				formId: 'editThread',
				threadId,
				error: 'Wpis nie istnieje.'
			});
		}

		if (locals.user.role !== ROLE_ADMIN && locals.user.id !== authorId) {
			return fail(403, {
				formId: 'editThread',
				threadId,
				error: 'Nie mozesz edytowac tego wpisu.'
			});
		}

		const title = readText(data.get('title'));
		const mainContent = readText(data.get('mainContent'));
		if (!title || !mainContent) {
			return fail(400, {
				formId: 'editThread',
				threadId,
				error: 'Wypelnij tytul i tresc wpisu.'
			});
		}

		const summary = toOptional(data.get('summary'));
		const cveId = toOptional(data.get('cveId'));
		const exploitType = toOptional(data.get('exploitType'));
		const affectedOs = toOptional(data.get('affectedOs'));
		const affectedProtocol = toOptional(data.get('affectedProtocol'));
		const escalationSteps = toOptional(data.get('escalationSteps'));
		const mitigation = toOptional(data.get('mitigation'));
		const patchUrl = toOptional(data.get('patchUrl'));

		let cvssScore: number | null = null;
		const cvssRaw = readText(data.get('cvssScore'));
		if (cvssRaw) {
			const parsed = Number(cvssRaw);
			if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
				return fail(400, {
					formId: 'editThread',
					threadId,
					error: 'CVSS musi byc liczba w zakresie 0-10.'
				});
			}
			cvssScore = parsed;
		}

		if (patchUrl && !isWebUrl(patchUrl)) {
			return fail(400, {
				formId: 'editThread',
				threadId,
				error: 'Link do patcha musi zaczynac sie od http:// lub https://.'
			});
		}

		let links: { url: string; description?: string | null }[] = [];
		try {
			links = parseLinks(readText(data.get('links')));
		} catch (error) {
			return fail(400, {
				formId: 'editThread',
				threadId,
				error: error instanceof Error ? error.message : 'Niepoprawne linki.'
			});
		}

		const tags = Array.from(
			new Set(
				data
					.getAll('tags')
					.map((tag): string => (typeof tag === 'string' ? tag.trim() : ''))
					.filter((tag): tag is string => Boolean(tag))
			)
		);

		updateThread({
			threadId,
			title,
			summary,
			mainContent,
			authorId,
			cveId,
			cvssScore,
			affectedOs,
			affectedProtocol,
			exploitType,
			escalationSteps,
			mitigation,
			patchUrl,
			tags,
			links
		});

		return {
			formId: 'editThread',
			threadId,
			success: true
		};
	}
};
