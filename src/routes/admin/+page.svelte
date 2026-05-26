<script lang="ts">
	let { data, form } = $props();
	const user = $derived(data.user);
	const role = $derived(user?.role ?? 'Guest');
	const canManage = $derived(data.canManage);
</script>

<svelte:head>
	<title>Panel admina</title>
</svelte:head>

<section class="admin">
	<div class="section-head">
		<div>
			<h1>Panel admina</h1>
			<p class="muted">Zarzadzanie uprawnieniami kont.</p>
		</div>
		<span class="pill">Rola: {role}</span>
	</div>

	{#if !canManage}
		<div class="locked">
			<h2>Brak uprawnien</h2>
			<p class="muted">Tylko Admin moze zmieniac role kont.</p>
		</div>
	{:else}
		<div class="section-head">
			<h2>Uprawnienia kont</h2>
			<p class="muted">Nadaj role Contributor dla kont User.</p>
		</div>
		{#if form?.formId === 'updateRole' && form.error}
			<p class="form-error">{form.error}</p>
		{/if}
		{#if form?.formId === 'updateRole' && form.success}
			<p class="form-success">Rola zaktualizowana.</p>
		{/if}
		{#if data.users.length === 0}
			<p class="empty">Brak kont do zmiany.</p>
		{:else}
			<div class="user-list">
				{#each data.users as account}
					<div class="user-card">
						<div>
							<p class="name">{account.username}</p>
							<p class="muted">{account.email}</p>
							<span class="role">{account.role}</span>
						</div>
						{#if account.role === 'Contributor'}
							<form method="POST" action="?/updateRole">
								<input type="hidden" name="userId" value={account.id} />
								<input type="hidden" name="role" value="User" />
								<button type="submit" class="ghost">Odbierz Contributor</button>
							</form>
						{:else}
							<form method="POST" action="?/updateRole">
								<input type="hidden" name="userId" value={account.id} />
								<input type="hidden" name="role" value="Contributor" />
								<button type="submit" class="ghost">Nadaj Contributor</button>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>

<style>
	.admin {
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 22px;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		gap: 18px;
		animation: fadeUp 0.6s ease both;
	}

	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		flex-wrap: wrap;
	}

	.section-head h1,
	.section-head h2 {
		margin: 0;
	}

	.section-head h1 {
		font-size: 28px;
	}

	.pill {
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid rgba(15, 23, 42, 0.2);
		font-weight: 600;
		font-size: 14px;
		color: var(--ink-900);
		background: #fff;
	}

	.user-list {
		display: grid;
		gap: 12px;
		margin-top: 8px;
	}

	.user-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 16px;
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.user-card .name {
		margin: 0;
		font-weight: 700;
	}

	.user-card .role {
		display: inline-block;
		margin-top: 4px;
		font-size: 12px;
		color: var(--ink-500);
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

	.form-error {
		color: #b91c1c;
		font-weight: 600;
		margin: 8px 0;
	}

	.form-success {
		color: #0f766e;
		font-weight: 600;
		margin: 8px 0;
	}

	.muted {
		color: var(--ink-500);
		margin: 0;
	}

	.empty {
		margin: 0;
		color: var(--ink-500);
	}

	.locked {
		text-align: center;
		padding: 20px;
		border: 1px dashed var(--line);
		border-radius: 16px;
		background: var(--surface);
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

	@media (max-width: 720px) {
		.user-card {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
