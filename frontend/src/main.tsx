import React, {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
  Link,
} from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { AppContext } from "./lib/context";
import { loadCatalog } from "./lib/api";
import type { Catalog, Selection } from "./lib/types";
import { Logo, Footer, Skeleton, Empty } from "./components/UI";
import "./styles.css";
import "./styles/v3.css";
const Home = lazy(() => import("./pages/Home")),
  Explorer = lazy(() => import("./pages/Explorer")),
  Analysis = lazy(() => import("./pages/Analysis")),
  Discoveries = lazy(() => import("./pages/Discoveries")),
  Science = lazy(() => import("./pages/Science")),
  Data = lazy(() => import("./pages/Data")),
  About = lazy(() => import("./pages/About"));
class ErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: { resetKey: string }) {
    // Navigating away from a failed view clears the error.
    if (previous.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? (
      <main className="content-page">
        <Empty title="This view could not load.">
          Try again, or refresh the page. No substitute scientific results are
          generated.
        </Empty>
        <div className="hero-actions">
          <button className="button" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
          <button className="button secondary" onClick={() => location.reload()}>
            Refresh TerraShift
          </button>
        </div>
      </main>
    ) : (
      this.props.children
    );
  }
}
const links = [
  ["/explore", "Explorer"],
  ["/analysis", "Analysis"],
  ["/discoveries", "Earth Stories"],
  ["/science", "The science"],
  ["/data", "Data"],
  ["/about", "About"],
];
function App() {
  const [catalog, setCatalog] = useState<Catalog>(),
    [error, setError] = useState(""),
    [selection, setSelection] = useState<Selection>(),
    [menu, setMenu] = useState(false),
    location = useLocation(),
    reduced = useReducedMotion(),
    // GitHub Pages serves each route as a folder (/explore/), so normalize trailing slashes.
    path = location.pathname.replace(/(.)\/+$/, "$1"),
    explorer = path === "/explore";
  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    document.title = `${path === "/" ? "See the Earth change" : (links.find(([p]) => p === path)?.[1] ?? "Earth observation")} — TerraShift`;
  }, [path]);
  return (
    <AppContext.Provider value={{ catalog, error, selection, setSelection }}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <Logo />
        <nav className={menu ? "open" : ""} aria-label="Main navigation">
          {links.map(([to, label]) => (
            <NavLink to={to} key={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <a
          className="header-repo"
          href="https://github.com/snslighting/terrashift"
          target="_blank"
          rel="noreferrer"
        >
          Open source
          <ArrowUpRight size={14} />
        </a>
        <button
          className="mobile-menu"
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-label={menu ? "Close navigation" : "Open navigation"}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <div id="main-content">
        <ErrorBoundary resetKey={path}>
          <AnimatePresence mode="wait">
            <motion.div
              key={path}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <Suspense
                fallback={
                  <div className="page-loading">
                    <Skeleton label="Opening a new perspective…" />
                  </div>
                }
              >
                <Routes location={location}>
                  <Route path="/" element={<Home />} />
                  <Route path="/explore" element={<Explorer />} />
                  <Route path="/analysis" element={<Analysis />} />
                  <Route path="/discoveries" element={<Discoveries />} />
                  <Route path="/science" element={<Science />} />
                  <Route path="/data" element={<Data />} />
                  <Route path="/about" element={<About />} />
                  <Route
                    path="*"
                    element={
                      <main className="content-page">
                        <Empty title="This perspective isn’t here.">
                          Return to the explorer or the home page.
                        </Empty>
                        <Link to="/explore" className="button">
                          Open explorer
                        </Link>
                      </main>
                    }
                  />
                </Routes>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </div>
      {!explorer && <Footer />}
    </AppContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
