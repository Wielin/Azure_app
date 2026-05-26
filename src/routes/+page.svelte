<script lang="ts">
	let { data } = $props();
	const user = $derived(data.user);
	const role = $derived(user?.role ?? 'Guest');
	const search = $derived(data.search);
	const page = $derived(data.page);
	const pageSize = $derived(data.pageSize);
	const totalCount = $derived(data.totalCount);
	const totalPages = $derived(data.totalPages);

	type LiveSearchResult = {
		id: number;
		title: string;
		excerpt: string;
		cveId: string | null;
		createdAt: string;
		author: string;
	};

	type LiveSearchResponse = {
		results: LiveSearchResult[];
		totalCount: number;
	};

	const pageSizeOptions = [8, 16, 32];
	const pageSizeList = $derived(() => {
		const values = new Set(pageSizeOptions);
		values.add(pageSize);
		return Array.from(values).sort((a, b) => a - b);
	});
	const LIVE_MIN = 2;
	const LIVE_LIMIT = 6;
	const LIVE_DELAY = 250;

	let liveQuery = $state(search.query);
	let liveResults: LiveSearchResult[] = $state([]);
	let liveStatus: 'idle' | 'loading' | 'error' = $state('idle');
	let liveOpen = $state(false);
	let liveTotal = $state(0);
	let liveAbort: AbortController | null = null;
	let liveTimer: ReturnType<typeof setTimeout> | null = null;

	const buildPageUrl = (targetPage: number): string => {
		const params = new URLSearchParams();
		if (search.query) {
			params.set('q', search.query);
		}
		if (search.exploitType) {
			params.set('exploitType', search.exploitType);
		}
		if (search.affectedOs) {
			params.set('affectedOs', search.affectedOs);
		}
		if (search.affectedProtocol) {
			params.set('affectedProtocol', search.affectedProtocol);
		}
		for (const tag of search.tags) {
			params.append('tag', tag);
		}
		params.set('page', String(targetPage));
		params.set('pageSize', String(pageSize));
		return `/?${params.toString()}`;
	};

	const buildLiveSearchUrl = (term: string): string => {
		const params = new URLSearchParams();
		params.set('q', term);
		params.set('page', '1');
		params.set('pageSize', String(pageSize));
		return `/?${params.toString()}`;
	};

	const runLiveSearch = async (term: string): Promise<void> => {
		if (liveAbort) {
			liveAbort.abort();
		}

		liveAbort = new AbortController();
		liveStatus = 'loading';
		liveOpen = true;

		try {
			const params = new URLSearchParams({ q: term, limit: String(LIVE_LIMIT) });
			const response = await fetch(`/api/threads/search?${params.toString()}`, {
				signal: liveAbort.signal
			});

			if (!response.ok) {
				throw new Error('Live search failed');
			}

			const payload = (await response.json()) as LiveSearchResponse;
			liveResults = payload.results;
			liveTotal = payload.totalCount;
			liveStatus = 'idle';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}
			liveStatus = 'error';
		}
	};

	const handleLiveInput = (): void => {
		if (liveTimer) {
			clearTimeout(liveTimer);
		}

		const term = liveQuery.trim();
		if (term.length < LIVE_MIN) {
			liveResults = [];
			liveTotal = 0;
			liveStatus = 'idle';
			liveOpen = false;
			return;
		}

		liveTimer = setTimeout(() => {
			void runLiveSearch(term);
		}, LIVE_DELAY);
	};

	$effect(() => {
		liveQuery = search.query;
		liveResults = [];
		liveTotal = 0;
		liveStatus = 'idle';
		liveOpen = false;
	});

	const startIndex = $derived(totalCount === 0 ? 0 : (page - 1) * pageSize + 1);
	const endIndex = $derived(totalCount === 0 ? 0 : Math.min(totalCount, page * pageSize));
</script>

<svelte:head>
	<title>Exploit DB</title>
</svelte:head>

