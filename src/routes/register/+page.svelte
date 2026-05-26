<script lang="ts">
	let { form } = $props();
</script>

<svelte:head>
	<title>Rejestracja</title>
</svelte:head>

<section class="auth">
	<h1>Rejestracja</h1>
	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}
	<form method="POST">
		<label>
			Login
			<input name="username" autocomplete="username" required />
		</label>
		<label>
			Email
			<input type="email" name="email" autocomplete="email" required />
		</label>
		<label>
			Haslo
			<input type="password" name="password" autocomplete="new-password" required />
		</label>
		<label>
			Powtorz haslo
			<input type="password" name="confirm" autocomplete="new-password" required />
		</label>
		<button type="submit">Utworz konto</button>
	</form>
	<p class="hint">Masz konto? <a href="/login">Zaloguj sie</a>.</p>
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

	.error {
		color: #b91c1c;
		font-weight: 600;
	}

	.hint {
		margin: 0;
		color: #475569;
	}
</style>
