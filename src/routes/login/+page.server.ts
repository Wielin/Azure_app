import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSession, getUserByIdentifier, verifyPassword } from '$lib/server/db';

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
		// Walidacja danych logowania i utworzenie sesji.
		const data = await request.formData();
		const identifier = String(data.get('identifier') ?? '').trim();
		const password = String(data.get('password') ?? '');

		if (!identifier || !password) {
			return fail(400, { error: 'Brak loginu lub hasla.' });
		}

		const user = getUserByIdentifier(identifier);
		if (!user || !verifyPassword(password, user.passwordHash)) {
			return fail(400, { error: 'Nieprawidlowe dane logowania.' });
		}

		const token = createSession(user.id);
		cookies.set('session', token, COOKIE_OPTIONS);

		throw redirect(303, '/');
	}
};
