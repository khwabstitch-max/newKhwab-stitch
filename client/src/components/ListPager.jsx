import { t } from "../i18n/core";
export function ListPager({
  resource,
  page,
  onChange,
  label = "List pagination",
}) {
  return resource.pagination?.pages > 1 ? (
    <nav className="pagination" aria-label={t(label)}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t("Previous")}
      </button>
      <span>
        {t("Page")} {page} / {resource.pagination.pages}
      </span>
      <button
        type="button"
        disabled={page >= resource.pagination.pages}
        onClick={() => onChange(page + 1)}
      >
        {t("Next")}
      </button>
    </nav>
  ) : null;
}
