import { useEffect, useSyncExternalStore } from "react";
import { Languages } from "lucide-react";
import {
  getLanguage,
  setLanguage,
  subscribeLanguage,
  t,
  LANGUAGE_KEY,
} from "./core";
export function useLanguage() {
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguage,
    () => "en",
  );
  return { language, setLanguage, t };
}
export function LanguageProvider({ children }) {
  const { language } = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
    document.title =
      language === "hi"
        ? "KhwabStitch — जहाँ कपड़ा बने कला"
        : "KhwabStitch — Where Fabric Becomes Art";
    document
      .querySelectorAll("input,select,textarea")
      .forEach((input) => input.setCustomValidity?.(""));
  }, [language]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === LANGUAGE_KEY && ["en", "hi"].includes(event.newValue))
        setLanguage(event.newValue, false);
    };
    const clear = (event) => event.target.setCustomValidity?.("");
    const invalid = (event) => {
      const input = event.target;
      if (!input.validity || typeof input.setCustomValidity !== "function")
        return;
      const validity = input.validity;
      let message = "Please enter a valid value.";
      if (validity.valueMissing)
        message =
          input.type === "checkbox"
            ? "Please tick this box to continue."
            : input.tagName === "SELECT"
              ? "Please select an option."
              : "Please fill out this field.";
      else if (validity.typeMismatch && input.type === "email")
        message = "Please enter a valid email address.";
      else if (validity.patternMismatch)
        message = input.title || "Please match the requested format.";
      else if (validity.tooShort)
        message = t("This field must contain at least {0} characters.", {
          0: input.minLength,
        });
      else if (validity.tooLong)
        message = t("This field must contain at most {0} characters.", {
          0: input.maxLength,
        });
      else if (validity.rangeUnderflow)
        message = t("Enter a value of at least {0}.", { 0: input.min });
      else if (validity.rangeOverflow)
        message = t("Enter a value no greater than {0}.", { 0: input.max });
      input.setCustomValidity(t(message));
    };
    window.addEventListener("storage", sync);
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      window.removeEventListener("storage", sync);
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
    };
  }, []);
  return children;
}
export function LanguageSwitcher() {
  const { language } = useLanguage();
  return (
    <label className="language-picker">
      <Languages size={15} aria-hidden="true" />
      <select
        aria-label={t("Choose language")}
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="hi" lang="hi">
          हिन्दी
        </option>
      </select>
    </label>
  );
}
