// ONE vocabulary for the entity categories, shared by every screen that names one.
// Until 2026-09-13 Review and Find each carried their own copy (audit B7): Find's had
// no 'protected' entry, so a protected term surfaced there as "Uncategorised" with the
// faint dot — the app disowning, on one screen, a row it had coloured on the other.
// A category with no label here is a bug, and catLabel() prints it as one rather than
// a soft default.
import type { Entity } from './store';

export const CAT_LABEL: Record<Entity['cat'], string> = { protected: 'Protected terms', person: 'People', org: 'Organizations', loc: 'Locations', id: 'IDs & contact', contact: 'IDs & contact', detail: 'Dates, amounts & details', term: 'Possible over-matches' };
export const CAT_ORDER = ['Protected terms', 'People', 'Organizations', 'Locations', 'IDs & contact', 'Dates, amounts & details', 'Possible over-matches'];
export const CAT_VAR: Record<Entity['cat'], string> = { protected: 'var(--c-protected)', person: 'var(--c-person)', org: 'var(--c-org)', loc: 'var(--c-loc)', id: 'var(--c-id)', contact: 'var(--c-contact)', detail: 'var(--c-date)', term: 'var(--c-term)' };
export const SP_CLASS: Record<Entity['cat'], string> = { protected: 'sp-protected', person: 'sp-person', org: 'sp-org', loc: 'sp-loc', id: 'sp-id', contact: 'sp-contact', detail: 'sp-term', term: 'sp-term' };
// Added-span tags mint in the engine's own format ([Person3], [Company2]) so
// the export mask and the name key stay one consistent scheme.
export const TAG_PREFIX: Record<Entity['cat'], string> = { person: 'Person', org: 'Company', loc: 'Address', id: 'Id', contact: 'Phone', detail: 'Detail', protected: 'Protected', term: 'Term' };

/** the label — or a loud "Uncategorised (x)" naming the value that has no entry, never a silent default */
export const catLabel = (cat: string): string => (CAT_LABEL as Record<string, string>)[cat] ?? `Uncategorised (${cat})`;
export const catColor = (cat: string): string => (CAT_VAR as Record<string, string>)[cat] ?? 'var(--faint)';
