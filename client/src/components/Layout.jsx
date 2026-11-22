import { t } from "../i18n/core";
import { LanguageSwitcher, useLanguage } from "../i18n/Language";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_HOMEPAGE } from "../data/homepage";
import { homepageBlock, homepageText, formatSupportSummary } from "../lib/public-homepage";
import "./public-experience.css";
import { Link, NavLink, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, Menu, X, Scissors, UserRound, LogOut, Search, ChevronDown, MessageCircle, Mail, Home, Sparkles } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useSite, prefetchPublicResource } from "../lib/hooks";
import { ErrorMessage, Spinner } from "./ui";
import { CustomerChatWidget } from "./chat/CustomerChatWidget";

export function Logo({ variant = "horizontal" }) {
  useLanguage();
  if (variant === "seal") {
    return <Link to="/" className="logo brand-seal" aria-label={t("Khwab Stitch home")}>
      <img src="/brand/khwab-stitch-logo.svg" alt="" width="202" height="202" loading="lazy" />
    </Link>;
  }
  return <Link to="/" className="logo brand-logo" aria-label={t("Khwab Stitch home")}>
    <img className="brand-monogram" src="/atelier/monogram.webp" alt="" width="84" height="84" decoding="async" />
    <span className="brand-wordmark">Khwab<span>Stitch</span>
      <small className="brand-tagline">{t("atelier.shell.tagline")}</small>
    </span>
  </Link>;
}

