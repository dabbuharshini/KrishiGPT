import os
import json
import traceback
import requests
from time import time
from typing import List, Dict, Any, Optional
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
AGRO_API_KEY = os.getenv("AGROMONITORING_API_KEY")

OWM_ENDPOINT = "https://api.openweathermap.org/data/2.5/onecall"
AGRO_SOIL_ENDPOINT = "https://api.agromonitoring.com/agro/1.0/soil"

# Simple in-memory caches to avoid repeated slow external calls
_WEATHER_CACHE: Dict[str, Dict] = {}
_WEATHER_CACHE_TTL = 300  # seconds
_SOIL_CACHE: Dict[str, Dict] = {}
_SOIL_CACHE_TTL = 3600  # seconds

def _make_cache_key(lat: float, lon: float) -> str:
    return f"{round(float(lat), 3)},{round(float(lon), 3)}"

def _cache_get(cache: Dict[str, Dict], key: str, ttl: int) -> Optional[Dict]:
    try:
        entry = cache.get(key)
        if not entry:
            return None
        if (time() - entry.get("ts", 0)) > ttl:
            return None
        return entry.get("data")
    except Exception:
        return None

def _cache_set(cache: Dict[str, Dict], key: str, data: Dict) -> None:
    try:
        cache[key] = {"ts": time(), "data": data}
    except Exception:
        pass

def safe_json_load(s: str) -> Any:
    try:
        return json.loads(s)
    except Exception:
        return {"raw": s}

def get_weather(lat: float, lon: float, lang: Optional[str] = None) -> Dict:
    if not OPENWEATHER_API_KEY:
        return {"warning": "No OpenWeather API key configured"}
    key = _make_cache_key(lat, lon) + f":{lang or ''}"
    cached = _cache_get(_WEATHER_CACHE, key, _WEATHER_CACHE_TTL)
    if cached:
        return cached
    params = {"lat": lat, "lon": lon, "appid": OPENWEATHER_API_KEY, "units": "metric", "exclude": "minutely,hourly"}
    if lang:
        params["lang"] = str(lang)
    try:
        r = requests.get(OWM_ENDPOINT, params=params, timeout=8)
        data = r.json() if r.ok else {"error": f"OpenWeather failed {r.status_code}", "text": r.text}
        _cache_set(_WEATHER_CACHE, key, data)
        return data
    except Exception as e:
        return {"error": "Exception calling OpenWeather", "exception": str(e)}

def get_soil(lat: float, lon: float) -> Dict:
    if not AGRO_API_KEY:
        return {"warning": "No AgroMonitoring API key configured - soil data unavailable"}
    key = _make_cache_key(lat, lon)
    cached = _cache_get(_SOIL_CACHE, key, _SOIL_CACHE_TTL)
    if cached:
        return cached
    params = {"lat": lat, "lon": lon, "appid": AGRO_API_KEY}
    try:
        r = requests.get(AGRO_SOIL_ENDPOINT, params=params, timeout=8)
        data = r.json() if r.ok else {"error": f"Agro soil failed {r.status_code}", "text": r.text}
        _cache_set(_SOIL_CACHE, key, data)
        return data
    except Exception as e:
        return {"error": "Exception calling Agro API", "exception": str(e)}

