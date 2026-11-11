import { t } from "./i18n/core";
import { LanguageProvider, useLanguage } from "./i18n/Language";
import { Component, useEffect, lazy, Suspense } from "react";
import { Spinner } from "./components/ui";
import "./account.css";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { SiteProvider } from "./lib/hooks";
import { Layout, Protected } from "./components/Layout";
import {
  Home,
  Catalogue,
  Contact,
  DesignDetails,
  HowItWorks,
  Login,
  NotFound,
  Policy,
} from "./pages/Public";
const RequestWizard = lazy(() =>
  import("./pages/RequestFlow").then((m) => ({ default: m.RequestWizard })),
);
const orderPage = (name) =>
  lazy(() => import("./pages/Orders").then((m) => ({ default: m[name] })));
const OrderDetails = orderPage("OrderDetails"),
  Orders = orderPage("Orders"),
  Profile = orderPage("Profile");
const accountPage = (name) =>
  lazy(() =>
    import("./pages/Account").then((module) => ({ default: module[name] })),
  );
const AccountLayout = accountPage("AccountLayout");
const AccountOverview = accountPage("AccountOverview");
const AccountDrafts = accountPage("AccountDrafts");
const AccountMeasurements = accountPage("AccountMeasurements");
const AccountProfile = accountPage("AccountProfile");
const AccountSupport = accountPage("AccountSupport");
const AccountReviews = accountPage("AccountReviews");
const AccountWork = accountPage("AccountWork");
const WorkerWorkspace = accountPage("WorkerWorkspace");
const adminPage = (name) =>
  lazy(() =>
    import("./pages/Admin").then((module) => ({ default: module[name] })),
  );
const AdminAudit = adminPage("AdminAudit");
const AdminCustomers = adminPage("AdminCustomers");
const AdminDashboard = adminPage("AdminDashboard");
const AdminDesigns = adminPage("AdminDesigns");
const AdminLayout = adminPage("AdminLayout");
const AdminMedia = adminPage("AdminMedia");
const AdminOrders = adminPage("AdminOrders");
const AdminSettings = adminPage("AdminSettings");
const AdminTaxonomy = adminPage("AdminTaxonomy");
const AccountSecurity = lazy(() =>
  import("./pages/Security").then((m) => ({ default: m.AccountSecurity })),
);
const PasswordHelp = lazy(() =>
  import("./pages/Security").then((m) => ({ default: m.PasswordHelp })),
);
const AdminSupport = lazy(() =>
  import("./pages/AdminOperations").then((m) => ({ default: m.AdminSupport })),
);
const AdminReviews = lazy(() =>
  import("./pages/AdminOperations").then((m) => ({ default: m.AdminReviews })),
);
const AdminWork = lazy(() =>
  import("./pages/AdminOperations").then((m) => ({ default: m.AdminWork })),
);
const AdminServices = lazy(() =>
  import("./pages/AdminServices").then((m) => ({ default: m.AdminServices })),
);
const AdminMeasurementGuides = lazy(() => import("./pages/AdminMeasurementGuides").then(module=>({default:module.AdminMeasurementGuides})));
const AccountCommerce = lazy(() => import("./pages/Commerce").then(module=>({default:module.AccountCommerce})));
const AdminCommerce = lazy(() => import("./pages/Commerce").then(module=>({default:module.AdminCommerce})));
function ScrollToTop() {
  useLanguage();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
class ErrorBoundary extends Component {
  state = {
    error: false,
  };
  static getDerivedStateFromError() {
    return {
      error: true,
    };
  }
  render() {
    return this.state.error ? (
      <main className="container page">
        <h1>{t("A little snag.")}</h1>
        <p>
          {t(
            "Something did not load correctly. Your last action may not have completed. Check your requests before retrying a submission.",
          )}
        </p>
        <a className="button" href="/">
          {t("Return to the atelier")}
        </a>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function AppRoutes() {
  useLanguage();
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="catalogue" element={<Catalogue />} />
            <Route path="designs/:slug" element={<DesignDetails />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="contact" element={<Contact />} />
            <Route path="privacy" element={<Policy type="privacy" />} />
            <Route path="terms" element={<Policy type="terms" />} />
            <Route path="login" element={<Login />} />
            <Route path="password-help" element={<PasswordHelp />} />
            <Route path="request" element={<RequestWizard />} />
            <Route element={<Protected />}>
              <Route path="orders" element={<Orders />} />
              <Route path="orders/:id" element={<OrderDetails />} />
              <Route path="profile" element={<Profile />} />
              <Route path="worker" element={<WorkerWorkspace />} />
              <Route path="account" element={<AccountLayout />}>
                <Route index element={<AccountOverview />} />
                <Route path="orders" element={<Orders />} />
                <Route path="tracking" element={<Orders />} />
                <Route path="drafts" element={<AccountDrafts />} />
                <Route path="measurements" element={<AccountMeasurements />} />
                <Route path="profile" element={<AccountProfile />} />
                <Route path="support" element={<AccountSupport />} />
                <Route path="reviews" element={<AccountReviews />} />
                <Route path="work" element={<AccountWork />} />
                <Route path="security" element={<AccountSecurity />} />
                <Route path="benefits" element={<AccountCommerce />} />
              </Route>
            </Route>
            <Route element={<Protected admin />}>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="designs" element={<AdminDesigns />} />
                <Route path="categories" element={<AdminTaxonomy />} />
                <Route path="options" element={<AdminTaxonomy options />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="orders/:id" element={<OrderDetails admin />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="media" element={<AdminMedia />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="support" element={<AdminSupport />} />
                <Route path="reviews" element={<AdminReviews />} />
                <Route path="work" element={<AdminWork />} />
                <Route path="services" element={<AdminServices />} />
                <Route path="measurement-guides" element={<AdminMeasurementGuides />} />
                <Route path="commerce" element={<AdminCommerce />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
export default function App() {
  const { language } = useLanguage();
  return (
    <LanguageProvider>
      <ErrorBoundary language={language}>
        <BrowserRouter>
          <AuthProvider>
            <SiteProvider>
              <AppRoutes />
            </SiteProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </LanguageProvider>
  );
}
