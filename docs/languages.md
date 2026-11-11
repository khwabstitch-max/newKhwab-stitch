# English and Hindi

The top-bar selector is available on public, customer and admin pages, including when mobile navigation is closed. Choose English or हिन्दी. English is the initial default. The preference is stored under `khwab.language` in localStorage; it survives reloads and synchronizes between tabs. Browsers that block storage can still switch languages for the current page session. Unsupported saved values fall back to English.

Switching updates React text without remounting forms. Draft values, selected steps, credentials and request retry keys are preserved. The document language, native validation messages, dates, currency and enum labels update. API paths, IDs, enum values, measurement units, prices in paise and authorization remain unchanged. The built-in brand seal/wordmark remains the supplied brand identity.

## Entering content in both languages

- Designs: English title/description plus optional `titleHi` / `descriptionHi`.
- Categories and design options: English name plus optional `nameHi`.
- Website content: optional `taglineHi`, `announcementHi`, `aboutHi`. FAQ entries accept `questionHi` and `answerHi`.
- Quotes and progress: optional `notesHi` and `noteHi`.

Existing English fields remain required where they were required before. Hindi fields are optional, trimmed and bounded by the same applicable length limits. Blank Hindi text falls back to the original English text. Built-in/demo phrases have bundled Hindi translations; arbitrary owner content needs a Hindi entry from the owner. There is no automatic translation service or external language API.

Customer names, email addresses, phone numbers, addresses, filenames and free-text instructions remain exactly as provided. Canonical design-option values remain English for stable API requests. New receipts snapshot the Hindi design title and matching active option labels under `designSnapshot.titleHi` and `preferenceLabelsHi`; later catalogue edits cannot rewrite those snapshots. Existing receipts use their stored content and bundled phrase translations. Account deletion clears Hindi quote/progress notes and translated preference snapshots along with the corresponding English fields; the deletion integration test verifies this.

## Implementation and maintenance

The dictionary is in `client/src/i18n/catalog.js`; the store/formatting helpers are in `core.js`, and React subscriptions, selector and native validation are in `Language.jsx`. Components subscribe using `useLanguage()`, render interface strings through `t()`, and render bilingual business content through `localize(record, field)`. Backend validation remains canonical and is translated when displayed; error details distinguish numbers, string lengths, item counts and measurements. React escapes rendered strings. No DOM rewriting or page reload is used for language changes.

No new dependency, environment variable, index or data migration is required. Optional model fields do not modify existing records. The development seed supplies Hindi text on future inserts only and is not needed for this update. No live database edits were performed for this feature.

## Verification — 2026-11-06

59 frontend tests pass, including 16 language tests covering storage restrictions, templates, fallback, formats, backend errors, native validity, cross-tab changes, input preservation, request steps, admin editors and bilingual receipts. All 74 backend tests pass, including real temporary-Mongo tests for public Hindi projection/search, strict bounds, settings/FAQs, snapshots and quote/progress content. Frontend and server lint/build checks pass.

Actual Chrome production-build checks cover English public pages at 320/390/768/1024px, Hindi public pages at 320/390/768/1024/1440px, persisted selection after navigation/reload, Hindi native validation, form preservation, keyboard navigation and authentication gates. Real JWT registration/restoration/logout/admin checks use an isolated temporary database; ImageKit is mocked. Screenshots are written to ignored `artifacts/home-hindi-390.png` and `artifacts/home-hindi-1440.png`. This does not verify live ImageKit, a deployed service or every device/browser.
