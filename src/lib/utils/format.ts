/**
 * Utility functions for formatting and displaying data
 */

import type { Person } from "$types/graph";

/**
 * Generate full name from first_name and last_name
 * Format: "LAST_NAME First_name"
 */
export function getPersonName(person: Person): string {
  const nom = (person.nom ?? "").trim();
  const prenom = (person.prenom ?? "").trim();
  if (nom && prenom) {
    return `${nom.toUpperCase()} ${prenom}`;
  }
  // Jamais d id brut a l ecran : on montre ce qu on a, sinon un libelle neutre.
  return nom.toUpperCase() || prenom || "Sans nom";
}

/**
 * Generate initials from person's name
 */
export function getPersonInitials(person: Person): string {
  if (!person.nom || !person.prenom) {
    return "?";
  }
  return `${person.prenom.charAt(0)}${person.nom.charAt(0)}`.toUpperCase();
}

/**
 * Normalise un nom ou prenom pour comparaison tolerante : minuscule, sans
 * accents, tirets/underscores ramenes a des espaces, espaces compactes.
 *
 * Sert a relier une identite Authentik a une fiche `people` existante via la cle
 * quasi-unique (nom, prenom, promotion) malgre les variations de casse/accents
 * entre le SSO et la base.
 */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
