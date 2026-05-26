import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listUsers, updateUserRole } from '$lib/server/db';

const ROLE_ADMIN = 'Admin';
const ROLE_CONTRIBUTOR = 'Contributor';
const ROLE_USER = 'User';

const readText = (value: FormDataEntryValue | null): string => {
	return typeof value === 'string' ? value.trim() : '';
};

export const load: PageServerLoad = async ({ locals }) => {
	// Tylko admin widzi liste uzytkownikow do zarzadzania rolami.
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	const canManage = locals.user.role === ROLE_ADMIN;
	const users = canManage
		? listUsers().filter((user) => user.role !== ROLE_ADMIN)
		: [];

	return {
		canManage,
		users
	};
};

export const actions: Actions = {
	updateRole: async ({ request, locals }) => {
		// Waliduje role i uzytkownika przed zapisem.
		if (!locals.user || locals.user.role !== ROLE_ADMIN) {
			return fail(403, {
				formId: 'updateRole',
				error: 'Brak uprawnien do zmiany rol.'
			});
		}

		const data = await request.formData();
		const userId = Number(data.get('userId'));
		const roleName = readText(data.get('role'));

		if (!Number.isInteger(userId) || userId <= 0) {
			return fail(400, {
				formId: 'updateRole',
				error: 'Niepoprawne konto.'
			});
		}

		if (![ROLE_CONTRIBUTOR, ROLE_USER].includes(roleName)) {
			return fail(400, {
				formId: 'updateRole',
				error: 'Mozesz nadac lub odebrac role Contributor.'
			});
		}

		const users = listUsers();
		const target = users.find((user) => user.id === userId);
		if (!target) {
			return fail(404, {
				formId: 'updateRole',
				error: 'Uzytkownik nie istnieje.'
			});
		}

		if (target.role === ROLE_ADMIN) {
			return fail(403, {
				formId: 'updateRole',
				error: 'Nie mozna zmienic roli Admina.'
			});
		}

		if (target.role === roleName) {
			return fail(400, {
				formId: 'updateRole',
				error: 'Ten uzytkownik juz ma te role.'
			});
		}

		updateUserRole(userId, roleName);

		return {
			formId: 'updateRole',
			success: true,
			updatedUserId: userId
		};
	}
};
