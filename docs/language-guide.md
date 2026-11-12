# Language guide

English and Hindi share one React language store. The selector persists `en` or `hi` under `khwab.language`, updates the document language and synchronizes storage changes between browser tabs. Storage-disabled browsers keep an in-memory preference. Switching language updates subscribed components; it does not deliberately reload the route, remount the request flow, sign out a customer, change prices or translate entered information.

## Copy ownership

Use `t("public.nav.search")` and other stable semantic keys for new interface copy. `public-experience.js`, `admin-experience.js` and `experienceCopy` in `experience.js` provide English/Hindi descriptors. A descriptor may hold plural forms: `t("account.messages.unread", { count })` selects the locale's form using `Intl.PluralRules`. Named and numbered placeholders are substituted after selecting the language.

Existing English phrase keys remain supported in `catalog.js`, `enhancements.js`, `commerce.js` and `experience.js`. This preserves old call sites and historical built-in display labels. `translationCatalogue` and `semanticCatalogue` in `core.js` are the merged sources; avoid adding a second language store or converting business enum values into translated strings.

Do not pass customer messages, notes, names, addresses, design codes, offer codes, filenames, API paths, IDs or stored enum values through an automatic translation service. There is no automatic translation provider. Translate the known label surrounding an identifier, while displaying the identifier intact. `labelToken()` maps supported enum labels for display; the original value remains in requests and records.

## Working glossary

| English concept | Hindi interface copy |
| --- | --- |
| Design | डिज़ाइन |
| Catalogue | डिज़ाइन संग्रह |
| Sleeve Design | आस्तीन का डिज़ाइन |
| Sleeve Length | आस्तीन की लंबाई |
| Front Neck Design | आगे के गले का डिज़ाइन |
| Back Neck Design | पीछे के गले का डिज़ाइन |
| Extra Add-ons | अतिरिक्त विकल्प |
| Measurements | नाप |
| Bust | सीना (बस्ट) |
| Sign in | साइन इन करें |
| Published | प्रकाशित |
| Review details | समीक्षा / जाँचें, according to the action |
| Draft | मसौदा in the descriptive admin status; legacy short labels also use ड्राफ़्ट |

Write instructions as complete sentences in the selected language. Keep service/provider names such as Google and WhatsApp, currency/unit codes, and the supplied brand identity recognizable. A sleeve-length illustration describes a style preference; it must not promise every sleeve design is compatible with every length. Sleeve length has no surcharge.

## Authored catalogue and policy content

The owner supplies the English field and its corresponding `Hi` field, such as `title`/`titleHi`, `name`/`nameHi`, `description`/`descriptionHi`, and FAQ question/answer pairs. The legacy `localize(record, field)` helper uses the available Hindi text and falls back to the English field/bundled known phrase. Arbitrary authored English cannot become a Hindi translation merely by being passed to this helper.

`contentTranslation(record, field)` returns `{ text, sourceLanguage, missingTranslation }`. Use this for authored blocks that need an explicit fallback notice. Policy cards use the selected authored field, and display a Hindi notice when its English original is shown because the Hindi field is absent. Quote descriptions and customer-entered content remain in their original language with appropriate explanatory copy.

The homepage has stricter rules to avoid mixed-language promotions. `homepageBlock()` uses an owner's hero/help block only when all fields for the selected language are present; otherwise the whole block uses the approved built-in copy for that language. `eligibleHomepageSlides()` hides a slide if its title, description or action label is missing in the selected language. Offer slides also require translated offer terms and programme terms. This may produce different eligible slide counts in English and Hindi. Publication settings still require the applicable bilingual fields on newly activated slides.

Historic order snapshots remain historic. Catalogue translation edits do not rewrite accepted quotes, customer text, or old order selections.

## Formatting and typography

Use the shared currency/date functions rather than concatenating formatted values in screen components. Money remains integer paise in the API. Percentages remain basis points; the owner-facing editor converts decimal percentage input. Offer scheduling inputs explicitly use India time (`Asia/Kolkata`, UTC+05:30), independently of the browser's timezone. Measurement units remain the customer's explicit inches/cm choice.

`tokens.css` defines a system body-font stack with Segoe UI/Nirmala UI/Mangal fallbacks, and Georgia with Devanagari fallbacks for headings. Hindi controls/headings have larger line height to make room for matras. Verify actual rendered text at narrow widths and increased zoom; font availability differs by device.

## Repeatable static audit

From the repository root, after installing the locked client development dependencies:

```powershell
node scripts/language-audit.mjs --report artifacts/language-audit.json
node scripts/language-audit.mjs --strict --report artifacts/language-audit.json
```

The script uses the existing ESLint parser, reads application source under `client/src`, and imports only the six static dictionary modules. It does not load the application, environment files, providers or a database. It excludes tests, generated output and symbolic links. Its report lists each missing literal `t(...)` phrase and common literal JSX copy prop with filename/line, validates both language forms of semantic descriptors, checks placeholder parity, and flags replacement characters, question-mark corruption and common encoding corruption in the dictionary sources. `--strict` additionally exits unsuccessfully when literal coverage is missing. Reports remain inside ignored repository `artifacts`.

The strict audit passed on 12 November 2026: 1,304 literal translation calls, 48 common literal copy props and 1,152 unique static phrases across 59 source files; the dictionary contained 1,877 phrase entries and 247 semantic descriptors. It found zero missing literal phrases, detected encoding problems, incomplete semantic descriptors, placeholder mismatches or parser failures. The initial audit had identified `Guide pagination`, `Link a Google account`, and `Workflow stages`; their shared Hindi entries were added before the passing run. Re-run the report after subsequent edits for current counts; this snapshot is evidence for this revision, not a permanent success assertion.

There were also 165 runtime translation expressions. These include variables, enum-derived labels, conditional expressions and strings supplied through props. The audit lists their locations for review but does not infer arbitrary runtime values. It also does not prove that every visible string reaches a translation helper, validate Hindi writing quality, inspect current database translations, or verify all browser paths. Zero missing literal keys is therefore only static-source coverage, not a claim that every possible customer/admin record or screen is bilingually complete. Browser tests, screenshots and an owner's review of actual content remain required; see the current project-status and production-readiness documents for their separate evidence.
