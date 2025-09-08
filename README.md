# KrishiGPT API Webapp

- Auto-detects location (browser geolocation with IP fallback)
- Fetches current weather from OpenWeather (set `OPENWEATHER_API_KEY` in `.env`)
- Passes weather + farmer input to agents for context-aware advice
- Uses OpenAI Python SDK v1.x

## Run
```
python -m venv .venv
# Windows PowerShell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate
pip install -r requirements.txt
copy .env.example .env   # then put your keys (OPENAI_API_KEY, OPENWEATHER_API_KEY)
python app.py
```
Open http://localhost:8000
