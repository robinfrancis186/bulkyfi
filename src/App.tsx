import {
  Award,
  CheckCircle2,
  Download,
  FileText,
  FileSpreadsheet,
  FolderOpen,
  History,
  ImagePlus,
  LogOut,
  MousePointer2,
  PanelsTopLeft,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Wand2,
  Zap
} from "lucide-react";
import Papa from "papaparse";
import { useEffect, useRef, useState } from "react";
import { downloadBlob, exportSizeForProject, makePdfBlob, renderProjectToImage, renderProjectToPng, zipCertificates } from "./exporter";
import { loadFontData, loadLogoData, loadTemplateData, saveFontData, saveLogoData, saveTemplateData } from "./indexedDb";
import { createProject, loadProjects, nowIso, saveProjects, uid } from "./storage";
import { builtInTemplates, type BuiltInTemplate } from "./templateLibrary";
import type { CertificateField, CustomFont, LogoElement, Project, RecipientRow, TemplateAsset } from "./types";

const APP_NAME = "BulkyFi";
const FONT_CHOICES = ["Inter", "Cormorant Garamond", "Georgia", "Arial"];

type Route =
  | { name: "landing" }
  | { name: "login" }
  | { name: "dashboard" }
  | { name: "history" }
  | { name: "fonts" }
  | { name: "editor"; id: string };

type DragState =
  | {
      mode: "move";
      kind: "field" | "logo";
      id: string;
      startX: number;
      startY: number;
      canvasWidth: number;
      canvasHeight: number;
      original: { x: number; y: number; width: number; height: number };
    }
  | {
      mode: "resize";
      kind: "field" | "logo";
      id: string;
      startX: number;
      startY: number;
      canvasWidth: number;
      canvasHeight: number;
      original: { x: number; y: number; width: number; height: number };
    };

const DEFAULT_TEMPLATE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1131">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#fdfbf7"/>
      <stop offset="0.54" stop-color="#faf6ed"/>
      <stop offset="1" stop-color="#fdfbf7"/>
    </linearGradient>
    <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
      <path d="M44 0H0V44" fill="none" stroke="#1a1612" stroke-opacity=".04" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1600" height="1131" fill="url(#paper)"/>
  <rect width="1600" height="1131" fill="url(#grid)"/>
  <rect x="92" y="92" width="1416" height="947" rx="36" fill="none" stroke="#0071e3" stroke-width="7"/>
  <rect x="124" y="124" width="1352" height="883" rx="24" fill="none" stroke="#0071e3" stroke-opacity=".45" stroke-width="2"/>
  <circle cx="800" cy="252" r="58" fill="#1a1612"/>
  <path d="M772 241h56M772 261h37" stroke="#2aa7ff" stroke-width="8" stroke-linecap="round"/>
  <circle cx="842" cy="279" r="28" fill="#2aa7ff"/>
  <path d="M828 279l10 11 21-25" fill="none" stroke="#1a1612" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="800" y="382" text-anchor="middle" font-family="Georgia, serif" font-size="70" fill="#1a1612">Certificate of Achievement</text>
  <text x="800" y="466" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" letter-spacing="5" fill="#9a8b6d">PROUDLY PRESENTED TO</text>
  <text x="800" y="678" text-anchor="middle" font-family="Arial, sans-serif" font-size="29" fill="#7d6f55">for successfully completing</text>
  <line x1="292" y1="887" x2="568" y2="887" stroke="#7d6f55" stroke-width="2"/>
  <line x1="1032" y1="887" x2="1308" y2="887" stroke="#7d6f55" stroke-width="2"/>
  <text x="430" y="929" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#7d6f55">Date</text>
  <text x="1170" y="929" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#7d6f55">Director</text>
</svg>`);

const routeFromPath = (): Route => {
  const path = window.location.pathname;
  if (path === "/login" || path === "/auth/login") return { name: "login" };
  if (path === "/dashboard") return { name: "dashboard" };
  if (path === "/history") return { name: "history" };
  if (path === "/fonts") return { name: "fonts" };
  const editorMatch = path.match(/^\/editor\/([^/]+)/);
  if (editorMatch) return { name: "editor", id: editorMatch[1] };
  return { name: "landing" };
};

const pathFromRoute = (route: Route) => {
  if (route.name === "login") return "/login";
  if (route.name === "dashboard") return "/dashboard";
  if (route.name === "history") return "/history";
  if (route.name === "fonts") return "/fonts";
  if (route.name === "editor") return `/editor/${route.id}`;
  return "/";
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value)
  );

const getImageSize = (dataUrl: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1600, height: image.naturalHeight || 1131 });
    image.onerror = reject;
    image.src = dataUrl;
  });

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fontNameFromFile = (file: File) =>
  file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/gi, "")
    .trim()
    .replace(/\s+/g, " ") || "Custom Font";

const fontFamilyFromName = (name: string) => `BulkyFi ${name} ${uid().slice(0, 6)}`;

const fontChoicesForProject = (project?: Project) => [
  ...FONT_CHOICES.map((font) => ({ label: font, family: font, kind: "Built-in" })),
  ...(project?.customFonts || []).map((font) => ({ label: font.name, family: font.family, kind: "Uploaded" }))
];

const urlToDataUrl = async (url: string) => {
  const blob = await fetch(url).then((response) => {
    if (!response.ok) throw new Error("Template could not be loaded.");
    return response.blob();
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

function App() {
  const [route, setRoute] = useState<Route>(routeFromPath);
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [isAuthed, setIsAuthed] = useState(
    () =>
      localStorage.getItem("bulkyfi.local.session") === "true" ||
      localStorage.getItem("easycertify.local.session") === "true"
  );
  const [templatesReady, setTemplatesReady] = useState(false);

  useEffect(() => {
    if (templatesReady) saveProjects(projects);
  }, [projects, templatesReady]);

  useEffect(() => {
    let cancelled = false;
    const hydrateAssets = async () => {
      const hydrated = await Promise.all(
        loadProjects().map(async (project) => {
          const template =
            project.template && !project.template.dataUrl
              ? await loadTemplateData(project.template.storageKey || project.template.id).then((dataUrl) =>
                  dataUrl ? { ...project.template!, dataUrl } : project.template
                )
              : project.template;
          const customFonts = await Promise.all(
            (project.customFonts || []).map(async (font) => {
              if (font.dataUrl) return font;
              const dataUrl = await loadFontData(font.storageKey || font.id);
              return dataUrl ? { ...font, dataUrl } : font;
            })
          );
          const logoElements = await Promise.all(
            (project.logoElements || []).map(async (logo) => {
              if (logo.dataUrl) return logo;
              const dataUrl = await loadLogoData(logo.storageKey || logo.id);
              return dataUrl ? { ...logo, dataUrl } : logo;
            })
          );
          return { ...project, template, customFonts, logoElements };
        })
      );
      await Promise.all(
        hydrated.flatMap((project) => [
          project.template?.dataUrl
            ? saveTemplateData(project.template.storageKey || project.template.id, project.template.dataUrl)
            : Promise.resolve(),
          ...(project.customFonts || []).map((font) =>
            font.dataUrl ? saveFontData(font.storageKey || font.id, font.dataUrl) : Promise.resolve()
          ),
          ...(project.logoElements || []).map((logo) =>
            logo.dataUrl ? saveLogoData(logo.storageKey || logo.id, logo.dataUrl) : Promise.resolve()
          )
        ])
      );
      if (!cancelled) setProjects(hydrated);
      if (!cancelled) setTemplatesReady(true);
    };
    hydrateAssets().catch(() => setTemplatesReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => setRoute(routeFromPath());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const navigate = (next: Route) => {
    window.history.pushState({}, "", pathFromRoute(next));
    setRoute(next);
    window.scrollTo({ top: 0 });
  };

  const updateProject = (project: Project) => {
    setProjects((current) =>
      current.map((item) => (item.id === project.id ? { ...project, updatedAt: nowIso() } : item))
    );
  };

  const createAndOpenProject = (name?: string) => {
    const project = createProject(name || "Certificate Batch");
    setProjects((current) => [project, ...current]);
    navigate({ name: "editor", id: project.id });
  };

  const signIn = () => {
    localStorage.setItem("bulkyfi.local.session", "true");
    setIsAuthed(true);
    navigate({ name: "dashboard" });
  };

  const signOut = () => {
    localStorage.removeItem("bulkyfi.local.session");
    localStorage.removeItem("easycertify.local.session");
    setIsAuthed(false);
    navigate({ name: "landing" });
  };

  if (route.name === "login") return <LoginPage onSignIn={signIn} navigate={navigate} />;
  if (route.name === "dashboard")
    return (
      <Dashboard
        isAuthed={isAuthed}
        projects={projects}
        createProject={createAndOpenProject}
        navigate={navigate}
        signOut={signOut}
      />
    );
  if (route.name === "history")
    return (
      <HistoryPage
        isAuthed={isAuthed}
        projects={projects}
        navigate={navigate}
        signOut={signOut}
      />
    );
  if (route.name === "fonts")
    return (
      <FontsPage
        isAuthed={isAuthed}
        projects={projects}
        updateProject={updateProject}
        navigate={navigate}
        signOut={signOut}
      />
    );
  if (route.name === "editor") {
    const project = projects.find((item) => item.id === route.id);
    return (
      <EditorPage
        isAuthed={isAuthed}
        project={project}
        updateProject={updateProject}
        navigate={navigate}
        signOut={signOut}
      />
    );
  }
  return <LandingPage navigate={navigate} />;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${compact ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"} brand-mark`}>
        <Award size={compact ? 18 : 24} />
      </div>
      <span className={`${compact ? "text-xl" : "text-2xl"} font-display font-bold text-ink-900`}>
        {APP_NAME}
      </span>
    </div>
  );
}

