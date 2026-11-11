import { DesignImage, DesignPresentation } from "../components/DesignGallery";
import { GuideModal } from "../components/GuideModal";
import { DesignGuideExplorer } from "../components/DesignGuideExplorer";
import { t, localize, labelToken } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { useState } from "react";
import {
  Link,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Ruler,
  Scissors,
  Sparkles,
  Shirt,
  Leaf,
  Search,
  MessageCircle,
  Mail,
  Instagram,
  Eye,
  EyeOff,
} from "lucide-react";
import { useResource, useSite } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { safeReturnTo } from "../lib/continuation";
import { GoogleSignIn } from "../components/GoogleSignIn";
import { money } from "../lib/api";
import {
  ArrowLink,
  BackLink,
  Badge,
  Button,
  Empty,
  ErrorMessage,
  Field,
  GarmentArt,
  Notice,
  PageHeading,
  Spinner,
} from "../components/ui";
export function DesignCard({ design, index = 0 }) {
  useLanguage();
  return (
    <Link className="design-card" to={`/designs/${design.slug}`}>
      <div className={`design-image tone-${index % 4}`}>
        {design.coverView ? (
          <DesignImage
            image={design.coverView}
            alt={localize(design, "title")}
          />
        ) : design.coverImageUrl ? (
          <img
            src={design.coverImageUrl}
            alt={localize(design, "title")}
            loading="lazy"
          />
        ) : (
          <GarmentArt garment={design.garment} variant={index} />
        )}
        <span className="design-code">{design.code}</span>
        <span className="card-arrow">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="design-info">
        <span className="eyebrow">
          {design.garment === "suit"
            ? t("SUIT / KAMEEZ")
            : labelToken(design.garment)}
        </span>
        <h3>{localize(design, "title")}</h3>
        <p>
          {t("Stitching starting from")}{" "}
          <strong>{money(design.startingPricePaise)}</strong>
        </p>
        <small>{t("Fabric provided by customer.")}</small>
      </div>
    </Link>
  );
}
export function Home() {
  useLanguage();
  const site = useSite();
  const { data, loading, error, reload } = useResource("/designs?limit=3", { publicRead: true });
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="little-line" />
              {t(site.welcome?.title || "Welcome to Khwab Stitch")}
            </p>
            <h1>
              {site.welcome?.tagline
                ? t(site.welcome.tagline)
                : t("Aapki Soch,")}
              <br />
              {!site.welcome?.tagline && <em>{t("Hamari Silai.")}</em>}
            </h1>
            <p className="hero-description">
              {t(
                site.welcome?.description ||
                  "Apne kapde ko dijiye apni pasand ka andaaz. Hamare designs mein se chuniye ya apni inspiration share kijiye — hum aapki confirmed measurements aur design details ke hisaab se care ke saath silai karenge.",
              )}
            </p>
            <div className="hero-actions">
              <Link to="/catalogue" className="button">
                {t("Explore Designs ")}
                <ArrowUpRight size={18} />
              </Link>
              <Link to="/account/support" className="text-link">
                {t("Need Help from a Master Tailor? ")}
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="hero-note">
              <Scissors size={16} />
              <span>
                {t(
                  "Custom stitching on your fabric. Final price and timeline confirmed after review.",
                )}
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-arch">
              <span className="arch-top">
                {t("KHWABSTITCH \xB7 MADE WITH CARE")}
              </span>
              <div className="hero-art">
                {site.bannerImageUrl ? (
                  <img
                    src={site.bannerImageUrl}
                    alt={t("Khwab Stitch atelier inspiration")}
                  />
                ) : (
                  <GarmentArt garment="kurti" variant={1} large />
                )}
              </div>
              <div className="fabric fabric-one" />
              <div className="fabric fabric-two" />
              <span className="hero-spark spark-one">✧</span>
              <span className="hero-spark spark-two">✧</span>
              <div className="swatch-note">
                {t("A stitch of imagination.")}
                <br />
                <em>{t("A fit that feels like you.")}</em>
              </div>
            </div>
            <div className="floating-note">
              <span className="note-icon">
                <Ruler size={24} />
              </span>
              <div>
                <strong>{t("Made to your measure")}</strong>
                <small>{t("Because every body has its own story.")}</small>
              </div>
            </div>
            <span className="visual-caption">
              {t(
                "ILLUSTRATED DESIGN INSPIRATION \xB7 NOT A READY-MADE GARMENT",
              )}
            </span>
          </div>
        </div>
      </section>
      <div className="promise-strip">
        <div className="container promises">
          <span>
            <Scissors size={18} />
            {t("CUSTOM STITCHING")}
          </span>
          <i>✧</i>
          <span>
            <Ruler size={18} />
            {t("PERSONAL MEASUREMENTS")}
          </span>
          <i>✧</i>
          <span>
            <Leaf size={18} />
            {t("YOUR FABRIC, BEAUTIFULLY USED")}
          </span>
          <i>✧</i>
          <span>
            <Sparkles size={18} />
            {t("FINISHING WITH CARE")}
          </span>
        </div>
      </div>
      <section className="section container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("THE COLLECTION")}</p>
            <h2>
              {t("Something ")}
              <em>{t("so you.")}</em>
            </h2>
            <p className="muted">
              {t("A starting point for your next favourite outfit.")}
            </p>
          </div>
          <ArrowLink to="/catalogue">{t("View all designs")}</ArrowLink>
        </div>
        {loading ? (
          <Spinner label={t("Opening the collection\u2026")} />
        ) : error ? (
          <ErrorMessage message={error} retry={reload} />
        ) : data?.length ? (
          <div className="design-grid">
            {data.map((d, i) => (
              <DesignCard key={d._id} design={d} index={i} />
            ))}
          </div>
        ) : (
          <Empty title={t("The collection is being curated")}>
            {t(
              "Have something in mind? Share your own inspiration in a stitching request.",
            )}
          </Empty>
        )}
        <p className="collection-footnote">
          {t(
            "Designs are stitching references. Final pricing and delivery are agreed after review.",
          )}
        </p>
      </section>
      <section className="process-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("A SIMPLE LITTLE JOURNEY")}</p>
              <h2>
                {t("From a piece of fabric")}
                <br />
                {t("to ")}
                <em>{t("a piece of you.")}</em>
              </h2>
            </div>
            <p className="process-intro">
              {t("We keep the process personal, thoughtful,")}
              <br />
              {t("and easy to follow.")}
            </p>
          </div>
          <div className="process-grid">
            {[
              [
                "01",
                t("Bring your idea"),
                t(
                  "Choose a design or share inspiration. Tell us what you have in mind.",
                ),
                Shirt,
              ],
              [
                "02",
                t("Make it your own"),
                t(
                  "Share your measurements and preferences. Need a hand? Just ask.",
                ),
                Ruler,
              ],
              [
                "03",
                t("Let us craft it"),
                t(
                  "Review your personal quote. Once accepted and fabric inspected, we begin.",
                ),
                Scissors,
              ],
            ].map(([n, title, copy, Icon]) => (
              <div className="process-card" key={n}>
                <div className="process-top">
                  <span>{n}</span>
                  <Icon size={25} strokeWidth={1.3} />
                </div>
                <h3>{t(title)}</h3>
                <p>{t(copy)}</p>
              </div>
            ))}
          </div>
          <Link to="/request" className="button">
            {t("Let's make something beautiful ")}
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      <section className="section container personal-section">
        <div className="personal-mark">
          <img
            className="personal-brand-seal"
            src="/brand/khwab-stitch-logo.svg"
            alt={t("KhwabStitch \u2014 Where Fabric Becomes Art")}
            width="270"
            height="270"
            loading="lazy"
          />
          <span>
            {t(
              "\u0939\u092E\u093E\u0930\u0940 \u0915\u093E\u0930\u0940\u0917\u0930\u0940",
            )}
            <br />
            {t("\u0906\u092A\u0915\u0940 \u0915\u0939\u093E\u0928\u0940")}
          </span>
        </div>
        <div>
          <p className="eyebrow">{t("SMALL ATELIER. PERSONAL ATTENTION.")}</p>
          <h2>
            {t("Not just stitched.")}
            <br />
            <em>{t("Thoughtfully made.")}</em>
          </h2>
          <p>{localize(site, "about")}</p>
          <ArrowLink to="/contact">{t("Say hello to the atelier")}</ArrowLink>
        </div>
      </section>
      <HomeGuidesShowcase />
      <HomeResume />
      <SelectedReviews />
    </>
  );
}
function HomeGuidesShowcase() {
  const [activeGuide, setActiveGuide] = useState(null);

  const guides = [
    {
      id: "neck",
      title: t("Signature Necklines"),
      desc: t(
        "8 signature necklines: Round, V-Neck, Boat, Collar, Square, Sweetheart, High Neck & Mandarin.",
      ),
      img: "/guides/neck-designs-guide.jpg",
      badge: t("Neck Options"),
    },
    {
      id: "sleeve",
      title: t("Bespoke Sleeve Styles"),
      desc: t(
        "11 bespoke sleeve designs: Straight, Puff, Bell, Ruffle, Bishop, Butterfly, Cold Shoulder & more.",
      ),
      img: "/guides/sleeve-designs-guide.jpg",
      badge: t("Sleeve Options"),
    },
    {
      id: "length",
      title: t("Sleeve Lengths"),
      desc: t(
        'Front & side view references from Sleeveless (0cm) to Full Sleeve (55cm / 21.7").',
      ),
      img: "/guides/sleeve-length-guide.jpg",
      badge: t("Length Guide"),
    },
    {
      id: "measurement",
      title: t("Full Measurement Guide"),
      desc: t(
        "Numbered measurement guide for Kurti, Blouse & Suit — exact points for the perfect custom fit.",
      ),
      img: "/guides/measurement-guide.jpg",
      badge: t("Fit Guide"),
    },
  ];

  return (
    <section className="section container guides-showcase-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("ATELIER VISUAL REFERENCES")}</p>
          <h2>
            {t("Fit & Design ")}
            <em>{t("Guides.")}</em>
          </h2>
          <p className="muted">
            {t(
              "Explore our official styling, neckline, and measurement charts before placing your request.",
            )}
          </p>
        </div>
        <ArrowLink to="/request">{t("Start custom request")}</ArrowLink>
      </div>

      <div className="home-guides-grid">
        {guides.map((g) => (
          <div
            key={g.id}
            className="home-guide-card"
            onClick={() => setActiveGuide(g)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setActiveGuide(g)}
          >
            <div className="home-guide-thumb-wrap">
              <img src={g.img} alt={g.title} loading="lazy" />
              <span className="home-guide-badge">{g.badge}</span>
            </div>
            <div className="home-guide-info">
              <h3>{g.title}</h3>
              <p>{g.desc}</p>
              <span className="home-guide-action">
                <Sparkles size={14} aria-hidden="true" />
                {t("View full chart")}
              </span>
            </div>
          </div>
        ))}
      </div>

      <DesignGuideExplorer />

      {activeGuide && (
        <GuideModal
          title={activeGuide.title}
          subtitle={activeGuide.desc}
          imageUrl={activeGuide.img}
          onClose={() => setActiveGuide(null)}
          footerNote={t(
            "Khwab Stitch • Handcrafted bespoke tailoring made to your exact measurements.",
          )}
        />
      )}
    </section>
  );
}
function HomeResume() {
  const { profile } = useAuth();
  const { data } = useResource(profile ? "/drafts?limit=1" : null);
  if (!profile) return null;
  return (
    <section className="section container">
      <div className="panel">
        <h2>
          {t("Welcome back, {0}.", {
            0: profile.name?.split(" ")[0] || t("there"),
          })}
        </h2>
        <div className="stack-actions">
          {data?.[0] && (
            <Link className="button" to={`/request?draft=${data[0]._id}`}>
              {t("Continue your saved request")}
            </Link>
          )}
          <Link className="button secondary" to="/request">
            {t("Start a new request")}
          </Link>
          <Link className="text-link" to="/account">
            {t("My account")}
          </Link>
        </div>
      </div>
    </section>
  );
}
function SelectedReviews() {
  const { data } = useResource("/reviews?limit=3", { publicRead: true });
  if (!data?.length) return null;
  return (
    <section className="section container selected-reviews">
      <p className="eyebrow">{t("WORDS FROM OUR CUSTOMERS")}</p>
      <h2>{t("A little care, remembered.")}</h2>
      <p className="small-print">
        {t(
          "Selected customer reviews, moderated before public display. This is not the complete review history.",
        )}
      </p>
      <div className="account-cards">
        {data.map((r) => (
          <article className="panel" key={r._id}>
            <strong>{r.rating} / 5</strong>
            <blockquote>{r.text}</blockquote>
          </article>
        ))}
      </div>
    </section>
  );
}
export function Catalogue() {
  useLanguage();
  const [params, setParams] = useSearchParams();
  const garment = params.get("garment") || "";
  const q = params.get("q") || "";
  const page = Number(params.get("page") || 1);
  const [search, setSearch] = useState(q);
  const { data, loading, error, pagination, reload } = useResource(
    `/designs?limit=12&page=${page}${garment ? `&garment=${garment}` : ""}${q ? `&search=${encodeURIComponent(q)}` : ""}`,
  );
  const update = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    setParams(next);
  };
  return (
    <div className="container page">
      <PageHeading
        eyebrow={t("THE COLLECTION")}
        title={t("Find your starting point.")}
      >
        {t(
          "Thoughtful designs for your fabric. Every detail can become your own.",
        )}
      </PageHeading>
      <div className="catalogue-toolbar">
        <div className="filter-tabs" aria-label={t("Filter garments")}>
          {[
            ["", t("All designs")],
            ["kurti", t("Kurtis")],
            ["suit", t("Suits & kameez")],
            ["blouse", t("Blouses")],
            ["alteration", t("Alterations")],
          ].map(([v, l]) => (
            <button
              key={v}
              className={garment === v ? "selected" : ""}
              aria-pressed={garment === v}
              onClick={() => update("garment", v)}
            >
              {t(l)}
            </button>
          ))}
        </div>
        <form
          className="search-box"
          onSubmit={(e) => {
            e.preventDefault();
            update("q", search);
          }}
        >
          <Search size={17} />
          <input
            aria-label={t("Search designs")}
            placeholder={t("Find a design\u2026")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="text-button" type="submit">
            {t("Search")}
          </button>
        </form>
      </div>
      {loading ? (
        <Spinner label={t("Finding your inspiration\u2026")} />
      ) : error ? (
        <ErrorMessage message={error} retry={reload} />
      ) : data?.length ? (
        <>
          <div className="design-grid">
            {data.map((d, i) => (
              <DesignCard key={d._id} design={d} index={i} />
            ))}
          </div>
          <div className="pagination">
            <button
              disabled={page <= 1}
              onClick={() => {
                const n = new URLSearchParams(params);
                n.set("page", page - 1);
                setParams(n);
              }}
            >
              {t("Previous")}
            </button>
            <span>
              {t("Page {0} of {1}", {
                0: page,
                1: pagination?.pages || 1,
              })}
            </span>
            <button
              disabled={page >= (pagination?.pages || 1)}
              onClick={() => {
                const n = new URLSearchParams(params);
                n.set("page", page + 1);
                setParams(n);
              }}
            >
              {t("Next")}
            </button>
          </div>
        </>
      ) : (
        <Empty title={t("No designs found")}>
          {t(
            "Try another category, or start a request with your own reference.",
          )}
        </Empty>
      )}
      <Notice>
        {t(
          "Stitching starting prices are estimates. Fabric provided by customer. Your final price and delivery date need an atelier review.",
        )}
      </Notice>
    </div>
  );
}
export function DesignDetails() {
  useLanguage();
  const { slug } = useParams();
  const {
    data: design,
    loading,
    error,
    reload,
  } = useResource(`/designs/${encodeURIComponent(slug)}`);
  if (loading) return <Spinner />;
  if (error)
    return (
      <div className="container page">
        <BackLink />
        <ErrorMessage message={error} retry={reload} />
      </div>
    );
  if (!design) return <NotFound />;
  return (
    <div className="container page">
      <BackLink />
      <DesignPresentation design={design} />
    </div>
  );
}