export function Layout() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const toggle = useRef(null);
  const navigation = useRef(null);
  const requestLink = useRef(null);
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
    const closeOnDesktop = () => {
      const desktop = window.matchMedia?.("(min-width: 1201px)")?.matches ?? window.innerWidth > 1200;
      if (desktop) setOpen(false);
    };
    window.addEventListener("resize", closeOnDesktop);
    return () => window.removeEventListener("resize", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const controls = () => [toggle.current, ...(navigation.current?.querySelectorAll("a[href],button,input,select,summary") || []), requestLink.current]
      .filter((control) => control && !control.disabled && (!control.closest("details:not([open])") || control.tagName === "SUMMARY"));
    controls()[1]?.focus();
    const keys = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggle.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const available = controls();
      const current = available.indexOf(document.activeElement);
      const next = (current + (event.shiftKey ? -1 : 1) + available.length) % available.length;
      event.preventDefault();
      available[next]?.focus();
    };
    const outside = (event) => {
      if (!navigation.current?.contains(event.target) && !toggle.current?.contains(event.target) && !requestLink.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", keys);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", keys);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return <>
    <a className="skip-link" href="#main">{t("Skip to content")}</a>
    <header className="header public-header atelier-header">
      <div className="header-inner">
        <Logo />
        <nav ref={navigation} id="primary-navigation" className={open ? "nav public-nav open" : "nav public-nav"} aria-label={t("public.nav.label")}
          onClick={(event) => { if (event.target.closest("a")) setOpen(false); }}>
          <div className="atelier-nav-pages">
            <details className={`nav-designs${location.pathname.startsWith("/catalogue") || location.pathname.startsWith("/designs/") ? " is-current" : ""}`}
              onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && event.currentTarget.open) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.removeAttribute("open");
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}>
              <summary>{t("public.nav.designs")}<ChevronDown size={14} aria-hidden="true" /></summary>
              <div className="nav-design-links" onMouseEnter={() => prefetchPublicResource("/designs?limit=12&page=1")}>
                <NavLink to="/catalogue">{t("public.nav.all")}</NavLink>
                {garments.map((garment) => <Link key={garment} to={"/catalogue?garment=" + garment}>{t("public.garment." + garment)}</Link>)}
              </div>
            </details>
            <NavLink className="public-nav-link" to="/how-it-works">{t("public.nav.how")}</NavLink>
            <button
              type="button"
              className="public-nav-link atelier-nav-tailor-btn"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("open-atelier-chat"));
                setOpen(false);
              }}
            >
              {t("Master tailor guidance")}
            </button>
            <NavLink className="public-nav-link" to="/contact">{t("public.nav.help")}</NavLink>
          </div>
          <div className="atelier-nav-tools">
            <form className="public-search" role="search" onSubmit={(event) => {
              event.preventDefault();
              const query = search.trim();
              navigate("/catalogue" + (query ? "?q=" + encodeURIComponent(query) : ""));
              setOpen(false);
            }}>
              <input type="search" aria-label={t("public.nav.search")} placeholder={t("public.nav.search")} value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} />
              <button type="submit" aria-label={t("public.nav.searchSubmit")}><Search size={17} aria-hidden="true" /></button>
            </form>
            <LanguageSwitcher />
            <NavLink className="public-account" to={user ? "/account" : "/login"} aria-label={t(user ? "public.nav.account" : "Sign in")} title={t(user ? "public.nav.account" : "Sign in")}>
              <UserRound size={20} aria-hidden="true" /><span className="sr-only">{t(user ? "public.nav.account" : "Sign in")}</span>
            </NavLink>
          </div>
        </nav>
        <div className="header-mobile-tools">
          <LanguageSwitcher />
        </div>
        <Link ref={requestLink} className="button small atelier-request-link" to="/request" aria-label={t("public.action.start")} onClick={() => setOpen(false)}>
          <Scissors size={17} aria-hidden="true" /><span>{t("public.action.start")}</span><ArrowUpRight className="atelier-request-arrow" size={15} aria-hidden="true" />
        </Link>
        <button ref={toggle} type="button" className="mobile-menu icon-button"
          aria-label={t(open ? "public.nav.close" : "public.nav.open")} aria-expanded={open} aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}>
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
    </header>
    {open && <div className="atelier-menu-backdrop" aria-hidden="true" />}
    <main id="main" tabIndex={-1} inert={open || undefined}><Outlet /></main>
    <footer className="footer public-footer atelier-footer" inert={open || undefined}>
      <div className="container atelier-footer-invitation">
        <div>
          <p className="eyebrow">{t("atelier.footer.invitationEyebrow")}</p>
          <h2>{t("atelier.footer.invitationTitle")}</h2>
        </div>
        <div className="atelier-footer-actions">
          <Link className="button" to="/request">{t("atelier.footer.begin")}<ArrowUpRight size={17} aria-hidden="true" /></Link>
          <Link className="button secondary" to="/catalogue">{t("atelier.footer.collection")}<ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
      </div>
      <div className="container footer-grid">
        <div className="public-footer-brand">
          <Logo />
          <p>{footer.description}</p>
          <Link className="atelier-footer-reference" to="/request?source=reference">{t("public.action.reference")}<ArrowUpRight size={15} aria-hidden="true" /></Link>
          {announcement && <p className="public-footer-announcement">{announcement}</p>}
          <div className="atelier-footer-socials">
            {/^https:\/\/(?:www\.)?instagram\.com\//.test(site.instagram || "") && <a href={site.instagram} target="_blank" rel="noopener noreferrer">Instagram<ArrowUpRight size={13} aria-hidden="true" /></a>}
            {/^https:\/\/(?:www\.)?facebook\.com\//.test(site.facebook || "") && <a href={site.facebook} target="_blank" rel="noopener noreferrer">Facebook<ArrowUpRight size={13} aria-hidden="true" /></a>}
          </div>
        </div>
        <div className="atelier-footer-links"><h3>{t("public.footer.explore")}</h3>
          <Link to="/catalogue">{t("public.nav.all")}</Link>
          <Link to="/how-it-works">{t("public.nav.how")}</Link>
          <Link to="/account/work">{t("public.footer.work")}</Link>
        </div>
        <div className="atelier-footer-links"><h3>{t("public.footer.help")}</h3>
          <Link to="/orders">{t("public.footer.track")}</Link>
          <Link to="/account">{t("public.nav.account")}</Link>
          <Link to="/account/benefits">{t("public.footer.benefits")}</Link>
          {profile?.role === "admin" && <Link to="/admin">{t("Admin")}</Link>}
          {user && <button type="button" className="text-button" onClick={async () => { await logout(); navigate("/login", { replace: true }); }}><LogOut size={14} aria-hidden="true" />{t("Sign out")}</button>}
        </div>
        <div className="atelier-footer-contact"><h3>{t("atelier.footer.contact")}</h3>
          <button
            type="button"
            className="text-link footer-chat-link"
            onClick={() => window.dispatchEvent(new CustomEvent("open-atelier-chat"))}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none", background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", color: "inherit" }}
            aria-label={t("Chat with Atelier")}
          >
            <MessageCircle size={16} aria-hidden="true" />
            {t("Chat with Atelier")}
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
          {site.contactEmail && <a href={`mailto:${site.contactEmail}`}><Mail size={16} aria-hidden="true" />{site.contactEmail}</a>}
          <Link to="/contact">{t("public.footer.contact")}<ArrowUpRight size={13} aria-hidden="true" /></Link>
          {supportHours && <p className="public-footer-hours">{supportHours}</p>}
        </div>
      </div>
      <div className="container footer-bottom">
        <span>{t("\u00a9 {0} Khwab Stitch. Crafted with intention.", { 0: new Date().getFullYear() })}</span>
        <div className="atelier-footer-legal"><Link to="/privacy">{t("Privacy")}</Link><Link to="/terms">{t("Service terms")}</Link></div>
        <span>{t("Fabric provided by customer.")}</span>
      </div>
    </footer>
    <CustomerChatWidget />
    <MobileBottomNav user={user} onOpenChat={() => window.dispatchEvent(new CustomEvent("open-atelier-chat"))} />
  </>;
}