def fertilizer_rule(crop: str, soil: Dict) -> str:
    c = (crop or "").strip().lower()
    ph = None
    if isinstance(soil, dict):
        ph = soil.get("ph") or soil.get("pH")

    # Normalize common synonyms
    aliases = {
        "paddy": "rice",
        "corn": "maize",
        "gram": "chickpea",
        "arhar": "pigeonpea",
        "tur": "pigeonpea",
        "rapeseed": "mustard",
        "bajra": "millet",
        "jowar": "sorghum",
        "ground nut": "groundnut",
    }
    if c in aliases:
        c = aliases[c]

    # Baseline recommendations (kg/ha) described briefly
    base: Dict[str, str] = {
        "wheat": "~120 N, 60 P (kg/ha); split N at sowing+tillering.",
        "rice": "~100 N, 50 P (kg/ha); split across transplanting+tillering+panicle.",
        "maize": "~150 N, 75 P (kg/ha); split N at sowing+V6+V12.",
        "sugarcane": "~225 N, 60 P (kg/ha); split N in 3-4 doses.",
        "cotton": "~100 N, 50 P (kg/ha); avoid excess N late season.",
        "soybean": "~20 N, 60 P (kg/ha); inoculate Rhizobium if needed.",
        "mustard": "~80 N, 40 P (kg/ha); split N at sowing+30 DAS.",
        "chickpea": "~20 N, 50 P (kg/ha); basal application at sowing.",
        "pigeonpea": "~20 N, 60 P (kg/ha); basal at sowing.",
        "lentil": "~20 N, 40 P (kg/ha); basal at sowing.",
        "groundnut": "~20 N, 40 P, 40 K (kg/ha); gypsum at pegging.",
        "potato": "~150 N, 80 P, 100 K (kg/ha); split N&K.",
        "tomato": "~120 N, 60 P, 60 K (kg/ha); split fertigation if possible.",
        "onion": "~100 N, 50 P, 50 K (kg/ha); split N.",
        "banana": "~200 N, 60 P, 200 K (kg/ha); split monthly.",
        "sorghum": "~100 N, 50 P (kg/ha); split N at sowing+30 DAS.",
        "millet": "~60 N, 30 P (kg/ha); split N.",
    }

    suggestion = base.get(c)

    # Heuristic fallback by crop group if not found
    if not suggestion:
        legumes = {"soybean", "groundnut", "pea", "chickpea", "pigeonpea", "lentil", "cowpea", "mung", "urd"}
        tubers = {"potato", "cassava", "yam"}
        fruits = {"banana", "mango", "papaya"}
        cereals = {"wheat", "rice", "maize", "sorghum", "millet", "barley", "oat"}

        if any(k in c for k in legumes):
            suggestion = "Legume: ~20-25 N, 40-60 P (kg/ha); inoculate Rhizobium; minimal N after nodulation."
        elif any(k in c for k in tubers):
            suggestion = "Tuber: ~120-160 N, 60-90 P, 80-120 K (kg/ha); split N and K."
        elif any(k in c for k in fruits):
            suggestion = "Fruit crop: balanced N-P-K split doses; follow local horticulture schedule."
        elif any(k in c for k in cereals):
            suggestion = "Cereal: ~100-150 N, 50-70 P (kg/ha); split N (basal+tillering/active growth)."
        else:
            suggestion = "Use balanced N-P-K based on local soil test; start with ~80-120 N and 40-60 P (kg/ha)."

    # Soil pH based adjustments
    if ph:
        try:
            pval = float(ph)
            if pval < 5.5:
                suggestion += " Soil acidic (pH<5.5): consider liming; avoid heavy P before liming."
            elif pval > 7.8:
                suggestion += " Soil alkaline (pH>7.8): monitor P availability; add micronutrients (Zn/Fe) if deficient."
        except Exception:
            pass
    return suggestion

def call_llm_return_json(prompt: str, max_tokens: int = 512, temperature: float = 0.2) -> Dict:
    if not os.getenv("OPENAI_API_KEY"):
        return {"error": "OpenAI API key not configured. Set OPENAI_API_KEY in .env."}

    instruction = (
        "You are KrishiGPT, an assistant for farmers. Respond ONLY with valid JSON. "
        "Do NOT include any text outside the JSON."
    )
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = resp.choices[0].message.content.strip()
        parsed = safe_json_load(content)
        if isinstance(parsed, dict) and "raw" in parsed and len(parsed) == 1:
            return {"error": "LLM did not return valid JSON", "raw": parsed["raw"]}
        return parsed
    except Exception as e:
        return {"error": "LLM call failed", "exception": str(e), "trace": traceback.format_exc()}

def translate_text(text: str, target_language: str) -> str:
    if not text:
        return text
    code = (target_language or "").strip().lower()
    if not os.getenv("OPENAI_API_KEY") or code in ("en", "en-us", "en-in", "english", ""):
        return text
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are a translator. Translate the user's text into the target language. Return ONLY the translated text without quotes."},
                {"role": "user", "content": f"Target language code: {code}\nText: {text}"},
            ],
            temperature=0.1,
            max_tokens=200,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return text

def planner_agent(question: str, crop: str, weather: Dict, soil: Dict, fert: str, language: str = "en") -> List[str]:
    weather_summary = ""
    if isinstance(weather, dict) and "current" in weather:
        cur = weather["current"]
        weather_summary = f"Temp: {cur.get('temp')} C, Humidity: {cur.get('humidity')}%, Conditions: {cur.get('weather',[{}])[0].get('description')}"
    else:
        weather_summary = str(weather)
    soil_summary = ""
    if isinstance(soil, dict):
        soil_summary = ", ".join(f"{k}:{v}" for k, v in soil.items() if k in ("ph", "moisture", "t0")) or str(soil)

    # Extract simple forecast signals if available
    forecast_hint = None
    try:
        if isinstance(weather, dict) and "daily" in weather and weather["daily"]:
            d0 = weather["daily"][0]
            min_t = d0.get("temp",{}).get("min")
            max_t = d0.get("temp",{}).get("max")
            pop = d0.get("pop")  # probability of precipitation
            forecast_hint = f"Today min {min_t}C max {max_t}C, rain prob {pop}"
    except Exception:
        forecast_hint = None

    prompt = json.dumps({
        "task": "produce_plan",
        "question": question,
        "crop": crop,
        "weather_summary": weather_summary,
        "soil_summary": soil_summary,
        "fertilizer_guidance": fert,
        "forecast_hint": forecast_hint,
        "target_language": language,
        "requirements": "Return JSON with English keys but values in the target language. Keep items concise and step-by-step. Include irrigation timing if asked, seed variety guidance for weather if asked, and any weather risk flags. Schema: {\"plan\":[\"step1\",...]}"
    })

    res = call_llm_return_json(prompt, max_tokens=250)
    if isinstance(res, dict) and isinstance(res.get("plan"), list):
        return [str(s) for s in res["plan"]]
    return [
        "Inspect field for nutrient deficiency symptoms.",
        f"Apply recommended fertilizer: {fert}.",
        "Use split application where applicable.",
        "Avoid application before heavy rain; check forecast.",
    ]