function LandingPage({ navigate }: { navigate: (route: Route) => void }) {
  return (
    <div className="site-shell min-h-screen selection:bg-gold-500/20">
      <header className="site-header fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Brand />
          <button className="btn-primary px-8" onClick={() => navigate({ name: "login" })}>
            Sign In
          </button>
        </div>
      </header>

      <main className="pt-32">
        <section className="mx-auto grid max-w-7xl items-center gap-16 px-6 pb-24 lg:grid-cols-2">
          <div className="animate-fadeIn">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold-500">
              <CheckCircle2 size={12} /> Engineered for batch precision
            </div>
            <h1 className="hero-title mb-8 font-display text-6xl leading-[1.02] text-ink-900 xl:text-7xl">
              Bulk certificates. <span>Designed to feel instant.</span>
            </h1>
            <p className="mb-10 max-w-xl text-lg leading-relaxed text-ink-500">
              Turn your spreadsheets into thousands of high-fidelity certificates in seconds. Perfect
              for universities, online courses, and corporate training.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button className="btn-gold px-10 py-4 text-base shadow-2xl" onClick={() => navigate({ name: "login" })}>
                Get Started Now
              </button>
              <a href="#features" className="btn-outline px-8 py-4 text-base">
                How it works
              </a>
            </div>
            <div className="mt-12 flex flex-wrap items-center gap-8 text-ink-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" size={18} />
                <span className="text-xs font-medium uppercase tracking-wider">Secure PDF Exports</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="text-amber-500" size={18} />
                <span className="text-xs font-medium uppercase tracking-wider">Lightning Bulk Processing</span>
              </div>
            </div>
          </div>
          <div className="relative hidden animate-fadeIn lg:block">
            <div className="absolute inset-0 -z-10 scale-75 rounded-full bg-gold-500/20 blur-[100px]" />
            <div className="hero-device rounded-[40px] border border-ink-100 bg-white p-4 shadow-strong">
              <div className="relative aspect-square overflow-hidden rounded-[32px] bg-parchment-100">
                <HeroVisual />
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 animate-float rounded-3xl bg-ink-900 p-6 shadow-2xl">
              <div className="font-display text-3xl font-medium text-gold-500">High-Res</div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-parchment-300">
                Pixel-Perfect Export
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="feature-band overflow-hidden border-y border-ink-100 bg-white py-32">
          <div className="mx-auto mb-20 max-w-7xl px-6 text-center">
            <h2 className="mb-4 font-display text-4xl text-ink-900">Crafted for Excellence</h2>
            <p className="mx-auto max-w-2xl text-ink-500">
              Everything you need to manage your certification workflow at scale.
            </p>
          </div>
          <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-3">
            <Feature
              icon={<PanelsTopLeft size={32} />}
              title="1. Compose"
              body="Upload your desired certificate template and easily add necessary fields, placeholders, and dynamic signatures with our precision layout tools."
            />
            <Feature
              icon={<FileSpreadsheet size={32} />}
              title="2. Connect"
              body="Upload CSV or manually add the data if it is less. Instantly map your columns to the placeholders. We handle the formatting and smart distribution for you."
            />
            <Feature
              icon={<Download size={32} />}
              title="3. Deliver"
              body="Export thousands of high-resolution PDFs or high-quality PNGs in a single ZIP. Ready for distribution in minutes."
            />
          </div>
          <div className="mx-auto mt-24 max-w-5xl px-6">
            <div className="relative aspect-[16/9] overflow-hidden rounded-[40px] border-8 border-parchment-100 shadow-2xl">
              <WorkflowVisual />
            </div>
          </div>
        </section>

        <section className="px-6 py-32">
          <div className="cta-panel relative mx-auto max-w-4xl overflow-hidden rounded-[48px] bg-ink-900 p-16 text-center shadow-[0_32px_80px_-20px_rgba(26,22,18,0.4)]">
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-gold-500/10 blur-[80px]" />
            <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-gold-500/10 blur-[80px]" />
            <h2 className="relative z-10 mb-8 font-display text-5xl text-parchment-100">
              Ready to automate your <br />
              <span className="text-gold-500">certification process?</span>
            </h2>
            <button className="btn-gold relative z-10 px-12 py-5 text-lg" onClick={() => navigate({ name: "login" })}>
              Get Started for Free
            </button>
            <p className="relative z-10 mt-8 text-sm text-ink-400">No credit card required · Instant setup</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="feature-card group space-y-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-ink-100 bg-parchment-50 text-ink-900 shadow-sm transition-all duration-300 group-hover:bg-ink-900 group-hover:text-gold-500">
        {icon}
      </div>
      <h3 className="font-display text-2xl font-medium text-ink-900">{title}</h3>
      <p className="leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer-glass border-t border-ink-100 bg-white py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 md:flex-row">
        <Brand compact />
        <div className="text-center text-sm text-ink-500 md:text-left">© 2026 {APP_NAME}. All rights reserved.</div>
        <div className="flex flex-col items-center gap-3 md:items-end">
          <SupportBadge />
          <div className="text-center text-[10px] font-medium text-ink-500 md:text-right">
            Local-first rebuild for certificate generation.
          </div>
        </div>
      </div>
    </footer>
  );
}

