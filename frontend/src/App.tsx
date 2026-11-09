import { FormEvent, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Compass,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe2,
  Layers3,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Source = {
  id: number;
  title: string;
  url: string;
  snippet: string;
  domain: string;
};

type ResearchSession = {
  id: string;
  topic: string;
  created_at: string;
  report: string;
  tasks: string[];
  sources: Source[];
  fact_check: string;
};

const starters = [
  { icon: Globe2, text: "How is AI changing climate science?" },
  { icon: FlaskConical, text: "The latest advances in battery technology" },
  { icon: Layers3, text: "What makes cities more resilient to heat?" },
];

function App() {
  const [topic, setTopic] = useState("");
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [active, setActive] = useState<ResearchSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSources, setShowSources] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  async function loadSessions() {
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok) throw new Error("Could not load previous research.");
      setSessions(await response.json());
    } catch (reason) {
      setSessions([]);
      setError(reason instanceof Error ? reason.message : "Could not load previous research.");
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function runResearch(event: FormEvent) {
    event.preventDefault();
    if (topic.trim().length < 3 || loading) return;
    setLoading(true);
    setError("");
    setActive(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Research could not be completed.");
      setActive(result);
      setTopic("");
      await loadSessions();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function openSession(id: string) {
    setError("");
    try {
      const response = await fetch(`/api/sessions/${id}`);
      if (!response.ok) throw new Error("Could not open this research session.");
      setActive(await response.json());
      setMenuOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open this session.");
    }
  }

  function startNew() {
    setActive(null);
    setError("");
    setTopic("");
    setMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Compass size={18} strokeWidth={2.2} /></div>
          <span>atlas<span className="brand-dot">.</span></span>
          <button className="icon-button mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button>
        </div>
        <button className="new-research" onClick={startNew}>
          <Plus size={16} /> New research <span className="shortcut">⌘ K</span>
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item active"><Search size={16} /> Research</button>
        <button className="nav-item" disabled><BookOpen size={16} /> Knowledge base <span className="coming">Soon</span></button>
        <div className="history-heading">
          <span className="sidebar-label">RECENT</span>
          <button className="icon-button" onClick={loadSessions} aria-label="Refresh history"><Clock3 size={14} /></button>
        </div>
        <div className="history-list">
          {sessions.length === 0 && <p className="empty-history">Your research will appear here.</p>}
          {sessions.map((session) => (
            <button
              key={session.id}
              className={`history-item ${active?.id === session.id ? "history-selected" : ""}`}
              onClick={() => void openSession(session.id)}
              title={session.topic}
            >
              <FileText size={14} /><span>{session.topic}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-title"><Sparkles size={14} /> Your research studio</div>
            <p>Every question is a starting point. Follow the evidence wherever it leads.</p>
            <div className="usage-meter"><span /></div>
            <small>Built for thoughtful discovery</small>
          </div>
          <button className="profile">
            <div className="avatar">A</div><span className="profile-name">Researcher<small>Personal workspace</small></span><ChevronDown size={14} />
          </button>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu-trigger" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Research</strong></div>
          <div className="top-actions">
            <div className="status-pill"><span /> All systems operational</div>
            <button className="help-button"><CircleHelp size={16} /> <span>Help</span></button>
          </div>
        </header>

        <div className={`content ${active ? "content-report" : ""}`}>
          {error && <div className="error-message global-error" role="alert">{error}</div>}
          {active ? (
            <ResearchReport session={active} showSources={showSources} onToggleSources={() => setShowSources(!showSources)} />
          ) : (
            <section className="hero">
              <div className="eyebrow"><span className="eyebrow-icon"><Sparkles size={13} /></span> YOUR AI RESEARCH PARTNER</div>
              <h1>Curiosity, meet<br /><span>clarity.</span></h1>
              <p className="hero-copy">A little curiosity can go a long way. Ask a question and Atlas will explore the evidence, connect the dots, and bring back a report you can trust.</p>

              <form className="research-form" onSubmit={runResearch}>
                <textarea
                  aria-label="Research topic"
                  placeholder="What are you curious about?"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void runResearch(event);
                    }
                  }}
                  maxLength={300}
                />
                <div className="form-footer">
                  <div className="form-hint"><Globe2 size={14} /> Web research <span className="hint-divider">·</span> Source-checked</div>
                  <button className="submit-button" type="submit" disabled={loading || topic.trim().length < 3}>
                    {loading ? <LoaderCircle className="spin" size={16} /> : <>Explore <ArrowUp size={15} /></>}
                  </button>
                </div>
              </form>

              {loading ? <ResearchProgress /> : (
                <div className="starter-section">
                  <div className="starter-label">A few places to begin</div>
                  <div className="starter-list">
                    {starters.map(({ icon: Icon, text }) => (
                      <button key={text} className="starter-card" onClick={() => setTopic(text)}>
                        <Icon size={16} /><span>{text}</span><ArrowRight size={14} className="starter-arrow" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="trust-note"><ShieldCheck size={14} /> Research grounded in real sources, not just AI answers.</div>
            </section>
          )}
        </div>
        <footer className="page-footer"><span>© 2025 Atlas Research</span><span>Made for the endlessly curious <span className="footer-spark">✳</span></span></footer>
      </main>
    </div>
  );
}

function ResearchProgress() {
  const steps = ["Breaking your topic into research questions", "Gathering evidence from the web", "Writing and checking your report"];
  return (
    <div className="progress-card">
      <div className="progress-heading"><LoaderCircle size={16} className="spin" /> Atlas is exploring your question</div>
      {steps.map((step, index) => <div key={step} className={`progress-step ${index === 0 ? "step-current" : ""}`}><span className="step-dot" />{step}</div>)}
      <p>This can take a minute. A thoughtful answer is worth the wait.</p>
    </div>
  );
}

function ResearchReport({ session, showSources, onToggleSources }: {
  session: ResearchSession;
  showSources: boolean;
  onToggleSources: () => void;
}) {
  const date = new Date(session.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  return (
    <article className="report">
      <div className="report-kicker"><span className="report-kicker-dot" /> RESEARCH BRIEF <span className="kicker-divider">/</span> {date}</div>
      <h1 className="report-title">{session.topic}</h1>
      <div className="report-meta"><span><Search size={14} /> {session.tasks.length} research questions</span><span><BookOpen size={14} /> {session.sources.length} sources</span><span><ShieldCheck size={14} /> Fact-checked</span></div>
      <div className="report-grid">
        <div className="report-body">
          <div className="markdown-report"><ReactMarkdown>{session.report}</ReactMarkdown></div>
          <section className="fact-check">
            <div className="fact-check-title"><ShieldCheck size={17} /> Evidence check</div>
            <p>{session.fact_check}</p>
            <small>AI-assisted review of the report against retrieved source snippets. Always verify important claims with the original source.</small>
          </section>
          <div className="research-questions">
            <h3>Questions explored</h3>
            {session.tasks.map((task, index) => <div key={task} className="question-item"><span>{String(index + 1).padStart(2, "0")}</span>{task}<Check size={14} /></div>)}
          </div>
        </div>
        {showSources && <aside className="sources-panel">
          <div className="sources-heading"><span>Sources</span><span className="source-count">{session.sources.length}</span></div>
          <p className="sources-caption">The evidence behind this brief</p>
          <div className="source-list">
            {session.sources.map((source) => (
              <a className="source-card" key={source.id} href={source.url} target="_blank" rel="noreferrer">
                <div className="source-meta"><span className="source-number">[{source.id}]</span><span>{source.domain}</span><ExternalLink size={12} /></div>
                <h4>{source.title}</h4>
                <p>{source.snippet}</p>
              </a>
            ))}
          </div>
          <button className="toggle-sources" onClick={onToggleSources}><ArrowDown size={13} /> Hide sources</button>
        </aside>}
        {!showSources && <button className="show-sources" onClick={onToggleSources}><BookOpen size={14} /> Show sources <ArrowDown size={13} /></button>}
      </div>
      <div className="report-end"><span /> END OF RESEARCH BRIEF <span /></div>
    </article>
  );
}

export default App;
