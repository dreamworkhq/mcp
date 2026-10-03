/** Ownership updates accepted by the admin support inbox. */
export type AdminSupportAssignment = "me" | "none" | { adminUserId: string };

export type AdminSupportAssignee = { id: string; email: string; name: string | null };
