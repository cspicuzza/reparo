/**
 * Nothing in Reparo is a sign-in, so password managers are told to leave every field alone
 * (OD-87): 1Password reads `data-1p-ignore`, LastPass `data-lpignore`, Dashlane
 * `data-form-type`. Without it, 1Password offers to fill every field called Name. index.html
 * also puts `data-1p-ignore` on <body>, which 1Password applies to the whole page:
 * https://www.1password.dev/web/compatible-website-design (checked 2026-10-15).
 */
export const NOT_A_LOGIN = {
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const;
