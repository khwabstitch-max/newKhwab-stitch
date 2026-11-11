import { t, localize } from "../i18n/core";
import { LanguageSwitcher, useLanguage } from "../i18n/Language";
import { useState } from "react";
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
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useSite } from "../lib/hooks";
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
  useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { user, profile, logout } = useAuth();
  const site = useSite();
  return (
    <>
      <a className="skip-link" href="#main">
        {t("Skip to content")}
      </a>
      <div className="topbar">
        <span>
          {localize(site, "announcement") ||
            t("Made thoughtfully. Made for you.")}
        </span>
        <LanguageSwitcher />
        <span className="topbar-right">
          {t("CUSTOM STITCHING \xB7 YOUR FABRIC, OUR CRAFT")}
        </span>
      </div>
      <header className="header">
        <div className="header-inner">
          <Logo />
          <button
            className="mobile-menu icon-button"
            aria-label={open ? t("Close navigation") : t("Open navigation")}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <nav
            className={open ? "nav open" : "nav"}
            aria-label={t("Main navigation")}
            onClick={() => setOpen(false)}
          >
            <NavLink to="/catalogue">{t("The collection")}</NavLink>
            <NavLink to="/how-it-works">{t("How it works")}</NavLink>
            <NavLink to="/contact">{t("Our atelier")}</NavLink>
            <NavLink to="/account/support">{t("Master tailor help")}</NavLink>
            {user ? (
              <NavLink to="/account">{t("My account")}</NavLink>
            ) : (
              <NavLink to="/login" className="nav-signin">
                <UserRound size={16} />
                {t("Sign in")}
              </NavLink>
            )}
            {profile?.role === "admin" && (
              <NavLink to="/admin">{t("Admin")}</NavLink>
            )}
            <Link className="button small" to="/request">
              {t("Start your stitch ")}
              <ArrowUpRight size={16} />
            </Link>
            {user && (
              <button
                className="icon-button"
                title={t("Sign out")}
                aria-label={t("Sign out")}
                onClick={async () => {
                  await logout();
                  navigate("/login", { replace: true });
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </nav>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <Logo variant="seal" />
            <p>
              {t("Your fabric. Your story.")}
              <br />
              {t("A little of our craft.")}
            </p>
          </div>
          <div>
            <h3>{t("Explore")}</h3>
            <Link to="/catalogue">{t("The collection")}</Link>
            <Link to="/how-it-works">{t("How stitching works")}</Link>
            <Link to="/request">{t("Start a request")}</Link>
          </div>
          <div>
            <h3>{t("Here to help")}</h3>
            <Link to="/contact">{t("Contact the atelier")}</Link>
            <Link to="/orders">{t("Track a request")}</Link>
            <Link to="/profile">{t("Your profile")}</Link>
            <Link to="/account/support">
              {t("Need Help from a Master Tailor?")}
            </Link>
          </div>
          <div>
            <h3>{t("Made with care")}</h3>
            <p>
              {t("Custom stitching & alterations.")}
              <br />
              {t("Fabric provided by customer.")}
              <br />
              {t("Final quote after review.")}
            </p>
            {site.instagram && (
              <a
                href={site.instagram}
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram
              </a>
            )}
            {site.facebook && (
              <a href={site.facebook} target="_blank" rel="noopener noreferrer">
                Facebook
              </a>
            )}
            {site.whatsapp && (
              <a
                href={`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            {t("\xA9 {0} Khwab Stitch. Crafted with intention.", {
              0: new Date().getFullYear(),
            })}
          </span>
          <div>
            <Link to="/privacy">{t("Privacy")}</Link>
            <Link to="/terms">{t("Service terms")}</Link>
          </div>
        </div>
      </footer>
    </>
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