function SupportBadge() {
  return (
    <a
      className="chai-support"
      href="https://chai4.me/robin"
      target="_blank"
      rel="noopener noreferrer"
      title="Support robin on Chai4Me"
      aria-label="Support robin on Chai4Me"
    >
      <img src="https://chai4.me/icons/wordmark.png" alt="Chai4Me" />
      <span>@robin</span>
    </a>
  );
}

function LoginPage({ onSignIn, navigate }: { onSignIn: () => void; navigate: (route: Route) => void }) {
  return (
    <div className="auth-bg min-h-screen overflow-hidden">
      <button className="absolute left-6 top-6 text-sm font-medium text-ink-500 hover:text-ink-900" onClick={() => navigate({ name: "landing" })}>
        Back to site
      </button>
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm animate-fadeIn">
          <div className="mb-10 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-ink-900 to-ink-800 text-gold-500 shadow-medium">
              <CreditCardIcon />
            </div>
            <h1 className="font-display text-4xl font-medium tracking-tight text-ink-900">{APP_NAME}</h1>
            <p className="mt-2 text-sm text-ink-500">Professional certificate generation</p>
          </div>
          <div className="rounded-2xl border border-ink-100/60 bg-white/90 p-8 shadow-strong backdrop-blur-sm">
            <h2 className="mb-1 font-display text-xl text-ink-800">Welcome back</h2>
            <p className="mb-7 text-sm text-ink-500">Sign in to access your certificate workspace</p>
            <button
              className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-800 shadow-soft transition-all hover:border-ink-300 hover:bg-parchment-50 hover:shadow-medium"
              onClick={onSignIn}
            >
              <Sparkles size={20} className="text-gold-500" />
              Continue locally
            </button>
          </div>
          <p className="mt-6 text-center text-xs text-ink-400">© 2026 {APP_NAME}</p>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  isAuthed,
  projects,
  createProject,
  navigate,
  signOut
}: {
  isAuthed: boolean;
  projects: Project[];
  createProject: (name?: string) => void;
  navigate: (route: Route) => void;
  signOut: () => void;
}) {
  const [name, setName] = useState("");
  if (!isAuthed) return <AuthRedirect navigate={navigate} />;

  return (
    <div className="app-page min-h-screen">
      <AppShell active="dashboard" signOut={signOut} navigate={navigate} />
      <main className="workspace-main mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-gold-600">Workspace</p>
            <h1 className="font-display text-5xl text-ink-900">Welcome to {APP_NAME}</h1>
            <p className="mt-4 max-w-2xl text-ink-500">
              Generate beautiful, professional certificates in minutes.
            </p>
          </div>
          <div className="control-card rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
            <label className="label" htmlFor="project-name">
              New project name
            </label>
            <div className="mt-3 flex gap-2">
              <input
                id="project-name"
                className="input"
                value={name}
                placeholder="Leadership Cohort"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") createProject(name);
                }}
              />
              <button className="btn-primary shrink-0" onClick={() => createProject(name)}>
                <Plus size={18} /> Create
              </button>
            </div>
          </div>
        </section>

        <div className="mb-10 grid gap-5 lg:grid-cols-3">
          <DashboardAction
            icon={<Award size={22} />}
            title="Generate Certificates"
            body="Create certificates from your templates"
            onClick={() => createProject("Certificate Batch")}
          />
          <DashboardAction
            icon={<FileText size={22} />}
            title="Manage Templates"
            body="Upload and configure certificate templates"
            onClick={() => (projects[0] ? navigate({ name: "editor", id: projects[0].id }) : createProject("Template Setup"))}
          />
          <DashboardAction
            icon={<Type size={22} />}
            title="Bulk Import"
            body="Map CSV rows and preview every recipient"
            onClick={() => (projects[0] ? navigate({ name: "editor", id: projects[0].id }) : createProject("Bulk Import"))}
          />
        </div>
        <section className="overview-panel mb-10 rounded-[28px] border border-ink-100 bg-white p-8 shadow-soft">
          <h2 className="font-display text-3xl text-ink-900">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <HowStep number="01" title="Upload a template" body="Add your certificate background as PNG, JPG, SVG, or PDF." />
            <HowStep number="02" title="Configure placement" body="Set where names and descriptions appear, choose fonts and styling." />
            <HowStep number="03" title="Enter names" body="Type names manually or upload a CSV for bulk generation." />
            <HowStep number="04" title="Preview & Download" body="Preview each certificate, then export as PNG, PDF, or ZIP." />
          </div>
        </section>

        {projects.length === 0 ? (
          <div className="empty-state rounded-[32px] border border-dashed border-ink-200 bg-white p-12 text-center shadow-soft">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-ink-900 text-gold-500">
              <Wand2 size={30} />
            </div>
            <h2 className="font-display text-3xl text-ink-900">No projects yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-500">
              Start with the built-in certificate layout, then upload your own template when you are ready.
            </p>
            <button className="btn-gold mt-8 px-8 py-3" onClick={() => createProject("Certificate Batch")}>
              Create first project
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className="project-card group rounded-2xl border border-ink-100 bg-white p-5 text-left shadow-soft transition-all hover:-translate-y-1 hover:shadow-medium"
                  onClick={() => navigate({ name: "editor", id: project.id })}
                >
                  <div className="mb-5 overflow-hidden rounded-xl border border-ink-100 bg-parchment-100">
                    <div className="aspect-[1.414/1]">
                      <CertificatePreview project={project} row={project.rows[0]} readonly />
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-2xl text-ink-900">{project.name}</h2>
                      <p className="mt-1 text-sm text-ink-500">
                        {project.rows.length} recipient{project.rows.length === 1 ? "" : "s"} · {project.fields.length} fields
                      </p>
                    </div>
                    <span className="rounded-full bg-parchment-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                      {project.exportSettings.format}
                    </span>
                  </div>
                  <p className="mt-5 text-xs text-ink-400">Updated {formatDate(project.updatedAt)}</p>
                </button>
              ))}
            </div>
        )}
      </main>
    </div>
  );
}

