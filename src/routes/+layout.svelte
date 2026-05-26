<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutData } from '$lib/types';

	let { data, children } = $props<{ data: LayoutData }>();
	const user = $derived(data.user);
	const role = $derived(user?.role ?? 'Guest');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="page">
	<header class="site-header">
		<a class="brand" href="/">Exploit DB</a>
		<nav class="nav">
			<a href="/">Start</a>
			{#if role === 'Contributor' || role === 'Admin'}
				<a href="/contribute">Panel wpisow</a>
			{/if}
			{#if role === 'Admin'}
				<a href="/admin">Admin</a>
			{/if}
			{#if user}
				<span class="user">Zalogowany: {user.username} ({role})</span>
				<form method="POST" action="/logout">
					<button type="submit">Wyloguj</button>
				</form>
			{:else}
				<a href="/login">Logowanie</a>
				<a href="/register">Rejestracja</a>
				<form method="POST" action="/guest">
					<button type="submit">Guest</button>
				</form>
			{/if}
		</nav>
	</header>
	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');

	:global(:root) {
		--ink-900: #111827;
		--ink-700: #334155;
		--ink-500: #64748b;
		--brand-700: #c2410c;
		--brand-500: #f97316;
		--accent-500: #14b8a6;
		--surface: #ffffff;
		--surface-alt: #fff7ed;
		--line: #e2e8f0;
		--shadow: 0 14px 30px rgba(15, 23, 42, 0.12);
		--font-body: 'Space Grotesk', 'Segoe UI', sans-serif;
		--font-mono: 'JetBrains Mono', 'Consolas', monospace;
	}

	:global(body) {
		margin: 0;
		font-family: var(--font-body);
		background: linear-gradient(135deg, #fef3c7 0%, #e0f2fe 45%, #dcfce7 100%);
		color: var(--ink-900);
	}

	:global(body)::before {
		content: '';
		position: fixed;
		inset: 0;
		background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.75), transparent 55%),
			radial-gradient(circle at 80% 10%, rgba(255, 247, 237, 0.65), transparent 45%),
			radial-gradient(circle at 70% 80%, rgba(236, 254, 255, 0.7), transparent 55%);
		pointer-events: none;
		z-index: -1;
	}

	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.site-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		background: linear-gradient(120deg, #0f172a 0%, #1f2937 100%);
		color: #f8fafc;
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
	}

	.brand {
		font-weight: 700;
		font-size: 18px;
		text-decoration: none;
		color: inherit;
		letter-spacing: 0.02em;
	}

	.nav {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
	}

	.nav a {
		color: #fde68a;
		text-decoration: none;
		font-weight: 600;
	}

	.nav form {
		margin: 0;
	}

	.nav button {
		border: 1px solid rgba(255, 255, 255, 0.4);
		background: transparent;
		color: #f8fafc;
		padding: 6px 12px;
		border-radius: 999px;
		cursor: pointer;
		font-weight: 600;
	}

	.user {
		color: #fef3c7;
		font-weight: 600;
		background: rgba(248, 250, 252, 0.1);
		padding: 4px 10px;
		border-radius: 999px;
	}

	.content {
		padding: 32px 24px 48px;
		max-width: 1120px;
		width: 100%;
		margin: 0 auto;
	}
</style>

