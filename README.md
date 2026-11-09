# Atlas Research

Atlas is an AI-powered research workspace. Give it a topic and it creates research questions, searches the web, writes a cited report, and checks the report against the retrieved evidence. Research sessions are saved locally.

## Requirements

- Python 3.11+
- Node.js 20+
- An OpenAI-compatible API key

## Run locally

1. Configure the backend:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

2. Add your API key to `backend/.env`, then start the API:

   ```powershell
   uvicorn main:app --reload
   ```

3. In a second terminal, start the UI:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

4. Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

The backend uses LangGraph for its research workflow, DuckDuckGo for web search, and SQLite at `backend/data/research.db` for saved sessions. Set `OPENAI_MODEL` and optionally `OPENAI_BASE_URL` in the backend environment to use a different OpenAI-compatible model provider. The evidence check is AI-assisted and is not a guarantee of truth; review primary sources for consequential decisions.
