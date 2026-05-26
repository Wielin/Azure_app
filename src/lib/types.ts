export type SessionUser = {
	id: number;
	username: string;
	email: string;
	role: string;
};

export type LayoutData = {
	user: SessionUser | null;
};

export type TagOption = {
	id: number;
	name: string;
};

export type ThreadSummary = {
	id: number;
	title: string;
	summary: string | null;
	mainContent: string;
	excerpt: string;
	author: string;
	authorId: number;
	createdAt: string;
	views: number;
	cveId: string | null;
	cvssScore: number | null;
	affectedOs: string | null;
	affectedProtocol: string | null;
	exploitType: string | null;
	escalationSteps: string | null;
	mitigation: string | null;
	patchUrl: string | null;
	tags: string[];
	linksText?: string;
};

export type ThreadSearch = {
	query: string;
	tags: string[];
	exploitType: string;
	affectedOs: string;
	affectedProtocol: string;
};

export type UserSummary = {
	id: number;
	username: string;
	email: string;
	role: string;
};
