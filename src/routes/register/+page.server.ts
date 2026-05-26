import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSession, createUser, hashPassword, isEmailTaken, isUsernameTaken } from '$lib/server/db';

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production',
	maxAge: 60 * 60 * 24 * 7
};

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(303, '/');
	}

	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		// Walidacja danych rejestracji, tworzenie uzytkownika i sesji.
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm') ?? '');

		if (!username || !email || !password || !confirm) {
			return fail(400, { error: 'Wypelnij wszystkie pola.' });
		}

		if (password.length < 6) {
			return fail(400, { error: 'Haslo musi miec min. 6 znakow.' });
		}

		if (password !== confirm) {
			return fail(400, { error: 'Hasla nie sa takie same.' });
		}

		if (isUsernameTaken(username)) {
			return fail(400, { error: 'Login jest zajety.' });
		}

		if (isEmailTaken(email)) {
			return fail(400, { error: 'Email jest zajety.' });
		}

		const passwordHash = hashPassword(password);
		const userId = createUser({ username, email, passwordHash, roleName: 'User' });
		const token = createSession(userId);
		cookies.set('session', token, COOKIE_OPTIONS);

		throw redirect(303, '/');
	}
};
