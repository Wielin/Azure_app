<script lang="ts">
	let { form } = $props();
</script>

<svelte:head>
	<title>Logowanie</title>
</svelte:head>

<section class="auth">
	<h1>Logowanie</h1>
	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}
	<form method="POST">
		<label>
			Login lub email
			<input name="identifier" autocomplete="username" required />
		</label>
		<label>
			Haslo
			<input type="password" name="password" autocomplete="current-password" required />
		</label>
		<button type="submit">Zaloguj</button>
	</form>
	<form method="POST" action="/guest" class="guest">
		<button type="submit">Kontynuuj jako Guest</button>
	</form>
	<p class="hint">
		Nie masz konta? <a href="/register">Zarejestruj sie</a>.
	</p>
</section>

<style>
	.auth {
		max-width: 480px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
		background: #fff;
		padding: 28px;
		border-radius: 16px;
		box-shadow: 0 10px 24px rgba(16, 22, 40, 0.08);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-weight: 600;
	}

	input {
		padding: 10px 12px;
		border-radius: 8px;
		border: 1px solid #cbd5f5;
	}

	button {
		padding: 10px 16px;
		border-radius: 8px;
		border: none;
		background: #1d4ed8;
		color: #fff;
		font-weight: 600;
		cursor: pointer;
	}

	.guest button {
		background: #111827;
	}

	.error {
		color: #b91c1c;
		font-weight: 600;
	}

	.hint {
		margin: 0;
		color: #475569;
	}
</style>