export function HowItWorks() {
  useLanguage();
  return (
    <div className="container page narrow">
      <PageHeading
        eyebrow={t("YOUR FABRIC, OUR CRAFT")}
        title={t("A little care, at every step.")}
      >
        {t(
          "Here is how we turn your inspiration into a personally stitched garment.",
        )}
      </PageHeading>
      <div className="journey">
        {[
          [
            t("Share your inspiration"),
            t(
              "Browse our stitching designs, or upload a reference image of your own. Choose kurti, suit/kameez, blouse, or alteration.",
            ),
          ],
          [
            t("Tell us about your fit"),
            t(
              "Share body measurements or measurements of a well-fitting garment in inches or centimetres. Select \u201CNeed assistance\u201D if you would like help. These methods are kept distinct.",
            ),
          ],
          [
            t("Review your personal quote"),
            t(
              "We review the design, measurements, work and preferred date. You receive a versioned quote with a proposed price and date. Accept only when you are happy.",
            ),
          ],
          [
            t("Bring your fabric"),
            t(
              "After your acceptance, arrange fabric handover with the atelier. We inspect it before stitching begins. Please do not send fabric before discussing the arrangement.",
            ),
          ],
          [
            t("Watch it come together"),
            t(
              "Follow updates in My requests: fabric inspected, stitching, ready, dispatched and delivered. Handover and dispatch details are agreed personally.",
            ),
          ],
        ].map(([t, c], i) => (
          <article key={t}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h2>{t}</h2>
              <p>{c}</p>
            </div>
          </article>
        ))}
      </div>
      <Notice>
        {t(
          "Preferred dates are requests, not guaranteed commitments. We will discuss feasibility and agree the final quote before work begins.",
        )}
      </Notice>
      <Link to="/request" className="button">
        {t("Start your stitching request ")}
        <ArrowRight size={17} />
      </Link>
    </div>
  );
}
export function Contact() {
  useLanguage();
  const s = useSite();
  const phone = (s.whatsapp || "").replace(/\D/g, "");
  return (
    <div className="container page">
      <PageHeading
        eyebrow={t("THE KHWAB ATELIER")}
        title={t("Every good stitch begins with a conversation.")}
      >
        {t(
          "Questions about fabric, fit, or an idea you cannot quite put into words? Say hello.",
        )}
      </PageHeading>
      <div className="contact-grid">
        <div className="contact-card">
          <MessageCircle size={26} />
          <h2>{t("Let's talk stitching")}</h2>
          <p>
            {t(
              "Discuss your idea or fabric handover directly with the atelier.",
            )}
          </p>
          {phone && (
            <a
              className="button"
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("Chat on WhatsApp ")}
              <ArrowUpRight size={17} />
            </a>
          )}
        </div>
        <div className="contact-card">
          <Instagram size={26} />
          <h2>{t("A little inspiration")}</h2>
          <p>{t("Find us on Instagram and discover our stitching story.")}</p>
          {/^https:\/\/((www\.)?instagram\.com)\//.test(s.instagram || "") && (
            <a
              className="text-link"
              href={s.instagram}
              target="_blank"
              rel="noreferrer"
            >
              {t("Visit Instagram ")}
              <ArrowUpRight size={17} />
            </a>
          )}
        </div>
        {s.contactEmail && (
          <div className="contact-card">
            <Mail size={26} />
            <h2>{t("Write to us")}</h2>
            <a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>
          </div>
        )}
      </div>
      <section className="policy">
        <h2>{t("Before you visit")}</h2>
        <p>
          {t(
            "We are a home-based custom stitching service. Contact the atelier to arrange fabric handover and appointments. Fabric is provided by you; quotes and delivery commitments follow a personal review.",
          )}
        </p>
      </section>
      {s.faqs?.length > 0 && (
        <section className="faq">
          <h2>{t("A few helpful answers")}</h2>
          {s.faqs.map((f, i) => (
            <details key={i}>
              <summary>{localize(f, "question")}</summary>
              <p>{localize(f, "answer")}</p>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
export function Login() {
  useLanguage();
  const {
    login,
    google,
    register,
    user,
    profile,
    loading,
    hasSession,
    error: authError,
    reloadProfile,
    dismissError,
  } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(
    params.get("mode") === "register" ? "register" : "login",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const location = useLocation(),
    navigate = useNavigate();
  const from = safeReturnTo(
    params.get("returnTo") || location.state?.from,
    "/orders",
  );
  const registering = mode === "register";
  function changeMode(next) {
    setMode(next);
    setError("");
    dismissError?.();
    setPassword("");
    setConfirmation("");
    setShowPassword(false);
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (Array.from(password).length < 12) {
      setError("Choose a password with at least 12 characters.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError(
        "Your password is too long. Use at most 72 UTF-8 bytes; emoji and some letters use more than one byte.",
      );
      return;
    }
    if (registering && password !== confirmation) {
      setError("The passwords do not match. Please enter them again.");
      return;
    }
    setBusy(true);
    try {
      if (registering)
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
        });
      else
        await login({
          email: email.trim(),
          password,
        });
      setPassword("");
      setConfirmation("");
      navigate(from, {
        replace: true,
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (loading && hasSession && !busy && !user)
    return <Spinner label={t("Checking your session\u2026")} />;
  if (user && profile)
    return (
      <div className="container page narrow">
        <PageHeading title={t("Welcome back.")} />
        <Link className="button" to={from}>
          {t("Continue ")}
          <ArrowRight size={17} />
        </Link>
      </div>
    );
  return (
    <div className="login-page">
      <div className="login-card">
        <span className="login-mark">
          <Scissors size={32} strokeWidth={1} />
        </span>
        <p className="eyebrow">{t("YOUR OWN LITTLE STITCHING SPACE")}</p>
        {from.startsWith("/request") && (
          <Notice>
            <strong>{t("Your design choices are ready.")}</strong>{" "}
            {t(
              "Apni stitching request submit karne aur uska status track karne ke liye login karein ya account banayein. Aapki selections save rahengi.",
            )}
          </Notice>
        )}
        <h1>
          {registering ? t("A beautiful beginning.") : t("Welcome back.")}
          <br />
          <em>{registering ? t("Made for you.") : t("Your ideas await.")}</em>
        </h1>
        <p>
          {registering
            ? t(
                "Create an account to share an idea, follow your requests and make something personal.",
              )
            : t(
                "Sign in with your email and password to continue your stitching journey.",
              )}
        </p>
        <ErrorMessage
          message={error || authError}
          retry={
            hasSession && authError
              ? () => reloadProfile().catch(() => {})
              : undefined
          }
        />
        <form className="auth-form" onSubmit={submit}>
          {registering && (
            <Field
              label={t("Your name")}
              name="auth-name"
              required
              minLength="2"
              maxLength="100"
              autoComplete="name"
              disabled={busy}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Field
            label={t("Email address")}
            name="auth-email"
            type="email"
            required
            maxLength="254"
            autoComplete="username"
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="password-field">
            <Field
              label={t("Password")}
              name="auth-password"
              type={showPassword ? "text" : "password"}
              required
              minLength="12"
              autoComplete={registering ? "new-password" : "current-password"}
              disabled={busy}
              hint={
                registering
                  ? t(
                      "At least 12 characters. Maximum 72 UTF-8 bytes (up to 72 English characters; fewer for emoji or some languages).",
                    )
                  : undefined
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="password-toggle icon-button"
              type="button"
              aria-label={
                showPassword ? t("Hide password") : t("Show password")
              }
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {registering && (
            <Field
              label={t("Confirm password")}
              name="auth-confirm-password"
              type={showPassword ? "text" : "password"}
              required
              minLength="12"
              autoComplete="new-password"
              disabled={busy}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          )}
          <Button className="button auth-submit" busy={busy}>
            {registering ? t("Create account") : t("Sign in")}
            <ArrowRight size={17} />
          </Button>
        </form>
        <GoogleSignIn onCredential={async credential=>{setBusy(true);setError("");try{await google({credential});navigate(from,{replace:true});}catch(e){setError(e);throw e;}finally{setBusy(false);}}}/>
        <Link
          className="text-link"
          to={`/password-help?returnTo=${encodeURIComponent(from)}`}
        >
          {t("Forgot password?")}
        </Link>
        <p className="auth-switch">
          {registering
            ? t("Already have an account?")
            : t("New to the atelier?")}{" "}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => changeMode(registering ? "login" : "register")}
          >
            {registering ? t("Sign in instead") : t("Create an account")}
          </button>
        </p>
        <small>
          {t("By continuing, you agree to our ")}
          <Link to="/terms">{t("service terms")}</Link> {t("and ")}
          <Link to="/privacy">{t("privacy policy")}</Link>
          {t(
            ". Sessions expire after 30 minutes. Registration email addresses are not verified.",
          )}
        </small>
      </div>
    </div>
  );
}
export function Policy({ type }) {
  useLanguage();
  const privacy = type === "privacy";
  return (
    <div className="container page narrow">
      <PageHeading
        eyebrow={t("CLEAR, CONSIDERATE, PERSONAL")}
        title={
          privacy ? t("Your privacy matters.") : t("A few things to know.")
        }
      />
      <div className="policy">
        {privacy ? (
          <>
            <h2>{t("Information used for your request")}</h2>
            <p>
              {t(
                "We use your registered name and email, contact number, delivery address, garment preferences, measurements and any uploaded images to review and fulfil your stitching request. Manually entered phone numbers are unverified.",
              )}
            </p>
            <h2>{t("Where your information goes")}</h2>
            <p>
              {t(
                "Our server authenticates your account. MongoDB stores account, draft and request records, and ImageKit stores images. Passwords are stored as secure hashes. Configured Google sign-in verifies your Google identity and preserves your existing account through explicit linking. Email verification status appears in your account. Customer images are private and accessible to authorized participants through temporary links. Public design images are visible to visitors.",
              )}
            </p>
            <h2>{t("Control and deletion")}</h2>
            <p>
              {t(
                "Request account deletion from your profile. The atelier will review active orders and any justified record-retention obligations before removing your identity, database profile and eligible private images. Ask the atelier for the current retention policy before submitting sensitive information.",
              )}
            </p>
            <h2>{t("Device storage and contact")}</h2>
            <p>
              {t(
                "Your language preference is saved in localStorage on this device. You can change it at any time using the language selector.",
              )}
            </p>
            <p>
              {t(
                "A short-lived JWT session token is kept in sessionStorage for this browser tab and expires after 30 minutes. Passwords are never saved in browser storage. Guest design choices may be kept on this device for draft recovery; guest measurements and addresses stay in browser session storage. Sign in and save a draft to keep it securely in your account. Signing out clears the local session and asks the server to revoke your active tokens. Contact the atelier for access, correction or privacy questions.",
              )}
            </p>
          </>
        ) : (
          <>
            <h2>{t("Stitching, using your fabric")}</h2>
            <p>
              {t(
                "Catalogue designs represent stitching services, not ready-made clothing. You provide the fabric. Starting prices are indicative; the atelier reviews fabric, design, measurements and extra work before issuing a final quote.",
              )}
            </p>
            <h2>{t("Requests and quotes")}</h2>
            <p>
              {t(
                "Submitting a request is not order confirmation. Your preferred date is a request, not a guarantee. Accept the current quote to agree its stated price and proposed delivery date. Work starts only after accepted quote and fabric inspection.",
              )}
            </p>
            <h2>{t("Measurements, alterations and cancellations")}</h2>
            <p>
              {t(
                "Choose body or garment measurements accurately, or ask for assistance. You can cancel online before quote acceptance. Contact the atelier for any later cancellation, fitting issue, alteration or delivery question; work already started may require individual review.",
              )}
            </p>
            <h2>{t("Payment and handover")}</h2>
            <p>
              {t(
                "This website does not collect payment. Any payment, fabric handover, dispatch and collection arrangements must be agreed directly with the atelier. Business-specific refund, fitting and retention policies must be confirmed with the owner before a real order.",
              )}
            </p>
          </>
        )}
        <Notice>
          {t(
            "These explain the application workflow. The owner must review and approve final business and privacy policies before accepting real customer requests.",
          )}
        </Notice>
      </div>
    </div>
  );
}
export function NotFound() {
  useLanguage();
  return (
    <div className="container page">
      <Empty title={t("A loose thread, perhaps.")}>
        {t("We could not find that page.")}
      </Empty>
      <div className="center">
        <Link to="/" className="button">
          {t("Back to the atelier")}
        </Link>
      </div>
    </div>
  );
}