<section class="hero">
	<div class="hero-copy">
		<p class="eyebrow">Exploit DB</p>
		<h1>Forum wpisow o exploitach i ochronie</h1>
		<p>
			Baza wpisow o CVE, wektorach ataku i metodach ochrony. Wyszukuj po tagach,
			typie, OS i protokole.
		</p>
		<div class="hero-meta">
			<span class="pill">Rola: {role}</span>
			{#if user}
				<span class="muted">Zalogowany: {user.username}</span>
			{:else}
				<a class="pill-link" href="/login">Logowanie</a>
				<a class="pill-link" href="/register">Rejestracja</a>
			{/if}
		</div>
	</div>

	<form method="GET" class="search-card">
		<input type="hidden" name="page" value="1" />
		<div class="field live-field">
			<label for="q">Fraza</label>
			<input
				id="q"
				name="q"
				type="search"
				placeholder="CVE-2024-XXXX, nazwa, technika"
				bind:value={liveQuery}
				on:input={handleLiveInput}
			/>
			{#if liveOpen}
				<div class="live-panel" aria-live="polite">
					{#if liveStatus === 'loading'}
						<p class="live-status">Szukam...</p>
					{:else if liveStatus === 'error'}
						<p class="live-status error">Nie udalo sie pobrac wynikow.</p>
					{:else if liveResults.length === 0}
						<p class="live-status">Brak wynikow.</p>
					{:else}
						<ul class="live-list">
							{#each liveResults as result}
								<li class="live-item">
									<div class="live-title-row">
										<span class="live-title">{result.title}</span>
										{#if result.cveId}
											<span class="badge">{result.cveId}</span>
										{/if}
									</div>
									<p class="live-excerpt">{result.excerpt}</p>
									<span class="live-meta">
										Autor {result.author} · {result.createdAt}
									</span>
								</li>
							{/each}
						</ul>
						<div class="live-footer">
							<span>{liveTotal} wynikow</span>
							<a class="live-more" href={buildLiveSearchUrl(liveQuery.trim())}>
								Pokaz wszystkie
							</a>
						</div>
					{/if}
				</div>
			{/if}
		</div>
		<div class="grid-3">
			<label>
				Typ exploita
				<input name="exploitType" placeholder="RCE, LPE" value={search.exploitType} />
			</label>
			<label>
				OS
				<input name="affectedOs" placeholder="Windows, Linux" value={search.affectedOs} />
			</label>
			<label>
				Protokol
				<input
					name="affectedProtocol"
					placeholder="HTTP, SMB"
					value={search.affectedProtocol}
				/>
			</label>
		</div>
		<fieldset class="tag-fieldset">
			<legend>Tagi</legend>
			<div class="tag-list">
				{#each data.tags as tag}
					<label class="tag-check">
						<input
							type="checkbox"
							name="tag"
							value={tag.name}
							checked={search.tags.includes(tag.name)}
						/>
						<span>{tag.name}</span>
					</label>
				{/each}
			</div>
		</fieldset>
		<div class="grid-2">
			<label>
				Wyniki na strone
				<select name="pageSize">
					{#each pageSizeList as size}
						<option value={size} selected={size === pageSize}>
							{size}
						</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="search-actions">
			<button type="submit" class="primary">Szukaj</button>
			<a class="ghost" href="/">Wyczysc</a>
		</div>
	</form>
</section>

<section class="results">
	<div class="section-head">
		<h2>Wyniki</h2>
		<span class="count">
			{#if totalCount === 0}
				0 wpisow
			{:else}
				Pokazuje {startIndex}-{endIndex} z {totalCount}
			{/if}
		</span>
	</div>
	{#if totalCount === 0}
		<p class="empty">Brak wpisow dla podanych filtrow.</p>
	{:else}
		<div class="thread-grid">
			{#each data.threads as thread, index}
				<article class="thread-card" style={`--delay: ${index * 0.05}s`}>
					<header class="thread-header">
						<div>
							<h3>{thread.title}</h3>
							<p class="meta">
								Autor {thread.author} · {thread.createdAt}
							</p>
						</div>
						{#if thread.cveId}
							<span class="badge">{thread.cveId}</span>
						{/if}
					</header>
					<p class="summary">{thread.summary ?? thread.excerpt}</p>
					{#if thread.tags.length > 0}
						<div class="pill-row">
							{#each thread.tags as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					{/if}
					<div class="meta-grid">
						<div>
							<span>Typ</span>
							<strong>{thread.exploitType ?? '-'}</strong>
						</div>
						<div>
							<span>OS</span>
							<strong>{thread.affectedOs ?? '-'}</strong>
						</div>
						<div>
							<span>Protokol</span>
							<strong>{thread.affectedProtocol ?? '-'}</strong>
						</div>
						<div>
							<span>CVSS</span>
							<strong>
								{thread.cvssScore === null ? '-' : thread.cvssScore.toFixed(1)}
							</strong>
						</div>
					</div>
				</article>
			{/each}
		</div>
		{#if totalPages > 1}
			<nav class="pagination" aria-label="Paginacja">
				<span class="pager-info">Strona {page} z {totalPages}</span>
				<div class="pager-actions">
					{#if page > 1}
						<a class="pager-btn" href={buildPageUrl(page - 1)}>Poprzednia</a>
					{:else}
						<span class="pager-btn disabled">Poprzednia</span>
					{/if}
					{#if page < totalPages}
						<a class="pager-btn" href={buildPageUrl(page + 1)}>Nastepna</a>
					{:else}
						<span class="pager-btn disabled">Nastepna</span>
					{/if}
				</div>
			</nav>
		{/if}
	{/if}
</section>

<style>
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 380px);
		gap: 24px;
		align-items: start;
		margin-bottom: 32px;
	}

	.hero-copy {
		background: rgba(255, 255, 255, 0.78);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 24px;
		box-shadow: var(--shadow);
		animation: fadeUp 0.7s ease both;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		font-size: 12px;
		color: var(--ink-500);
		margin: 0 0 8px;
	}

	.hero h1 {
		font-size: 32px;
		margin: 0 0 12px;
	}

	.hero p {
		margin: 0;
		color: var(--ink-700);
	}

	.hero-meta {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
		margin-top: 16px;
	}

	.pill,
	.pill-link {
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid rgba(15, 23, 42, 0.2);
		font-weight: 600;
		font-size: 14px;
		text-decoration: none;
		color: var(--ink-900);
		background: #fff;
	}

	.pill-link {
		border-color: rgba(15, 23, 42, 0.1);
		color: var(--brand-700);
	}

	.search-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 20px;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		gap: 16px;
		animation: fadeUp 0.7s ease both;
		animation-delay: 0.05s;
	}

	.field label,
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 600;
		color: var(--ink-700);
	}

	.search-card input,
	.search-card select,
	.search-card textarea,
	.create-form input,
	.create-form textarea {
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		font-family: inherit;
		font-size: 14px;
		background: #fff;
	}

	.search-card input:focus,
	.search-card select:focus,
	.create-form input:focus,
	.create-form textarea:focus,
	.search-card textarea:focus {
		outline: 2px solid rgba(249, 115, 22, 0.3);
		border-color: rgba(249, 115, 22, 0.55);
	}

	.live-field {
		position: relative;
	}

	.live-panel {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(100% + 6px);
		background: #fff;
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 12px;
		box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
		z-index: 5;
		display: grid;
		gap: 10px;
	}

	.live-status {
		margin: 0;
		font-size: 14px;
		color: var(--ink-600);
	}

	.live-status.error {
		color: #b91c1c;
		font-weight: 600;
	}

	.live-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}

	.live-item {
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid rgba(15, 23, 42, 0.08);
		background: var(--surface-alt);
		display: grid;
		gap: 6px;
	}

	.live-title-row {
		display: flex;
		gap: 8px;
		align-items: center;
		justify-content: space-between;
	}

	.live-title {
		font-weight: 700;
		color: var(--ink-900);
		font-size: 14px;
	}

	.live-excerpt {
		margin: 0;
		font-size: 13px;
		color: var(--ink-700);
	}

	.live-meta {
		font-size: 12px;
		color: var(--ink-500);
	}

	.live-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		color: var(--ink-500);
	}

	.live-more {
		font-weight: 700;
		color: var(--brand-700);
		text-decoration: none;
	}

	.grid-3 {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}

	.grid-2 {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.tag-fieldset {
		border: 1px dashed var(--line);
		border-radius: 16px;
		padding: 12px;
		margin: 0;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.tag-check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--surface-alt);
		font-weight: 600;
	}

	.tag-check input {
		accent-color: var(--brand-500);
	}

	.search-actions {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}

	.primary {
		background: var(--brand-500);
		color: #fff;
		border: none;
		border-radius: 999px;
		padding: 10px 18px;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 10px 18px rgba(249, 115, 22, 0.25);
	}

	.ghost {
		background: transparent;
		border: 1px solid rgba(15, 23, 42, 0.2);
		color: var(--ink-900);
		border-radius: 999px;
		padding: 8px 16px;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}

	.results {
		display: flex;
		flex-direction: column;
		gap: 20px;
		margin-bottom: 32px;
	}

	.pagination {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-radius: 14px;
		border: 1px solid var(--line);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.pager-info {
		font-weight: 600;
		color: var(--ink-700);
	}

	.pager-actions {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.pager-btn {
		padding: 8px 14px;
		border-radius: 999px;
		border: 1px solid rgba(15, 23, 42, 0.2);
		background: #fff;
		font-weight: 700;
		color: var(--ink-900);
		text-decoration: none;
	}

	.pager-btn.disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		flex-wrap: wrap;
	}

	.section-head h2 {
		margin: 0;
		font-size: 24px;
	}

	.count {
		color: var(--ink-500);
		font-weight: 600;
	}

	.thread-grid {
		display: grid;
		gap: 18px;
	}

	.thread-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
		animation: rise 0.6s ease both;
		animation-delay: var(--delay);
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.thread-header {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		align-items: start;
	}

	.thread-header h3 {
		margin: 0 0 6px;
		font-size: 20px;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.meta {
		margin: 0;
		color: var(--ink-500);
		font-size: 14px;
		overflow-wrap: anywhere;
	}

	.summary {
		margin: 0;
		color: var(--ink-700);
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.tag {
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(20, 184, 166, 0.12);
		color: #0f766e;
		font-weight: 600;
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 10px;
	}

	.meta-grid span {
		color: var(--ink-500);
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.meta-grid strong {
		font-family: var(--font-mono);
		font-size: 14px;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.badge {
		padding: 6px 10px;
		border-radius: 10px;
		background: rgba(249, 115, 22, 0.15);
		color: var(--brand-700);
		font-weight: 700;
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.badge.success {
		background: rgba(20, 184, 166, 0.18);
		color: #0f766e;
	}

	.muted {
		color: var(--ink-500);
		margin: 0;
	}

	.empty {
		margin: 0;
		color: var(--ink-500);
	}

	@keyframes fadeUp {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 980px) {
		.hero {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 720px) {
		.grid-3,
		.grid-2 {
			grid-template-columns: 1fr;
		}
		.thread-header {
			flex-direction: column;
			align-items: flex-start;
		}
		.pagination {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
