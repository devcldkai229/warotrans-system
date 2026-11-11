# Web console: English / Tiếng Việt

The web console can be used in English or Vietnamese. The choice is in the user menu (and on the sign-in page), it is
saved in `localStorage` (`warotrans.language`), and a browser whose language is Vietnamese starts in Vietnamese.

Changing the language saves it and **reloads the page**, so the language is fixed for the life of a page and `t()` can be
called anywhere, module-level constants included. No library is used: `web/src/shared/i18n/`.

## Writing text

The English sentence is the key.

```tsx
import { t } from '@/shared/i18n'

<Button>{t('Save changes')}</Button>
<p>{t('Showing {shown} of {total}', { shown: items.length, total })}</p>
aria-label={t('Filter by status')}
```

- `{name}` placeholders are filled from the second argument. Keep a whole sentence in one `t()` call, not pieces.
- A sentence with no Vietnamese entry shows in English, so a missing entry never breaks a screen.
- Backend enum values (`IN_PROGRESS`) go through `humanize()`, which translates the English words ("In progress").
- `msg('…')` marks a sentence that is stored now and shown later: `const LABEL = { A: msg('Alpha') }`, then `t(LABEL[x])`.
- Do not translate: data written to the database (generated codes, default names), CSS classes, route paths, debug-only
  overlays, or the Vietnamese print layout of a stock voucher (`management/stockVouchers.ts`).

## Adding the Vietnamese

Add `'English sentence': 'Câu tiếng Việt'` to the matching file in `web/src/shared/i18n/vi/` (one file per area). A
Vietnamese sentence may leave out a placeholder (Vietnamese has no plural suffix) but must not add one.

`shared/i18n/i18n.test.ts` fails when a `t('…')` or `msg('…')` sentence in the source has no Vietnamese entry, when a
translation invents a placeholder, or when a status in `statusTones.ts` has no Vietnamese word.

## What is not translated

Text the backend stores or sends as free text stays as it was written: notification titles and bodies, product and
category names, workflow descriptions and step names, and the operation catalog's descriptions. Error messages from the
API are translated by their **error code** (`vi/serverErrors.ts`); the quoted values of the server's message (`'JOB-1'`)
fill `{q1}`, `{q2}` in the Vietnamese sentence. An error without a code in that table shows the server's wording.

Numbers and dates follow the language through `getLocale()` (`en-US` / `vi-VN`).
