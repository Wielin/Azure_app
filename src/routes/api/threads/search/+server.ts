import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchThreadsPaged } from '$lib/server/db';
import type { ThreadSearch } from '$lib/types';

type LiveSearchResult = {
	id: number;
	title: string;
	excerpt: string;
	cveId: string | null;
	createdAt: string;
	author: string;
};

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;

const toPositiveInt = (value: string | null, fallback: number): number => {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
};

export const GET: RequestHandler = ({ url }) => {
	// Minimalna dlugosc zapytania i limit wynikow chronia baze przed kosztownymi zapytaniami.
	const query = url.searchParams.get('q')?.trim() ?? '';
	const limitRaw = toPositiveInt(url.searchParams.get('limit'), DEFAULT_LIMIT);
	const limit = Math.min(MAX_LIMIT, limitRaw);

	if (query.length < MIN_QUERY_LENGTH) {
		return json({ results: [], totalCount: 0 });
	}

	const filters: ThreadSearch = {
		query,
		tags: [],
		exploitType: '',
		affectedOs: '',
		affectedProtocol: ''
	};

	const { threads, totalCount } = searchThreadsPaged(filters, {
		page: 1,
		pageSize: limit,
		includeCount: true
	});

	const results: LiveSearchResult[] = threads.map((thread) => ({
		id: thread.id,
		title: thread.title,
		excerpt: thread.excerpt,
		cveId: thread.cveId,
		createdAt: thread.createdAt,
		author: thread.author
	}));

	return json({ results, totalCount });
};