function HistoryPage({
  isAuthed,
  projects,
  navigate,
  signOut
}: {
  isAuthed: boolean;
  projects: Project[];
  navigate: (route: Route) => void;
  signOut: () => void;
}) {
  if (!isAuthed) return <AuthRedirect navigate={navigate} />;
  const orderedProjects = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="app-page min-h-screen">
      <AppShell active="history" signOut={signOut} navigate={navigate} />
      <main className="workspace-main mx-auto max-w-6xl px-6 py-10">
        <section className="mb-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-gold-600">Workspace history</p>
          <h1 className="font-display text-5xl text-ink-900">Recent activity</h1>
          <p className="mt-4 max-w-2xl text-ink-500">
            Review your certificate projects, update times, template status, and batch size.
          </p>
        </section>

        {orderedProjects.length === 0 ? (
          <div className="empty-state rounded-[32px] border border-dashed border-ink-200 bg-white p-12 text-center shadow-soft">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-ink-900 text-gold-500">
              <History size={30} />
            </div>
            <h2 className="font-display text-3xl text-ink-900">No history yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-ink-500">
              Create a project or update a certificate to see it here.
            </p>
            <button className="btn-gold mt-8 px-8 py-3" onClick={() => navigate({ name: "dashboard" })}>
              Go to dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {orderedProjects.map((project) => (
              <button
                key={project.id}
                className="history-row"
                onClick={() => navigate({ name: "editor", id: project.id })}
              >
                <span className="history-icon">
                  <FileText size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-xl text-ink-900">{project.name}</span>
                  <span className="mt-1 block text-sm text-ink-500">
                    Updated {formatDate(project.updatedAt)} · {project.rows.length} recipient{project.rows.length === 1 ? "" : "s"} · {project.fields.length} placeholders
                  </span>
                </span>
                <span className="history-meta">
                  {project.template?.name || "Default template"} · {project.exportSettings.format.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ProjectFontFaces({ project }: { project?: Project }) {
  const css = (project?.customFonts || [])
    .filter((font) => font.dataUrl)
    .map(
      (font) => `
@font-face {
  font-family: "${font.family.replace(/"/g, '\\"')}";
  src: url("${font.dataUrl}");
  font-display: swap;
}`
    )
    .join("\n");

  return css ? <style>{css}</style> : null;
}

function FontsPage({
  isAuthed,
  projects,
  updateProject,
  navigate,
  signOut
}: {
  isAuthed: boolean;
  projects: Project[];
  updateProject: (project: Project) => void;
  navigate: (route: Route) => void;
  signOut: () => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || "");
  const [notice, setNotice] = useState("");
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || projects[0];
  const availableFonts = fontChoicesForProject(selectedProject);

  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
  }, [projects, selectedProjectId]);

  if (!isAuthed) return <AuthRedirect navigate={navigate} />;

  const applyFont = (fontFamily: string) => {
    if (!selectedProject) return;
    updateProject({
      ...selectedProject,
      fields: selectedProject.fields.map((field) => ({ ...field, fontFamily }))
    });
    setNotice("Font applied to every placeholder in this project.");
  };

  const uploadFont = async (file?: File) => {
    if (!file || !selectedProject) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const name = fontNameFromFile(file);
      const font: CustomFont = {
        id: uid(),
        name,
        family: fontFamilyFromName(name),
        mimeType: file.type || "font/unknown",
        dataUrl,
        storageKey: uid()
      };
      await saveFontData(font.storageKey || font.id, dataUrl);
      const face = new FontFace(font.family, `url(${dataUrl})`);
      await face.load();
      document.fonts.add(face);
      updateProject({
        ...selectedProject,
        customFonts: [...(selectedProject.customFonts || []), font]
      });
      setNotice(`${name} is ready in the editor and exports.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Font upload failed.");
    }
  };

  return (
    <div className="app-page min-h-screen">
      <ProjectFontFaces project={selectedProject} />
      <AppShell active="fonts" signOut={signOut} navigate={navigate} />
      <main className="workspace-main mx-auto max-w-6xl px-6 py-10">
        <section className="mb-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-gold-600">Fonts</p>
          <h1 className="font-display text-5xl text-ink-900">Project typography</h1>
          <p className="mt-4 max-w-2xl text-ink-500">
            Preview supported certificate fonts and apply one across all placeholders in a project.
          </p>
        </section>

        <div className="overview-panel rounded-[28px] border border-ink-100 bg-white p-6 shadow-soft">
          <div className="mb-6 grid gap-4 md:grid-cols-[1fr_280px] md:items-end">
            <div>
              <h2 className="section-title">Available fonts</h2>
              <p className="section-sub">These fonts are available in the certificate editor and exports.</p>
            </div>
            <label>
              <span className="label">Apply to project</span>
              <select
                className="input mt-2"
                value={selectedProject?.id || ""}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                {projects.length === 0 && <option value="">No projects yet</option>}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={`upload-box mb-5 ${!selectedProject ? "pointer-events-none opacity-50" : ""}`}>
            <Upload size={22} />
            <span className="font-medium">Upload TTF, OTF, WOFF, or WOFF2</span>
            <span className="text-xs text-ink-400">Uploaded fonts stay inside this browser and project.</span>
            <input
              className="sr-only"
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/font-woff,application/x-font-ttf"
              disabled={!selectedProject}
              onChange={(event) => uploadFont(event.target.files?.[0])}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            {availableFonts.map((font) => (
              <button
                key={font.family}
                className="font-card"
                onClick={() => applyFont(font.family)}
                disabled={!selectedProject}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-bold text-ink-500">
                  <span>{font.label}</span>
                  <span className="rounded-full bg-parchment-100 px-2 py-1 text-[10px] uppercase tracking-wider">{font.kind}</span>
                </span>
                <span className="mt-3 block text-3xl text-ink-900" style={{ fontFamily: font.family }}>
                  Certificate Preview
                </span>
                <span className="mt-2 block text-sm text-ink-400" style={{ fontFamily: font.family }}>
                  Names, courses, dates, and signatures.
                </span>
              </button>
            ))}
          </div>

          {notice && <p className="mt-5 rounded-xl bg-parchment-100 px-4 py-3 text-sm text-ink-600">{notice}</p>}

          {selectedProject && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-parchment-100 px-4 py-3">
              <span className="text-sm text-ink-500">
                Editing fonts for <b className="text-ink-900">{selectedProject.name}</b>
              </span>
              <button className="btn-primary py-2 text-sm" onClick={() => navigate({ name: "editor", id: selectedProject.id })}>
                Open editor
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function EditorPage({
  isAuthed,
  project,
  updateProject,
  navigate,
  signOut
}: {
  isAuthed: boolean;
  project?: Project;
  updateProject: (project: Project) => void;
  navigate: (route: Route) => void;
  signOut: () => void;
}) {
  const [tab, setTab] = useState<"design" | "data" | "export">("design");
  const [selectedFieldId, setSelectedFieldId] = useState<string | undefined>(project?.fields[0]?.id);
  const [selectedLogoId, setSelectedLogoId] = useState<string | undefined>();
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>(project?.rows[0]?.id);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const projectId = project?.id;
  const firstFieldId = project?.fields[0]?.id;
  const firstRowId = project?.rows[0]?.id;

  useEffect(() => {
    setSelectedFieldId(firstFieldId);
    setSelectedRowId(firstRowId);
  }, [projectId, firstFieldId, firstRowId]);

  if (!isAuthed) return <AuthRedirect navigate={navigate} />;
  if (!project) {
    return (
      <div className="app-page min-h-screen">
        <AppShell active="editor" signOut={signOut} navigate={navigate} />
        <main className="workspace-main mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="font-display text-4xl text-ink-900">Project not found</h1>
          <button className="btn-primary mt-8" onClick={() => navigate({ name: "dashboard" })}>
            Back to dashboard
          </button>
        </main>
      </div>
    );
  }

  const selectedField = project.fields.find((field) => field.id === selectedFieldId);
  const selectedLogo = (project.logoElements || []).find((logo) => logo.id === selectedLogoId);
  const selectedRow = project.rows.find((row) => row.id === selectedRowId) || project.rows[0];
  const size = exportSizeForProject(project);
  const missingMappings = project.fields.filter((field) => !project.mappings[field.placeholder]);

  const patchProject = (patch: Partial<Project>) => updateProject({ ...project, ...patch });
  const patchField = (id: string, patch: Partial<CertificateField>) =>
    patchProject({ fields: project.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)) });
  const patchLogo = (id: string, patch: Partial<LogoElement>) =>
    patchProject({
      logoElements: (project.logoElements || []).map((logo) => (logo.id === id ? { ...logo, ...patch } : logo))
    });
  const selectField = (id: string) => {
    setSelectedFieldId(id);
    setSelectedLogoId(undefined);
  };
  const selectLogo = (id?: string) => {
    setSelectedLogoId(id);
    if (id) setSelectedFieldId(undefined);
  };

  const renderRow = async (row: RecipientRow) => {
    if (project.exportSettings.format === "pdf") {
      return renderProjectToImage(project, row, { mimeType: "image/jpeg", quality: 0.9 });
    }
    return renderProjectToPng(project, row);
  };

  const exportCurrent = async () => {
    if (!selectedRow) return;
    setExporting(true);
    try {
      const png = await renderRow(selectedRow);
      const filename = selectedRow.values.name || selectedRow.values[project.mappings.name] || project.name;
      if (project.exportSettings.format === "png") {
        downloadBlob(await (await fetch(png)).blob(), `${filename}.png`);
      } else {
        downloadBlob(await makePdfBlob(png, size.width, size.height), `${filename}.pdf`);
      }
      setNotice("Certificate exported.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const exportZip = async () => {
    setExporting(true);
    try {
      const zip = await zipCertificates(project, project.rows, renderRow, size);
      downloadBlob(zip, `${project.name.replace(/[^a-z0-9]+/gi, "-") || "certificates"}.zip`);
      setNotice(`Exported ${project.rows.length} certificates.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Batch export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app-page min-h-screen">
      <ProjectFontFaces project={project} />
      <AppShell active="editor" signOut={signOut} navigate={navigate} />
      <main className="workspace-main mx-auto max-w-[1500px] px-5 py-6">
        <div className="command-bar mb-5 flex flex-col justify-between gap-4 rounded-2xl border border-ink-100 bg-white p-4 shadow-soft lg:flex-row lg:items-center">
          <div>
            <input
              className="w-full bg-transparent font-display text-3xl text-ink-900 outline-none"
              value={project.name}
              onChange={(event) => patchProject({ name: event.target.value })}
              aria-label="Project name"
            />
            <p className="text-sm text-ink-500">
              {project.fields.length} placeholders · {project.rows.length} recipients · Local autosave
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["design", "data", "export"] as const).map((item) => (
              <button key={item} className={`tab-button ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <aside className="panel">
            {tab === "design" && (
              <DesignPanel
                project={project}
                selectedField={selectedField}
                selectedLogo={selectedLogo}
                setNotice={setNotice}
                patchProject={patchProject}
                patchField={patchField}
                patchLogo={patchLogo}
                selectField={selectField}
                selectLogo={selectLogo}
              />
            )}
            {tab === "data" && (
              <DataPanel project={project} patchProject={patchProject} setSelectedRowId={setSelectedRowId} setNotice={setNotice} />
            )}
            {tab === "export" && (
              <ExportPanel
                project={project}
                patchProject={patchProject}
                exportCurrent={exportCurrent}
                exportZip={exportZip}
                exporting={exporting}
                missingCount={missingMappings.length}
              />
            )}
          </aside>

          <section className="panel min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="section-title">Live preview</h2>
                <p className="section-sub">
                  Drag fields on the certificate. Resize from the bottom-right handle.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-parchment-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-500">
                <MousePointer2 size={14} /> {selectedRow?.values.name || "Preview row"}
              </div>
            </div>
            <div className="editor-stage-wrap">
              <div className="editor-stage">
                <CertificatePreview
                  project={project}
                  row={selectedRow}
                  selectedFieldId={selectedFieldId}
                  selectedLogoId={selectedLogoId}
                  selectField={selectField}
                  selectLogo={selectLogo}
                  patchField={patchField}
                  patchLogo={patchLogo}
                />
              </div>
            </div>
            {notice && <p className="mt-4 rounded-xl bg-parchment-100 px-4 py-3 text-sm text-ink-600">{notice}</p>}
          </section>

          <aside className="panel">
            <RowsPanel project={project} selectedRowId={selectedRow?.id} setSelectedRowId={setSelectedRowId} patchProject={patchProject} />
          </aside>
        </div>
      </main>
    </div>
  );
}

function AuthRedirect({ navigate }: { navigate: (route: Route) => void }) {
  return (
    <div className="app-page flex min-h-screen items-center justify-center px-6 text-center">
      <div>
        <Brand />
        <h1 className="mt-8 font-display text-4xl text-ink-900">Sign in locally to continue</h1>
        <button className="btn-primary mt-8" onClick={() => navigate({ name: "login" })}>
          Go to login
        </button>
      </div>
    </div>
  );
}

function DashboardAction({
  icon,
  title,
  body,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button className="dashboard-action group text-left" onClick={onClick}>
      <span className="dashboard-action-icon">{icon}</span>
      <span className="mt-6 block font-display text-xl text-ink-900">{title}</span>
      <span className="mt-2 block text-sm leading-relaxed text-ink-500">{body}</span>
      <span className="mt-6 block text-sm font-medium text-gold-600">Get started →</span>
    </button>
  );
}

function HowStep({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">
        {number}
      </span>
      <div>
        <h3 className="font-semibold text-ink-900">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-500">{body}</p>
      </div>
    </div>
  );
}

function AppShell({
  active,
  signOut,
  navigate
}: {
  active?: Route["name"];
  signOut: () => void;
  navigate: (route: Route) => void;
}) {
  return (
    <aside className="workspace-sidebar">
      <div>
        <button className="sidebar-brand" onClick={() => navigate({ name: "dashboard" })} aria-label="Go to dashboard">
          <Brand compact />
        </button>
        <button className="workspace-switch" onClick={() => navigate({ name: "dashboard" })}>
          <FolderOpen size={16} />
          <span>Personal</span>
        </button>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <button onClick={() => navigate({ name: "dashboard" })}>
            <FileText size={17} /> Templates
          </button>
          <button onClick={() => navigate({ name: "dashboard" })}>
            <Award size={17} /> Generate
          </button>
          <button className={active === "history" ? "active" : ""} onClick={() => navigate({ name: "history" })}>
            <History size={17} /> History
          </button>
          <button className={active === "fonts" ? "active" : ""} onClick={() => navigate({ name: "fonts" })}>
            <Type size={17} /> Fonts
          </button>
        </nav>
      </div>
      <div className="sidebar-footer">
        <button className="sidebar-profile" onClick={signOut}>
          <span className="avatar">B</span>
          <span>
            <b>{APP_NAME}</b>
            <small>Sign out</small>
          </span>
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}

function DesignPanel({
  project,
  selectedField,
  selectedLogo,
  setNotice,
  patchProject,
  patchField,
  patchLogo,
  selectField,
  selectLogo
}: {
  project: Project;
  selectedField?: CertificateField;
  selectedLogo?: LogoElement;
  setNotice: (message: string) => void;
  patchProject: (patch: Partial<Project>) => void;
  patchField: (id: string, patch: Partial<CertificateField>) => void;
  patchLogo: (id: string, patch: Partial<LogoElement>) => void;
  selectField: (id: string) => void;
  selectLogo: (id?: string) => void;
}) {
  const availableFonts = fontChoicesForProject(project);

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const logo: LogoElement = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, "") || "Logo",
        mimeType: file.type || "image/*",
        dataUrl,
        storageKey: uid(),
        x: 43,
        y: 18,
        width: 14,
        height: 14,
        opacity: 1
      };
      await saveLogoData(logo.storageKey || logo.id, dataUrl);
      patchProject({ logoElements: [...(project.logoElements || []), logo] });
      selectLogo(logo.id);
      setNotice(`${logo.name} logo added. Drag it on the certificate to place it.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Logo upload failed.");
    }
  };

  const uploadFont = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const name = fontNameFromFile(file);
      const font: CustomFont = {
        id: uid(),
        name,
        family: fontFamilyFromName(name),
        mimeType: file.type || "font/unknown",
        dataUrl,
        storageKey: uid()
      };
      await saveFontData(font.storageKey || font.id, dataUrl);
      const face = new FontFace(font.family, `url(${dataUrl})`);
      await face.load();
      document.fonts.add(face);
      patchProject({ customFonts: [...(project.customFonts || []), font] });
      setNotice(`${name} font added to this project.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Font upload failed.");
    }
  };

  const uploadTemplate = async (file?: File) => {
    if (!file) return;
    try {
      let rendered: { dataUrl: string; width: number; height: number };
      if (file.type === "application/pdf") {
        const { renderPdfFirstPage } = await import("./pdf");
        rendered = await renderPdfFirstPage(file);
      } else {
        const dataUrl = await fileToDataUrl(file);
        const size = await getImageSize(dataUrl);
        rendered = { dataUrl, ...size };
      }
      const asset: TemplateAsset = {
        id: uid(),
        name: file.name,
        mimeType: file.type || "image/*",
        dataUrl: rendered.dataUrl,
        storageKey: uid(),
        width: rendered.width,
        height: rendered.height
      };
      await saveTemplateData(asset.storageKey || asset.id, rendered.dataUrl);
      setNotice("Template loaded and saved locally.");
      patchProject({ template: asset });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Template upload failed.");
    }
  };

  const applyBuiltInTemplate = async (template: BuiltInTemplate) => {
    try {
      const dataUrl = await urlToDataUrl(template.url);
      const size = await getImageSize(dataUrl);
      const asset: TemplateAsset = {
        id: uid(),
        name: template.name,
        mimeType: "image/png",
        dataUrl,
        storageKey: uid(),
        width: size.width,
        height: size.height
      };
      await saveTemplateData(asset.storageKey || asset.id, dataUrl);
      setNotice(`${template.name} template applied.`);
      patchProject({ template: asset });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Template could not be applied.");
    }
  };

  const addField = () => {
    const field: CertificateField = {
      id: uid(),
      label: "New Field",
      placeholder: `field_${project.fields.length + 1}`,
      x: 34,
      y: 34,
      width: 32,
      height: 7,
      fontFamily: "Inter",
      fontSize: 24,
      color: "#1a1612",
      align: "center",
      weight: "600"
    };
    patchProject({ fields: [...project.fields, field], mappings: { ...project.mappings, [field.placeholder]: "" } });
    selectField(field.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title">Design</h2>
        <p className="section-sub">Template, placeholders, and type settings.</p>
      </div>
      <label className="upload-box">
        <ImagePlus size={24} />
        <span className="font-medium">Upload PNG, JPG, SVG, or PDF</span>
        <span className="text-xs text-ink-400">PDF uploads use the first page.</span>
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,application/pdf"
          onChange={(event) => uploadTemplate(event.target.files?.[0])}
        />
      </label>
      <label className="upload-box">
        <Type size={22} />
        <span className="font-medium">Add custom font</span>
        <span className="text-xs text-ink-400">Supports TTF, OTF, WOFF, and WOFF2.</span>
        <input
          className="sr-only"
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/font-woff,application/x-font-ttf"
          onChange={(event) => uploadFont(event.target.files?.[0])}
        />
      </label>
      <label className="upload-box">
        <ImagePlus size={22} />
        <span className="font-medium">Add logo or seal</span>
        <span className="text-xs text-ink-400">Upload PNG, JPG, SVG, or WebP and place it freely.</span>
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={(event) => uploadLogo(event.target.files?.[0])}
        />
      </label>
      <div>
        <div className="mb-3">
          <h3 className="label">Built-in templates</h3>
          <p className="mt-1 text-xs text-ink-400">Use one when you do not have a certificate design yet.</p>
        </div>
        <div className="template-grid">
          {builtInTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`template-tile ${project.template?.name === template.name ? "active" : ""}`}
              onClick={() => applyBuiltInTemplate(template)}
            >
              <span className="template-thumb">
                <img src={template.url} alt="" loading="lazy" />
              </span>
              <span className="template-name">{template.name}</span>
              <span className="template-description">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="label">Placeholders</span>
          <button className="btn-outline py-2 text-xs" onClick={addField}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="space-y-2">
          {project.fields.map((field) => (
            <button
              key={field.id}
              className={`field-row ${selectedField?.id === field.id ? "active" : ""}`}
              onClick={() => selectField(field.id)}
            >
              <Type size={16} />
              <span>{field.label}</span>
              <code>{`{{${field.placeholder}}}`}</code>
            </button>
          ))}
        </div>
      </div>
      {(project.logoElements || []).length > 0 && (
        <div>
          <div className="mb-3">
            <span className="label">Logos</span>
          </div>
          <div className="space-y-2">
            {(project.logoElements || []).map((logo) => (
              <button
                key={logo.id}
                className={`field-row ${selectedLogo?.id === logo.id ? "active" : ""}`}
                onClick={() => selectLogo(logo.id)}
              >
                <ImagePlus size={16} />
                <span>{logo.name}</span>
                <code>{Math.round(logo.width)}%</code>
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedLogo && (
        <div className="space-y-4 border-t border-ink-100 pt-5">
          <TextInput label="Logo name" value={selectedLogo.name} onChange={(value) => patchLogo(selectedLogo.id, { name: value })} />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Width" value={Math.round(selectedLogo.width)} min={4} max={70} onChange={(value) => patchLogo(selectedLogo.id, { width: value })} />
            <NumberInput label="Height" value={Math.round(selectedLogo.height)} min={4} max={70} onChange={(value) => patchLogo(selectedLogo.id, { height: value })} />
          </div>
          <NumberInput
            label="Opacity"
            value={Math.round((selectedLogo.opacity ?? 1) * 100)}
            min={10}
            max={100}
            onChange={(value) => patchLogo(selectedLogo.id, { opacity: value / 100 })}
          />
          <button
            className="btn-danger w-full"
            onClick={() => {
              patchProject({ logoElements: (project.logoElements || []).filter((logo) => logo.id !== selectedLogo.id) });
              selectLogo(undefined);
            }}
          >
            <Trash2 size={16} /> Delete logo
          </button>
        </div>
      )}
      {selectedField && (
        <div className="space-y-4 border-t border-ink-100 pt-5">
          <TextInput label="Label" value={selectedField.label} onChange={(value) => patchField(selectedField.id, { label: value })} />
          <TextInput
            label="Placeholder"
            value={selectedField.placeholder}
            onChange={(value) => {
              const mappings = { ...project.mappings };
              mappings[value] = mappings[selectedField.placeholder] || "";
              delete mappings[selectedField.placeholder];
              patchProject({
                fields: project.fields.map((field) =>
                  field.id === selectedField.id ? { ...field, placeholder: value } : field
                ),
                mappings
              });
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Font size" value={selectedField.fontSize} min={10} max={100} onChange={(value) => patchField(selectedField.id, { fontSize: value })} />
            <ColorInput label="Color" value={selectedField.color} onChange={(value) => patchField(selectedField.id, { color: value })} />
          </div>
          <label>
            <span className="label">Font</span>
            <select className="input mt-2" value={selectedField.fontFamily} onChange={(event) => patchField(selectedField.id, { fontFamily: event.target.value })}>
              {availableFonts.map((font) => (
                <option key={font.family} value={font.family}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Align</span>
              <select className="input mt-2" value={selectedField.align} onChange={(event) => patchField(selectedField.id, { align: event.target.value as CertificateField["align"] })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              <span className="label">Weight</span>
              <select className="input mt-2" value={selectedField.weight} onChange={(event) => patchField(selectedField.id, { weight: event.target.value as CertificateField["weight"] })}>
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
              </select>
            </label>
          </div>
          <button
            className="btn-danger w-full"
            onClick={() => patchProject({ fields: project.fields.filter((field) => field.id !== selectedField.id) })}
          >
            <Trash2 size={16} /> Delete placeholder
          </button>
        </div>
      )}
    </div>
  );
}

function DataPanel({
  project,
  patchProject,
  setSelectedRowId,
  setNotice
}: {
  project: Project;
  patchProject: (patch: Partial<Project>) => void;
  setSelectedRowId: (id: string) => void;
  setNotice: (message: string) => void;
}) {
  const importCsv = (file?: File) => {
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const columns = result.meta.fields?.filter(Boolean) || [];
        const rows = result.data.map((values) => ({ id: uid(), values }));
        const mappings = { ...project.mappings };
        project.fields.forEach((field) => {
          const match = columns.find((column) => column.toLowerCase() === field.placeholder.toLowerCase());
          if (match) mappings[field.placeholder] = match;
        });
        patchProject({ columns, rows, mappings });
        if (rows[0]) setSelectedRowId(rows[0].id);
        setNotice(`Imported ${rows.length} rows from CSV.`);
      },
      error: (error) => setNotice(error.message)
    });
  };

  const addColumn = () => {
    const column = `column_${project.columns.length + 1}`;
    patchProject({
      columns: [...project.columns, column],
      rows: project.rows.map((row) => ({ ...row, values: { ...row.values, [column]: "" } }))
    });
  };

  const addRow = () => {
    const row = {
      id: uid(),
      values: Object.fromEntries(project.columns.map((column) => [column, ""]))
    };
    patchProject({ rows: [...project.rows, row] });
    setSelectedRowId(row.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title">Data</h2>
        <p className="section-sub">Import CSV or maintain a small manual list.</p>
      </div>
      <label className="upload-box">
        <Upload size={24} />
        <span className="font-medium">Upload recipient CSV</span>
        <span className="text-xs text-ink-400">First row should contain column names.</span>
        <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => importCsv(event.target.files?.[0])} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-outline" onClick={addColumn}>
          <Plus size={16} /> Column
        </button>
        <button className="btn-outline" onClick={addRow}>
          <Plus size={16} /> Row
        </button>
      </div>
      <div>
        <h3 className="label mb-3">Column mapping</h3>
        <div className="space-y-3">
          {project.fields.map((field) => (
            <label key={field.id} className="block">
              <span className="mb-1 block text-xs font-medium text-ink-500">{field.label}</span>
              <select
                className="input"
                value={project.mappings[field.placeholder] || ""}
                onChange={(event) => patchProject({ mappings: { ...project.mappings, [field.placeholder]: event.target.value } })}
              >
                <option value="">Not mapped</option>
                {project.columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportPanel({
  project,
  patchProject,
  exportCurrent,
  exportZip,
  exporting,
  missingCount
}: {
  project: Project;
  patchProject: (patch: Partial<Project>) => void;
  exportCurrent: () => void;
  exportZip: () => void;
  exporting: boolean;
  missingCount: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title">Export</h2>
        <p className="section-sub">Generate high-quality PDFs or PNGs locally.</p>
      </div>
      <label>
        <span className="label">Format</span>
        <select
          className="input mt-2"
          value={project.exportSettings.format}
          onChange={(event) =>
            patchProject({ exportSettings: { ...project.exportSettings, format: event.target.value as "png" | "pdf" } })
          }
        >
          <option value="pdf">PDF</option>
          <option value="png">PNG</option>
        </select>
      </label>
      <label>
        <span className="label">Resolution</span>
        <input
          className="mt-3 w-full accent-gold-500"
          type="range"
          min={1}
          max={2}
          step={0.5}
          value={project.exportSettings.quality}
          onChange={(event) =>
            patchProject({ exportSettings: { ...project.exportSettings, quality: Number(event.target.value) } })
          }
        />
        <span className="mt-1 block text-xs text-ink-400">{project.exportSettings.quality}x pixel ratio</span>
      </label>
      <label>
        <span className="label">Max output edge</span>
        <select
          className="input mt-2"
          value={project.exportSettings.maxDimension}
          onChange={(event) =>
            patchProject({
              exportSettings: {
                ...project.exportSettings,
                maxDimension: Number(event.target.value)
              }
            })
          }
        >
          <option value={1600}>Compact - 1600 px</option>
          <option value={2400}>Balanced - 2400 px</option>
          <option value={3200}>Print - 3200 px</option>
        </select>
        <span className="mt-1 block text-xs text-ink-400">
          Current output: {exportSizeForProject(project).width} x {exportSizeForProject(project).height}px
        </span>
      </label>
      {missingCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {missingCount} placeholder{missingCount === 1 ? "" : "s"} not mapped. They will render as fallback labels.
        </div>
      )}
      <button className="btn-primary w-full justify-center py-3" disabled={exporting} onClick={exportCurrent}>
        <Download size={18} /> {exporting ? "Rendering..." : "Export preview row"}
      </button>
      <button className="btn-gold w-full justify-center py-3" disabled={exporting || project.rows.length === 0} onClick={exportZip}>
        <Download size={18} /> Export ZIP ({project.rows.length})
      </button>
    </div>
  );
}

function RowsPanel({
  project,
  selectedRowId,
  setSelectedRowId,
  patchProject
}: {
  project: Project;
  selectedRowId?: string;
  setSelectedRowId: (id: string) => void;
  patchProject: (patch: Partial<Project>) => void;
}) {
  const updateCell = (rowId: string, column: string, value: string) => {
    patchProject({
      rows: project.rows.map((row) =>
        row.id === rowId ? { ...row, values: { ...row.values, [column]: value } } : row
      )
    });
  };

  return (
    <div>
      <h2 className="section-title">Recipients</h2>
      <p className="section-sub mb-5">Select any row to preview its certificate.</p>
      <div className="max-h-[680px] space-y-3 overflow-auto pr-1">
        {project.rows.map((row, index) => (
          <div
            key={row.id}
            className={`rounded-xl border p-3 ${selectedRowId === row.id ? "border-gold-500 bg-gold-500/10" : "border-ink-100 bg-white"}`}
          >
            <button className="mb-3 flex w-full items-center justify-between text-left" onClick={() => setSelectedRowId(row.id)}>
              <span className="font-medium text-ink-900">{row.values.name || row.values[project.mappings.name] || `Recipient ${index + 1}`}</span>
              <span className="text-xs text-ink-400">#{index + 1}</span>
            </button>
            <div className="space-y-2">
              {project.columns.map((column) => (
                <label key={column} className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-400">{column}</span>
                  <input className="input py-2 text-sm" value={row.values[column] || ""} onChange={(event) => updateCell(row.id, column, event.target.value)} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CertificatePreview({
  project,
  row,
  selectedFieldId,
  selectedLogoId,
  selectField,
  selectLogo,
  patchField,
  patchLogo,
  readonly
}: {
  project: Project;
  row?: RecipientRow;
  selectedFieldId?: string;
  selectedLogoId?: string;
  selectField?: (id: string) => void;
  selectLogo?: (id: string) => void;
  patchField?: (id: string, patch: Partial<CertificateField>) => void;
  patchLogo?: (id: string, patch: Partial<LogoElement>) => void;
  readonly?: boolean;
}) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const updateScale = () => setPreviewScale(Math.max(0.42, element.getBoundingClientRect().width / 760));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dragState || readonly) return;
    const move = (event: PointerEvent) => {
      const dx = ((event.clientX - dragState.startX) / dragState.canvasWidth) * 100;
      const dy = ((event.clientY - dragState.startY) / dragState.canvasHeight) * 100;
      const patch = dragState.kind === "field" ? patchField : patchLogo;
      if (!patch) return;
      if (dragState.mode === "move") {
        patch(dragState.id, {
          x: Math.min(96, Math.max(0, dragState.original.x + dx)),
          y: Math.min(96, Math.max(0, dragState.original.y + dy))
        });
      } else {
        patch(dragState.id, {
          width: Math.min(90, Math.max(8, dragState.original.width + dx)),
          height: Math.min(dragState.kind === "logo" ? 70 : 30, Math.max(3, dragState.original.height + dy))
        });
      }
    };
    const up = () => setDragState(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragState, patchField, patchLogo, readonly]);

  const valueForField = (field: CertificateField) => {
    const column = project.mappings[field.placeholder] || field.placeholder;
    return row?.values[column] || row?.values[field.placeholder] || `{{${field.placeholder}}}`;
  };

  const dragMetrics = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest(".certificate-canvas") : null;
    const rect = element?.getBoundingClientRect();
    return {
      canvasWidth: rect?.width || 760,
      canvasHeight: rect?.height || 537
    };
  };

  return (
    <div className="certificate-canvas" ref={canvasRef}>
      <img src={project.template?.dataUrl || DEFAULT_TEMPLATE} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {(project.logoElements || []).map((logo) => (
        <div
          key={logo.id}
          className={`certificate-logo ${selectedLogoId === logo.id ? "selected" : ""} ${readonly ? "readonly" : ""}`}
          style={{
            left: `${logo.x}%`,
            top: `${logo.y}%`,
            width: `${logo.width}%`,
            height: `${logo.height}%`,
            opacity: logo.opacity ?? 1
          }}
          onPointerDown={(event) => {
            if (readonly) return;
            event.preventDefault();
            selectLogo?.(logo.id);
            setDragState({
              mode: "move",
              kind: "logo",
              id: logo.id,
              startX: event.clientX,
              startY: event.clientY,
              ...dragMetrics(event.currentTarget),
              original: logo
            });
          }}
        >
          <img src={logo.dataUrl} alt="" />
          {!readonly && selectedLogoId === logo.id && (
            <button
              className="resize-handle"
              aria-label={`Resize ${logo.name}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragState({
                  mode: "resize",
                  kind: "logo",
                  id: logo.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  ...dragMetrics(event.currentTarget),
                  original: logo
                });
              }}
            />
          )}
        </div>
      ))}
      {project.fields.map((field) => (
        <div
          key={field.id}
          className={`certificate-field ${selectedFieldId === field.id ? "selected" : ""} ${readonly ? "readonly" : ""}`}
          style={{
            left: `${field.x}%`,
            top: `${field.y}%`,
            width: `${field.width}%`,
            height: `${field.height}%`,
            color: field.color,
            fontFamily: field.fontFamily,
            fontSize: readonly ? `${Math.max(8, field.fontSize * 0.24)}px` : `${field.fontSize * previewScale}px`,
            fontWeight: field.weight,
            textAlign: field.align,
            lineHeight: 1.1
          }}
          onPointerDown={(event) => {
            if (readonly) return;
            event.preventDefault();
            selectField?.(field.id);
            setDragState({
              mode: "move",
              kind: "field",
              id: field.id,
              startX: event.clientX,
              startY: event.clientY,
              ...dragMetrics(event.currentTarget),
              original: field
            });
          }}
        >
          <span>{valueForField(field)}</span>
          {!readonly && selectedFieldId === field.id && (
            <button
              className="resize-handle"
              aria-label={`Resize ${field.label}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragState({
                  mode: "resize",
                  kind: "field",
                  id: field.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  ...dragMetrics(event.currentTarget),
                  original: field
                });
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input mt-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input mt-2" type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input mt-2 h-11 p-1" type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function HeroVisual() {
  return (
    <div className="hero-visual">
      <div className="hero-certificate">
        <div className="mini-seal" />
        <div className="mini-title">Certificate</div>
        <div className="mini-line short" />
        <div className="mini-name">A. Smith</div>
        <div className="mini-line" />
        <div className="mini-footer">
          <span />
          <span />
        </div>
      </div>
      <div className="hero-table">
        {["J. Doe", "A. Smith", "S. Patel", "L. Chen"].map((name) => (
          <div key={name}>
            <span>{name}</span>
            <b />
          </div>
        ))}
      </div>
      <div className="hero-stack">
        <div />
        <div />
        <div />
      </div>
    </div>
  );
}

function WorkflowVisual() {
  return (
    <div className="workflow-visual">
      <div className="workflow-card">
        <HeroVisual />
        <h3>Template Design</h3>
      </div>
      <div className="workflow-card">
        <div className="workflow-grid">
          {Array.from({ length: 24 }).map((_, index) => (
            <span key={index} className={index % 5 === 0 ? "gold-cell" : ""} />
          ))}
        </div>
        <h3>Data Bulk Issuance</h3>
      </div>
    </div>
  );
}

function CreditCardIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="24" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 11h16M8 15h10M8 19h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="23" cy="21" r="4" fill="currentColor" />
      <path d="M21 21l1.5 1.5L25 19" stroke="#1a1612" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default App;
