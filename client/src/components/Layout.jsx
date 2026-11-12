import { t } from "../i18n/core";
import { LanguageSwitcher, useLanguage } from "../i18n/Language";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_HOMEPAGE } from "../data/homepage";
import { homepageBlock, homepageText, formatSupportSummary } from "../lib/public-homepage";
import "./public-experience.css";
import {
  Link,
  NavLink,
  Outlet,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  Menu,
  X,
  Scissors,
  UserRound,
  LogOut,
  Search,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useSite, prefetchPublicResource } from "../lib/hooks";
import { ErrorMessage, Spinner } from "./ui";
export function Logo({ variant = "horizontal" }) {
  useLanguage();
  if (variant === "seal")
    return (
      <Link
        to="/"
        className="logo brand-seal"
        aria-label={t("Khwab Stitch home")}
      >
        <img
          src="/brand/khwab-stitch-logo.svg"
          alt=""
          width="202"
          height="202"
          loading="lazy"
        />
      </Link>
    );
  return (
    <Link
      to="/"
      className="logo brand-logo"
      aria-label={t("Khwab Stitch home")}
    >
      <img
        className="brand-monogram"
        src="/brand/khwab-monogram.png"
        alt=""
        width="84"
        height="84"
        fetchPriority="high"
      />
      <span className="brand-wordmark">
        Khwab<span>Stitch</span>
        <small className="brand-tagline">{t("Where Fabric Becomes Art")}</small>
      </span>
    </Link>
  );
}
export function Layout() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const toggle = useRef(null), navigation = useRef(null);
  const { user, profile, logout } = useAuth();
  const site = useSite();
  const footer = homepageBlock(site.homepage?.footer, DEFAULT_HOMEPAGE.footer, ["description"], language);
  const announcement = homepageText(site, "announcement", language);
  const supportHours = formatSupportSummary(site.support, t);
  const garments = ["kurti", "suit", "blouse", "alteration"];
  useEffect(() => {
    setOpen(false);
    navigation.current?.querySelectorAll("details[open]").forEach((details) => details.removeAttribute("open"));
    setSearch(location.pathname === "/catalogue" ? new URLSearchParams(location.search).get("q") || "" : "");
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const controls = () => [...(navigation.current?.querySelectorAll("a[href],button,input,select,summary") || [])]
      .filter((control) => !control.disabled && (!control.closest("details:not([open])") || control.tagName === "SUMMARY"));
    controls()[0]?.focus();
    const keys = (event) => {
      if (event.key === "Escape") {
        event.preventDefault(); setOpen(false); toggle.current?.focus();
      }
      if (event.key !== "Tab") return;
      const available = controls(), first = available[0], last = available.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const outside = (event) => {
      if (!navigation.current?.contains(event.target) && !toggle.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", keys);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", keys); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  return <>
    <a className="skip-link" href="#main">{t("Skip to content")}</a>
    <header className="header public-header">
      <div className="header-inner">
        <Logo />
        <button ref={toggle} type="button" className="mobile-menu icon-button"
          aria-label={t(open ? "public.nav.close" : "public.nav.open")} aria-expanded={open} aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
        <nav ref={navigation} id="primary-navigation" className={open ? "nav public-nav open" : "nav public-nav"} aria-label={t("public.nav.label")}
          onClick={(event) => { if (event.target.closest("a")) setOpen(false); }}>
          <details className="nav-designs" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}
            onKeyDown={(event) => { if (event.key === "Escape" && event.currentTarget.open) { event.preventDefault(); event.stopPropagation(); event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}>
            <summary>{t("public.nav.designs")}<ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="nav-design-links" onMouseEnter={() => prefetchPublicResource("/designs?limit=12&page=1")}>
              <NavLink to="/catalogue">{t("public.nav.all")}</NavLink>
              {garments.map((garment) => <Link key={garment} to={"/catalogue?garment=" + garment}>{t("public.garment." + garment)}</Link>)}
            </div>
          </details>
          <NavLink className="public-nav-link" to="/how-it-works">{t("public.nav.how")}</NavLink>
          <NavLink className="public-nav-link" to="/contact">{t("public.nav.help")}</NavLink>
          <form className="public-search" role="search" onSubmit={(event) => {
            event.preventDefault();
            const query = search.trim();
            navigate("/catalogue" + (query ? "?q=" + encodeURIComponent(query) : ""));
            setOpen(false);
          }}>
            <input type="search" aria-label={t("public.nav.search")} placeholder={t("public.nav.search")} value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} />
            <button type="submit" aria-label={t("public.nav.searchSubmit")}><Search size={18} aria-hidden="true" /></button>
          </form>
          <LanguageSwitcher />
          <NavLink className="public-account" to={user ? "/account" : "/login"} aria-label={t(user ? "public.nav.account" : "Sign in")} title={t(user ? "public.nav.account" : "Sign in")}>
            <UserRound size={21} aria-hidden="true" /><span className="sr-only">{t(user ? "public.nav.account" : "Sign in")}</span>
          </NavLink>
          <Link className="button small" to="/request">{t("public.action.start")}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </nav>
      </div>
    </header>
    <main id="main"><Outlet /></main>
    <footer className="footer public-footer">
      <div className="container footer-grid">
        <div className="public-footer-brand"><Logo variant="seal" /><p>{footer.description}</p>{supportHours && <p className="public-footer-hours">{supportHours}</p>}{announcement && <p className="public-footer-announcement">{announcement}</p>}</div>
        <div><h3>{t("public.footer.explore")}</h3>
          <Link to="/catalogue">{t("public.nav.all")}</Link>
          <Link to="/request?source=reference">{t("public.action.reference")}</Link>
          <Link to="/how-it-works">{t("public.nav.how")}</Link>
          <Link to="/contact">{t("public.footer.contact")}</Link>
        </div>
        <div><h3>{t("public.footer.help")}</h3>
          <Link to="/contact">{t("public.action.guidance")}</Link>
          <Link to="/orders">{t("public.footer.track")}</Link>
          <Link to="/account">{t("public.nav.account")}</Link>
          <Link to="/account/benefits">{t("public.footer.benefits")}</Link>
          {user && <button type="button" className="text-button" onClick={async () => { await logout(); navigate("/login", { replace: true }); }}><LogOut size={15} aria-hidden="true" />{t("Sign out")}</button>}
        </div>
        <div><h3>{t("public.footer.information")}</h3>
          <Link to="/privacy">{t("Privacy")}</Link><Link to="/terms">{t("Service terms")}</Link><Link to="/account/work">{t("public.footer.work")}</Link>
          {profile?.role === "admin" && <Link to="/admin">{t("Admin")}</Link>}
          {/^https:\/\/(?:www\.)?instagram\.com\//.test(site.instagram || "") && <a href={site.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
          {/^https:\/\/(?:www\.)?facebook\.com\//.test(site.facebook || "") && <a href={site.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>}
          {/^[+\d\s()-]{10,25}$/.test(site.whatsapp || "") && <a href={`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        </div>
      </div>
      <div className="container footer-bottom"><span>{t("© {0} Khwab Stitch. Crafted with intention.", { 0: new Date().getFullYear() })}</span><span>{t("Fabric provided by customer.")}</span></div>
    </footer>
  </>;
}
export function Protected({ admin = false }) {
  useLanguage();
  const { user, profile, loading, error, reloadProfile, hasSession } =
    useAuth();
  const location = useLocation();
  if (loading && !user) return <Spinner label={t("Checking your session\u2026")} />;
  if (hasSession && !user)
    return (
      <div className="container page">
        <ErrorMessage
          message={error || "Your profile could not be loaded. Please try again."}
          retry={() => reloadProfile().catch(() => {})}
        />
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{
          from: location.pathname + location.search,
        }}
        replace
      />
    );
  if (!profile)
    return (
      <div className="container page">
        <ErrorMessage
          message={error || "Your profile could not be loaded."}
          retry={() => reloadProfile().catch(() => {})}
        />
      </div>
    );
  if (admin && profile.role !== "admin")
    return (
      <div className="container page">
        <div className="empty">
          <Scissors />
          <h1>{t("Atelier access only")}</h1>
          <p>{t("This space is reserved for the Khwab Stitch team.")}</p>
          <Link to="/orders" className="button">
            {t("View your requests")}
          </Link>
        </div>
      </div>
    );
  return <>
    {error && <div className="container"><ErrorMessage message={error} retry={() => reloadProfile().catch(() => {})} /></div>}
    <Outlet />
  </>;
}