function MobileBottomNav({ user, onOpenChat }) {
  const location = useLocation();
  const userName = user?.name ? user.name.trim().split(" ")[0] : null;

  return (
    <nav className="mobile-bottom-app-bar" aria-label={t("Mobile navigation")}>
      <NavLink
        to="/"
        className={({ isActive }) =>
          `mobile-nav-item${isActive && location.pathname === "/" ? " is-active" : ""}`
        }
      >
        <Home size={20} aria-hidden="true" />
        <span>{t("Home")}</span>
      </NavLink>
      <NavLink
        to="/catalogue"
        className={({ isActive }) =>
          `mobile-nav-item${isActive || location.pathname.startsWith("/designs") ? " is-active" : ""}`
        }
      >
        <Sparkles size={20} aria-hidden="true" />
        <span>{t("public.nav.designs")}</span>
      </NavLink>
      <NavLink
        to="/request"
        className={({ isActive }) =>
          `mobile-nav-item mobile-nav-stitch${isActive ? " is-active" : ""}`
        }
        aria-label={t("public.action.start")}
      >
        <div className="mobile-stitch-circle">
          <Scissors size={20} aria-hidden="true" />
        </div>
        <span>{t("Stitch")}</span>
      </NavLink>
      <button
        type="button"
        className="mobile-nav-item mobile-nav-chat"
        onClick={onOpenChat}
        aria-label={t("Master tailor guidance")}
      >
        <MessageCircle size={20} aria-hidden="true" />
        <span>{t("Chat")}</span>
      </button>
      <NavLink
        to={user ? "/account" : "/login"}
        className={({ isActive }) =>
          `mobile-nav-item mobile-nav-profile${isActive ? " is-active" : ""}`
        }
      >
        <UserRound size={20} aria-hidden="true" />
        <span className="mobile-nav-user-label">
          {userName || t(user ? "public.nav.account" : "Sign in")}
        </span>
      </NavLink>
    </nav>
  );
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
