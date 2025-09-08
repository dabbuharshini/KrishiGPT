import os
import traceback
from flask import Flask, request, jsonify, send_from_directory, send_file
from dotenv import load_dotenv
from agents import (
    planner_agent,
    executor_agent,
    plan_and_execute_agent,
    get_weather,
    get_soil,
    fertilizer_rule,
    translate_text,
)
from flask_compress import Compress
from gtts import gTTS
from io import BytesIO

load_dotenv()
app = Flask(__name__, static_folder="static", static_url_path="/static")
Compress(app)

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/weather")
def weather_endpoint():
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    lang = request.args.get("lang")
    try:
        lat = float(lat); lon = float(lon)
    except Exception:
        return jsonify({"error":"invalid lat/lon"}), 400
    weather = get_weather(lat, lon, lang=lang) or {}
    return jsonify(weather)

@app.route("/ask", methods=["POST"])
def ask():
    try:
        data = request.get_json(force=True) or {}
        question = data.get("question")
        crop = data.get("crop") or ""
        lat = data.get("latitude") or data.get("lat")
        lon = data.get("longitude") or data.get("lon")
        language = (data.get("language") or data.get("lang") or "en").strip().lower()

        if not all([question, lat, lon]):
            return jsonify({"error": "Provide question, latitude and longitude"}), 400

        try:
            lat = float(lat)
            lon = float(lon)
        except ValueError:
            return jsonify({"error": "Invalid latitude/longitude"}), 400

        # Fetch weather and soil in parallel to reduce latency
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as pool:
            fut_weather = pool.submit(get_weather, lat, lon, language)
            fut_soil = pool.submit(get_soil, lat, lon)
            weather = fut_weather.result() or {}
            soil = fut_soil.result() or {}
        fert = fertilizer_rule(crop, soil) or ""
        if language and language != "en":
            tfert = translate_text(fert, language)
            if isinstance(tfert, str) and tfert:
                fert = tfert

        # Single-shot plan+answer to reduce model latency
        combined = plan_and_execute_agent(question, crop, weather, soil, fert, language=language) or {}
        steps = list(combined.get("plan") or [])
        exec_out = {
            "summary": combined.get("summary", ""),
            "checklist": list(combined.get("checklist") or []),
            "warnings": list(combined.get("warnings") or []),
        }

        response = {
            "question": question,
            "crop": crop,
            "coordinates": {"lat": lat, "lon": lon},
            "weather": weather,
            "soil": soil,
            "fertilizer": fert,
            "plan": list(steps),
            "answer": {
                "summary": str(exec_out.get("summary", "")),
                "checklist": list(exec_out.get("checklist", [])),
                "warnings": list(exec_out.get("warnings", [])),
            },
            "language": language,
        }
        return jsonify(response)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Server error", "detail": str(e)}), 500

@app.route("/tts", methods=["POST"])
def tts():
    try:
        data = request.get_json(force=True) or {}
        text = (data.get("text") or "").strip()
        lang = (data.get("lang") or "en").strip().lower()
        if not text:
            return jsonify({"error": "No text"}), 400
        # Use gTTS for non-English or when explicit fallback is requested
        mp3 = BytesIO()
        tts = gTTS(text=text, lang=lang if lang else "en")
        tts.write_to_fp(mp3)
        mp3.seek(0)
        return send_file(mp3, mimetype="audio/mpeg")
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "TTS failed", "detail": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=True)
