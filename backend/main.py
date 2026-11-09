from __future__ import annotations

import json
import os
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Iterator, TypedDict

from ddgs import DDGS
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

DATA_DIR = Path(__file__).parent / "data"
DATABASE = DATA_DIR / "research.db"
load_dotenv(Path(__file__).parent / ".env")


class ResearchRequest(BaseModel):
    topic: Annotated[str, Field(min_length=3, max_length=300)]


class Source(BaseModel):
    id: int
    title: str
    url: str
    snippet: str
    domain: str


class ResearchSession(BaseModel):
    id: str
    topic: str
    created_at: str
    report: str
    tasks: list[str]
    sources: list[Source]
    fact_check: str


@contextmanager
def connect_db() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize_db() -> None:
    with connect_db() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS research_sessions (
                id TEXT PRIMARY KEY,
                topic TEXT NOT NULL,
                created_at TEXT NOT NULL,
                report TEXT NOT NULL,
                tasks TEXT NOT NULL,
                sources TEXT NOT NULL,
                fact_check TEXT NOT NULL
            )"""
        )


def get_llm() -> ChatOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Research is not configured. Set OPENAI_API_KEY in backend/.env.",
        )
    return ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        api_key=api_key,
        base_url=os.getenv("OPENAI_BASE_URL") or None,
        temperature=0.2,
    )


class Plan(BaseModel):
    tasks: list[str] = Field(min_length=2, max_length=4)


class ResearchSource(TypedDict):
    id: int
    title: str
    url: str
    snippet: str
    domain: str


class ResearchState(TypedDict, total=False):
    topic: str
    tasks: list[str]
    sources: list[ResearchSource]
    report: str
    fact_check: str


def build_research_graph(llm: ChatOpenAI):
    planner = llm.with_structured_output(Plan)

    def plan_research(state: ResearchState) -> dict:
        result = planner.invoke(
            ChatPromptTemplate.from_messages(
                [
                    ("system", "Create a balanced research plan. Return 2 to 4 distinct, searchable questions. Avoid duplicating the topic."),
                    ("human", "Research topic: {topic}"),
                ]
            ).invoke({"topic": state["topic"]})
        )
        return {"tasks": result.tasks}

    def gather_sources(state: ResearchState) -> dict:
        def search_task(task: str) -> list[dict[str, str]]:
            with DDGS() as search:
                results = search.text(task, max_results=4)
            sources = []
            for item in results:
                url = item.get("href", "")
                if not url.startswith(("https://", "http://")):
                    continue
                sources.append(
                    {
                        "title": item.get("title", "Untitled source"),
                        "url": url,
                        "snippet": item.get("body", ""),
                        "domain": url.split("/")[2].removeprefix("www."),
                    }
                )
            return sources

        with ThreadPoolExecutor(max_workers=min(4, len(state["tasks"]))) as workers:
            results_by_task = list(workers.map(search_task, state["tasks"]))

        collected: list[ResearchSource] = []
        seen_urls: set[str] = set()
        for task_sources in results_by_task:
            for source in task_sources:
                if source["url"] not in seen_urls:
                    seen_urls.add(source["url"])
                    collected.append({"id": len(collected) + 1, **source})
        if not collected:
            raise RuntimeError("Web search returned no usable sources.")
        return {"sources": collected}

    def retrieve_evidence(state: ResearchState) -> list[ResearchSource]:
        query_terms = set(
            (state["topic"] + " " + " ".join(state["tasks"])).lower().split()
        )
        query_terms = {term.strip(".,?!:;()[]{}\"'") for term in query_terms}
        ranked = []
        for source in state["sources"]:
            text = f"{source['title']} {source['snippet']}".lower()
            terms = [term.strip(".,?!:;()[]{}\"'") for term in text.split()]
            score = sum(1 for term in terms if term in query_terms)
            if score:
                ranked.append((score, source))
        ranked.sort(key=lambda result: result[0], reverse=True)
        return [source for _, source in ranked[:10]]

    def write_report(state: ResearchState) -> dict:
        evidence = "\n".join(
            f"[{source['id']}] {source['title']} ({source['url']}): {source['snippet']}"
            for source in retrieve_evidence(state)
        )
        if not evidence:
            evidence = "\n".join(
                f"[{source['id']}] {source['title']} ({source['url']}): {source['snippet']}"
                for source in state["sources"][:10]
            )
        message = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a careful research analyst. Write a concise, structured Markdown report with an executive summary, key findings, and open questions. Cite every factual claim with source numbers like [1]. Use only the supplied evidence; distinguish evidence from inference and explicitly note gaps.",
                ),
                ("human", "Topic: {topic}\nResearch questions: {tasks}\n\nEvidence:\n{evidence}"),
            ]
        ).invoke(
            {
                "topic": state["topic"],
                "tasks": "\n".join(f"- {task}" for task in state["tasks"]),
                "evidence": evidence,
            }
        )
        return {"report": llm.invoke(message).content}

    def verify_report(state: ResearchState) -> dict:
        evidence = "\n".join(
            f"[{source['id']}] {source['title']}: {source['snippet']}"
            for source in retrieve_evidence(state)
        )
        if not evidence:
            evidence = "\n".join(
                f"[{source['id']}] {source['title']}: {source['snippet']}"
                for source in state["sources"][:10]
            )
        message = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "Check the report against the supplied source snippets. Identify unsupported, conflicting, or time-sensitive claims and missing caveats. Do not claim independent verification beyond these snippets. If no clear issue is found, say so and state the limits of this check.",
                ),
                ("human", "Report:\n{report}\n\nSource snippets:\n{evidence}"),
            ]
        ).invoke({"report": state["report"], "evidence": evidence})
        return {"fact_check": llm.invoke(message).content}

    graph = StateGraph(ResearchState)
    graph.add_node("plan", plan_research)
    graph.add_node("gather", gather_sources)
    graph.add_node("report", write_report)
    graph.add_node("verify", verify_report)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "gather")
    graph.add_edge("gather", "report")
    graph.add_edge("report", "verify")
    graph.add_edge("verify", END)
    return graph.compile()


def session_from_row(row: sqlite3.Row) -> ResearchSession:
    return ResearchSession(
        id=row["id"],
        topic=row["topic"],
        created_at=row["created_at"],
        report=row["report"],
        tasks=json.loads(row["tasks"]),
        sources=[Source(**source) for source in json.loads(row["sources"])],
        fact_check=row["fact_check"],
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_db()
    yield


app = FastAPI(title="Atlas Research", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/sessions", response_model=list[ResearchSession])
def list_sessions() -> list[ResearchSession]:
    with connect_db() as db:
        rows = db.execute(
            "SELECT * FROM research_sessions ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    return [session_from_row(row) for row in rows]


@app.get("/api/sessions/{session_id}", response_model=ResearchSession)
def get_session(session_id: str) -> ResearchSession:
    with connect_db() as db:
        row = db.execute(
            "SELECT * FROM research_sessions WHERE id = ?", (session_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Research session not found.")
    return session_from_row(row)


@app.post("/api/research", response_model=ResearchSession)
def research(request: ResearchRequest) -> ResearchSession:
    topic = request.topic.strip()
    if len(topic) < 3:
        raise HTTPException(status_code=422, detail="Enter a topic with at least 3 characters.")
    try:
        result = build_research_graph(get_llm()).invoke({"topic": topic})
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Research could not be completed: {error}",
        ) from error

    session = ResearchSession(
        id=str(uuid.uuid4()),
        topic=topic,
        created_at=datetime.now(timezone.utc).isoformat(),
        report=result["report"],
        tasks=result["tasks"],
        sources=[
            Source(**source) for source in result["sources"]
        ],
        fact_check=result["fact_check"],
    )
    with connect_db() as db:
        db.execute(
            """INSERT INTO research_sessions
                (id, topic, created_at, report, tasks, sources, fact_check)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                session.id,
                session.topic,
                session.created_at,
                session.report,
                json.dumps(session.tasks),
                json.dumps([source.model_dump() for source in session.sources]),
                session.fact_check,
            ),
        )
    return session