def executor_agent(question: str, steps: List[str], weather: Dict, soil: Dict, fert: str, language: str = "en") -> Dict:
    weather_summary = ""
    if isinstance(weather, dict) and "current" in weather:
        cur = weather["current"]
        weather_summary = f"Temp: {cur.get('temp')} C, Humidity: {cur.get('humidity')}%, Conditions: {cur.get('weather',[{}])[0].get('description')}"
    else:
        weather_summary = str(weather)
    soil_summary = ""
    if isinstance(soil, dict):
        soil_summary = ", ".join(f"{k}:{v}" for k, v in soil.items() if k in ("ph", "moisture", "t0")) or str(soil)

    market_hint = ""
    if any(k in (question or "").lower() for k in ["market", "price", "credit", "finance", "loan"]):
        market_hint = "Add a short note on typical market/credit options and relevant Indian schemes (PM-KISAN, KCC) if applicable."

    prompt = json.dumps({
        "task": "produce_answer",
        "question": question,
        "plan": steps,
        "weather_summary": weather_summary,
        "soil_summary": soil_summary,
        "fertilizer_guidance": fert,
        "hints": market_hint,
        "target_language": language,
        "requirements": "Return JSON with English keys but values in the target language. Be brief and actionable. Address irrigation timing, seed variety for weather, yield/weather risk, and basic finance/market guidance if asked. Schema: {\"summary\":\"...\",\"checklist\":[...],\"warnings\":[...]}"
    })

    res = call_llm_return_json(prompt, max_tokens=600)
    if isinstance(res, dict):
        return {
            "summary": str(res.get("summary", "")).strip(),
            "checklist": res.get("checklist") if isinstance(res.get("checklist"), list) else [],
            "warnings": res.get("warnings") if isinstance(res.get("warnings"), list) else [],
        }
    return {
        "summary": f"Apply {fert}. Monitor crop and weather conditions.",
        "checklist": steps or [f"Apply fertilizer: {fert}"],
        "warnings": ["Avoid applying before heavy rain.", "Follow safety instructions on fertilizer label."],
    }

def plan_and_execute_agent(question: str, crop: str, weather: Dict, soil: Dict, fert: str, language: str = "en") -> Dict:
    weather_summary = ""
    if isinstance(weather, dict) and "current" in weather:
        cur = weather["current"]
        weather_summary = f"Temp: {cur.get('temp')} C, Humidity: {cur.get('humidity')}%, Conditions: {cur.get('weather',[{}])[0].get('description')}"
    else:
        weather_summary = str(weather)
    soil_summary = ""
    if isinstance(soil, dict):
        soil_summary = ", ".join(f"{k}:{v}" for k, v in soil.items() if k in ("ph", "moisture", "t0")) or str(soil)

    forecast_hint = None
    try:
        if isinstance(weather, dict) and "daily" in weather and weather["daily"]:
            d0 = weather["daily"][0]
            min_t = d0.get("temp",{}).get("min")
            max_t = d0.get("temp",{}).get("max")
            pop = d0.get("pop")
            forecast_hint = f"Today min {min_t}C max {max_t}C, rain prob {pop}"
    except Exception:
        forecast_hint = None

    prompt = json.dumps({
        "task": "produce_plan_and_answer",
        "question": question,
        "crop": crop,
        "weather_summary": weather_summary,
        "soil_summary": soil_summary,
        "fertilizer_guidance": fert,
        "forecast_hint": forecast_hint,
        "target_language": language,
        "requirements": (
            "Return JSON with English keys but values in the target language. "
            "Keep plan concise and step-by-step. Also return summary, checklist, and warnings. "
            "Schema: {\"plan\":[...],\"summary\":\"...\",\"checklist\":[...],\"warnings\":[...]}"
        )
    })

    res = call_llm_return_json(prompt, max_tokens=700)
    if isinstance(res, dict):
        # If the model returned an error or produced no useful content, fall back
        has_content = bool((res.get("plan") or res.get("summary") or res.get("checklist") or res.get("warnings")))
        if not res.get("error") and has_content:
            return {
                "plan": [str(s) for s in (res.get("plan") or [])],
                "summary": str(res.get("summary", "")).strip(),
                "checklist": res.get("checklist") if isinstance(res.get("checklist"), list) else [],
                "warnings": res.get("warnings") if isinstance(res.get("warnings"), list) else [],
            }
    # Fallback minimal output
    steps = [
        "Inspect field for nutrient deficiency symptoms.",
        f"Apply recommended fertilizer: {fert}.",
        "Use split application where applicable.",
        "Avoid application before heavy rain; check forecast.",
    ]
    return {
        "plan": steps,
        "summary": f"Apply {fert}. Monitor crop and weather conditions.",
        "checklist": steps,
        "warnings": ["Avoid applying before heavy rain.", "Follow safety instructions on fertilizer label."],
    }
