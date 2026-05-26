import type { PageServerLoad } from './$types';
import { getAllTags, searchThreadsPaged } from '$lib/server/db';
import type { ThreadSearch } from '$lib/types';

const DEFAULT_PAGE_SIZE = 8;
const MIN_PAGE_SIZE = 4;
const MAX_PAGE_SIZE = 40;

const parseSearch = (url: URL): ThreadSearch => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const tags = url.searchParams
		.getAll('tag')
		.map((tag) => tag.trim())
		.filter(Boolean);
	const exploitType = url.searchParams.get('exploitType')?.trim() ?? '';
	const affectedOs = url.searchParams.get('affectedOs')?.trim() ?? '';
	const affectedProtocol = url.searchParams.get('affectedProtocol')?.trim() ?? '';

	return {
		query,
		tags,
		exploitType,
		affectedOs,
		affectedProtocol
	};
};

const parsePositiveInt = (value: string | null, fallback: number): number => {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
};

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

const parsePage = (url: URL): number => {
	return parsePositiveInt(url.searchParams.get('page'), 1);
};

const parsePageSize = (url: URL): number => {
	const raw = parsePositiveInt(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE);
	return clamp(raw, MIN_PAGE_SIZE, MAX_PAGE_SIZE);
};

export const load: PageServerLoad = async ({ url }) => {
	// Paginacja jest liczona po filtrowaniu; gdy strona poza zakresem, dociagamy ostatnia.
	const search = parseSearch(url);
	const requestedPage = parsePage(url);
	const pageSize = parsePageSize(url);
	let page = Math.max(1, requestedPage);

	let { threads, totalCount } = searchThreadsPaged(search, {
		page,
		pageSize,
		includeCount: true
	});

	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
	if (page > totalPages) {
		page = totalPages;
		({ threads } = searchThreadsPaged(search, {
			page,
			pageSize,
			includeCount: false
		}));
	}

	const tags = getAllTags();

	return {
		threads,
		tags,
		search,
		page,
		pageSize,
		totalCount,
		totalPages
	};
};
