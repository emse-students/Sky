/**
 * Utility functions for formatting and displaying data
 */

import type { Person } from '$types/graph';

/**
 * Generate full name from first_name and last_name
 * Format: "LAST_NAME First_name"
 */
export function getPersonName(person: Person): string {
	if (!person.nom || !person.prenom) {
		return person.id; // Fallback to ID if missing
	}
	return `${person.nom.toUpperCase()} ${person.prenom}`;
}

/**
 * Generate initials from person's name
 */
export function getPersonInitials(person: Person): string {
	if (!person.nom || !person.prenom) {
		return '?';
	}
	return `${person.prenom.charAt(0)}${person.nom.charAt(0)}`.toUpperCase();
}
