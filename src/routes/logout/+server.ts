import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession } from '$lib/server/db';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('session');
	if (token) {
		deleteSession(token);
	}
	cookies.delete('session', { path: '/' });
	throw redirect(303, '/login');
};
