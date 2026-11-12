import { DesignImage, DesignPresentation } from "../components/DesignGallery";
import { DesignGuideExplorer } from "../components/DesignGuideExplorer";
import { t, localize, labelToken } from "../i18n/core";
import { useLanguage } from "../i18n/Language";
import { useEffect, useState } from "react";
import { HomeCarousel } from "../components/HomeCarousel";
import { DEFAULT_HOMEPAGE } from "../data/homepage";
import { formatSupportSummary, homepageBlock, homepageText, publicHref } from "../lib/public-homepage";
import "../components/public-experience.css";
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
  Leaf,
  Search,
  MessageCircle,
  Mail,
  Instagram,
  Eye,
  EyeOff,
  Truck,
} from "lucide-react";
import { useResource, useSite, prefetchPublicResource } from "../lib/hooks";
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
  const location = useLocation();
  const isBoard = Boolean(
    (design.coverView && !design.coverView.crop) ||
    (design.coverView?.crop &&
      design.coverView.crop.width > design.coverView.crop.height * 1.15) ||
    (!design.coverView && design.coverImageUrl),
  );
  return (
    <Link className="design-card public-design-card" to={`/designs/${design.slug}`} state={location.pathname === "/catalogue" ? { catalogueReturnTo: location.pathname + location.search } : undefined}>
      <div className={`design-image tone-${index % 4} ${isBoard ? "is-board" : ""}`}>
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
        <div className="design-card-meta">
          <span className="eyebrow">
            {design.garment === "suit"
              ? t("SUIT / KAMEEZ")
              : labelToken(design.garment)}
          </span>
          <span className="design-custom-badge">{t("public.card.customBadge")}</span>
        </div>
        <h3>{localize(design, "title")}</h3>
        <p>
          {Number.isSafeInteger(design.startingPricePaise) && design.startingPricePaise >= 0
            ? <>{t("public.card.price")} <strong>{money(design.startingPricePaise)}</strong></>
            : <strong>{t("public.card.pending")}</strong>}
        </p>
        <small>{t("public.card.fabric")}</small>
        <span className="design-card-cta">
          {t("public.card.choose")}
          <ArrowRight size={15} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
function DesignGridSkeleton({ count = 3 }) {
  return (
    <div className="design-grid design-grid-skeleton" aria-busy="true" aria-label={t("Loading\u2026")}>
      {Array.from({ length: count }, (_, index) => (
        <div className="design-card public-design-card design-skeleton-card" key={index} aria-hidden="true">
          <div className="design-image design-skeleton-media" />
          <div className="design-info">
            <span className="skeleton-line short" />
            <span className="skeleton-line title" />
            <span className="skeleton-line medium" />
          </div>
        </div>
      ))}
    </div>
  );
}
export function Home() {
  const { language } = useLanguage();
  const site = useSite();
  const collection = useResource("/designs?limit=3", { publicRead: true });
  const services = useResource("/services?limit=50", { publicRead: true });
  const homepage = site.homepage || {};
  const hero = homepageBlock(homepage.hero, DEFAULT_HOMEPAGE.hero, ["eyebrow", "headline", "description"], language);
  const heroCtas = homepageBlock(homepage.hero, DEFAULT_HOMEPAGE.hero, ["primaryCtaLabel", "secondaryCtaLabel"], language);
  const help = homepageBlock(homepage.help, DEFAULT_HOMEPAGE.help, ["title", "description"], language);
  const designs = homepage.featuredDesigns?.length ? homepage.featuredDesigns.slice(0, 3) : collection.data || [];
  const garments = [...new Set((services.data || []).flatMap((service) => service.itemTypes || []))]
    .filter((garment) => ["kurti", "suit", "blouse", "alteration"].includes(garment));
  const process = Array.isArray(homepage.process) && homepage.process.length === 4 &&
    homepage.process.every((item) => homepageText(item, "title", language) && (!item.description || homepageText(item, "description", language)))
    ? homepage.process : DEFAULT_HOMEPAGE.process;
  const photo = homepage.hero?.imageUrl || site.bannerImageUrl || designs.find((design) => design.coverImageUrl)?.coverImageUrl;
  const faqs = (site.faqs || []).filter((faq) => homepageText(faq, "question", language) && homepageText(faq, "answer", language)).slice(0, 4);
  return (
    <div className="public-home">
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div>
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1>{hero.headline}</h1>
            <p className="home-hero-description">{hero.description}</p>
            <div className="home-hero-actions">
              <Link className="button" to="/catalogue" onMouseEnter={() => prefetchPublicResource("/designs?limit=12&page=1")}>{heroCtas.primaryCtaLabel || t("public.action.explore")}<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link className="button secondary" to="/request?source=reference">{heroCtas.secondaryCtaLabel || t("public.action.reference")}</Link>
            </div>
            <Link className="home-hero-guidance" to="/contact">{t("public.action.guidance")}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <figure className="home-hero-figure">
            <div className="home-hero-showcase">
              <div className="home-hero-showcase-head">
                <span className="home-hero-showcase-tag">
                  <Scissors size={13} aria-hidden="true" />
                  {t("public.hero.cardTag")}
                </span>
                <span className="home-hero-showcase-views">
                  {t("public.hero.cardViews")}
                </span>
              </div>
              <div className={`home-hero-image ${photo ? "has-photo" : "is-illustration"}`}>
                {photo ? (
                  <img src={photo} alt="" fetchPriority="high" />
                ) : (
                  <GarmentArt garment="kurti" large />
                )}
              </div>
              <ul className="home-hero-showcase-foot" aria-label={t("public.commitments.title")}>
                {[1, 2, 3].map((chip) => (
                  <li key={chip}>
                    <Check size={13} aria-hidden="true" />
                    <span>{t(`public.hero.chip${chip}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <figcaption>{t(photo ? "public.designPhoto" : "public.illustration")}</figcaption>
          </figure>
        </div>
      </section>
      <HomeCarousel slides={homepage.slides || DEFAULT_HOMEPAGE.slides} />
      {(garments.length > 0 || services.error) && <section className="container public-section" aria-labelledby="home-garments-title">
        <div className="public-section-heading"><h2 id="home-garments-title">{t("public.garments.title")}</h2><p>{t("public.garments.description")}</p></div>
        {services.error ? <ErrorMessage message={services.error} retry={services.reload} /> : <div className="home-garments">
          {garments.map((garment) => {
            const basePrice = site.garmentBasePrices?.[garment];
            return (
              <article className="home-garment-card" key={garment}>
                <div className="home-garment-art" aria-hidden="true">
                  <GarmentArt garment={garment} />
                </div>
                <div className="home-garment-body">
                  <h3>
                    <Link to={"/catalogue?garment=" + garment}>{t("public.garment." + garment)}</Link>
                  </h3>
                  <p className="home-garment-desc">{t("public.garmentDesc." + garment)}</p>
                  {Number.isSafeInteger(basePrice) && basePrice >= 0 && (
                    <p className="home-garment-price">
                      {t("public.card.price")} <strong>{money(basePrice)}</strong>
                    </p>
                  )}
                  <small className="home-garment-fabric">{t("public.card.fabric")}</small>
                  <Link className="home-garment-cta" to={"/catalogue?garment=" + garment}>
                    {t("public.garmentCta." + garment)}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>}
      </section>}
      <section className="container public-section" aria-labelledby="home-collection-title">
        <div className="public-collection-header">
          <div className="public-section-heading"><h2 id="home-collection-title">{t("public.collection.title")}</h2><p>{t("public.collection.description")}</p></div>
          <ArrowLink to="/catalogue" onMouseEnter={() => prefetchPublicResource("/designs?limit=12&page=1")}>{t("public.nav.all")}</ArrowLink>
        </div>
        {collection.loading && !designs.length ? <DesignGridSkeleton count={3} />
          : collection.error && !designs.length ? <ErrorMessage message={collection.error} retry={collection.reload} />
          : designs.length ? <div className="design-grid">{designs.map((design, index) => <DesignCard key={design._id} design={design} index={index} />)}</div>
          : <Empty title={t("public.collection.empty")}><p>{t("public.collection.emptyHelp")}</p><Link className="button secondary" to="/request?source=reference">{t("public.action.reference")}</Link></Empty>}
      </section>
      <section className="home-process public-section">
        <div className="container">
          <div className="public-section-heading"><h2>{t("public.process.title")}</h2></div>
          <ol className="home-process-grid home-process-compact">{process.map((item, index) => <li key={index}>
            <h3>{homepageText(item, "title", language)}</h3>
          </li>)}</ol>
          <ul className="home-commitments" aria-label={t("public.commitments.title")}>
            {[1, 2, 3, 4].map((step) => (
              <li key={step}>
                <Check size={16} aria-hidden="true" />
                <span>{t(`public.commitments.${step}`)}</span>
              </li>
            ))}
          </ul>
          <ArrowLink to="/how-it-works">{t("public.process.details")}</ArrowLink>
        </div>
      </section>
      <section className="container public-section">
        <div className="home-help">
          <h2>{help.title}</h2><p>{help.description}</p>
          <Link className="button secondary" to="/contact">{t("public.action.guidance")}<ArrowRight size={17} aria-hidden="true" /></Link>
          <HomeResume />
          <details className="public-guides" id="guides"><summary>{t("public.help.guides")}</summary><HomeGuidesShowcase /></details>
        </div>
      </section>
      <SelectedReviews />
      {faqs.length > 0 && <section className="container public-section home-faqs">
        <div className="public-section-heading"><h2>{t("public.faq.title")}</h2></div>
        {faqs.map((faq, index) => <details key={index}><summary>{homepageText(faq, "question", language)}</summary><p>{homepageText(faq, "answer", language)}</p></details>)}
        <ArrowLink to="/contact">{t("public.faq.more")}</ArrowLink>
      </section>}
    </div>
  );
}
function HomeGuidesShowcase() {
  return (
    <section className="section container guides-showcase-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("ATELIER VISUAL REFERENCES")}</p>
          <h2>{t("public.guides.title")}</h2>
          <p className="muted">
            {t(
              "Explore our official styling, neckline, and measurement charts before placing your request.",
            )}
          </p>
        </div>
        <ArrowLink to="/request">{t("Start custom request")}</ArrowLink>
      </div>

      <DesignGuideExplorer />
    </section>
  );
}
function HomeResume() {
  const { profile } = useAuth();
  const { data } = useResource(profile ? "/drafts?limit=1" : null);
  if (!profile) return null;
  return <section className="home-resume"><h3>{t("public.help.saved")}</h3><div className="stack-actions">
    {data?.[0] && <Link className="button secondary" to={`/request?draft=${data[0]._id}`}>{t("public.help.resume")}</Link>}
    <Link className="text-link" to="/request">{t("public.help.new")}</Link>
    <Link className="text-link" to="/account">{t("public.nav.account")}</Link>
  </div></section>;
}
function SelectedReviews() {
  const { data } = useResource("/reviews?limit=3", { publicRead: true });
  if (!data?.length) return null;
  return (
    <section className="container public-section selected-reviews">
      <h2>{t("public.reviews.title")}</h2>
      <p className="small-print">
        {t("public.reviews.note")}
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
  useEffect(() => setSearch(q), [q]);
  const { data, loading, error, pagination, reload } = useResource(
    `/designs?limit=12&page=${page}${garment ? `&garment=${garment}` : ""}${q ? `&search=${encodeURIComponent(q)}` : ""}`,
    { publicRead: true },
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
      {loading && !data?.length ? (
        <DesignGridSkeleton count={6} />
      ) : error && !data?.length ? (
        <ErrorMessage message={error} retry={reload} />
      ) : data?.length ? (
        <>
          <div className={`design-grid ${loading ? "is-reloading" : ""}`} aria-busy={loading}>
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
  const location = useLocation();
  const previous = publicHref(location.state?.catalogueReturnTo);
  const backTo = previous?.startsWith("/catalogue") ? previous : "/catalogue";
  const {
    data: design,
    loading,
    error,
    reload,
  } = useResource(`/designs/${encodeURIComponent(slug)}`, { publicRead: true });
  if (loading) return <Spinner />;
  if (error)
    return (
      <div className="container page">
        <BackLink to={backTo} />
        <ErrorMessage message={error} retry={reload} />
      </div>
    );
  if (!design) return <NotFound />;
  return (
    <div className="container page">
      <BackLink to={backTo} />
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
        title={t("Simple, transparent stitching from your home.")}
      >
        {t(
          "Choose or upload a design, customize every detail, get help from choosing fabric to measurements, and enjoy doorstep pickup & delivery.",
        )}
      </PageHeading>
      <div className="journey">
        {[
          [
            t("Choose our design or share your own"),
            t(
              "Start by picking a kurti, suit/kameez, blouse, or alteration design you want tailored from our collection—or upload your own design reference image.",
            ),
          ],
          [
            t("Select what you want to customize"),
            t(
              "Tell us which parts of the chosen design you want customized—such as the front neck design, back neck design, sleeve design, or sleeve length.",
            ),
          ],
          [
            t("Pick neck & sleeve styles step-by-step—or upload yours"),
            t(
              "Click Next to step through your selected neck and sleeve choices. Pick from our studio options on screen, or upload a photo of your own neck or sleeve pattern.",
            ),
          ],
          [
            t("Enter measurements, delivery address & get help anytime"),
            t(
              "Share your body or well-fitting garment measurements in inches or centimetres along with your delivery address. Need help anywhere? Ask our master tailor—from how to measure right to which fabric to buy for your chosen design.",
            ),
          ],
          [
            t("Review your personal quote before stitching"),
            t(
              "We inspect your design choices, customizations, measurements and pickup preference, then share a clear versioned quote covering stitching and any applicable doorstep pickup/delivery charges. Accept only when you are completely happy.",
            ),
          ],
          [
            t("Doorstep fabric pickup, live tracking & home delivery"),
            t(
              "With doorstep pickup & delivery, we collect your unstitched fabric from home and deliver the stitched outfit back to your door for a sensible fee shown in your quote—or you can arrange atelier handover. Track every stage in My requests.",
            ),
          ],
        ].map(([title, copy], i) => (
          <article key={title}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="how-support-grid">
        <article className="panel how-support-card">
          <Scissors size={22} aria-hidden="true" />
          <h3>{t("Guidance from fabric buying to final fit")}</h3>
          <p>
            {t(
              "Not sure whether cotton, silk, rayon or linen suits a neckline or drape best? Ask our tailor before buying your fabric, and request measurement guidance anytime inside the form or on WhatsApp.",
            )}
          </p>
        </article>
        <article className="panel how-support-card">
          <Truck size={22} aria-hidden="true" />
          <h3>{t("Doorstep fabric pickup & outfit delivery")}</h3>
          <p>
            {t(
              "Skip the trip when you need convenience: your unstitched fabric is picked up right from your doorstep and returned stitched to your address. Pickup and delivery charges are clearly agreed in your quote based on service details.",
            )}
          </p>
        </article>
      </div>
      <Notice>
        {t(
          "Preferred dates are requests, not guaranteed commitments. We will discuss feasibility and agree the final quote before work begins.",
        )}
      </Notice>
      <Link to="/request" className="button">
        {t("Start your stitching request")}
        <ArrowRight size={17} />
      </Link>
    </div>
  );
}
export function Contact() {
  useLanguage();
  const s = useSite();
  const phone = (s.whatsapp || "").replace(/\D/g, "");
  const supportHours = formatSupportSummary(s.support, t);
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
              {t("Chat on WhatsApp")}
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
              {t("Visit Instagram")}
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
        {supportHours && <p><strong>{supportHours}</strong></p>}
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
    if (registering && Array.from(password).length < 12) {
      setError("Choose a password with at least 12 characters.");
      return;
    }
    if (!registering && password.length === 0) {
      setError("Enter your password.");
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
          {t("Continue")}
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
              "public.auth.draftReady",
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
              minLength={registering ? "12" : "1"}
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
