const cropEl = document.getElementById("crop");
const locEl = document.getElementById("loc");
const questionEl = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const planEl = document.getElementById("plan");
const planListEl = document.getElementById("planList");
const fertEl = document.getElementById("fert");
const answerEl = document.getElementById("answer");
const weatherBox = document.getElementById("weatherBox");
const geoStatus = document.getElementById("geoStatus");
const loadingEl = document.getElementById("loading");
const validationEl = document.getElementById("validation");
const langEl = document.getElementById("lang");
const geoBtn = document.getElementById("geoBtn");
const micBtn = document.getElementById("micBtn");
const quickChips = document.getElementById("quickChips");
const pageProgress = document.getElementById("pageProgress");
const clearBtn = document.getElementById("clearBtn");
const sampleBtn = document.getElementById("sampleBtn");
const toastEl = document.getElementById("toast");
const weatherUpdated = document.getElementById("weatherUpdated");
const readBtn = document.getElementById("readBtn");
const volumeBtn = document.getElementById("volumeBtn");
const speedBtn = document.getElementById("speedBtn");
const langHint = document.getElementById("langHint");

let coords = { lat: null, lon: null };

function displayWeather(w) {
  if (!weatherBox) return;
  if (!w || typeof w !== "object") {
    weatherBox.textContent = "No weather data.";
    return;
  }
  if (w.error || w.warning) {
    weatherBox.textContent = w.error || w.warning;
    return;
  }
  const cur = w.current || {};
  const desc = (cur.weather && cur.weather[0] && cur.weather[0].description) || "";
  const lines = [
    `Temp: ${cur.temp} °C`,
    `Humidity: ${cur.humidity}%`,
    `Conditions: ${desc}`
  ];
  weatherBox.textContent = lines.join(" | ");
  try {
    if (cur.dt) {
      const dt = new Date(cur.dt * 1000);
      if (typeof weatherUpdated !== 'undefined' && weatherUpdated) {
        weatherUpdated.textContent = `Updated: ${dt.toLocaleTimeString()}`;
      }
    }
  } catch {}
}

// Basic in-memory cache for weather to avoid repeat fetches
const weatherCache = new Map();

function getLang() { return (langEl && langEl.value) ? langEl.value : "en"; }

async function fetchWeather(lat, lon, signal) {
  try {
    if (!weatherBox) return; // weather UI removed
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}:${getLang()}`;
    if (weatherCache.has(cacheKey)) {
      displayWeather(weatherCache.get(cacheKey));
      return;
    }
    setProgress(40);
    const res = await fetch(`/weather?lat=${lat}&lon=${lon}&lang=${encodeURIComponent(getLang())}`, { signal });
    const data = await res.json();
    weatherCache.set(cacheKey, data);
    displayWeather(data);
  } catch (e) {
    weatherBox.textContent = "Failed to load weather.";
  } finally {
    setProgress(100);
    setTimeout(() => setProgress(0), 300);
  }
}

// Attempt browser geolocation first
function detectLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coords.lat = pos.coords.latitude;
        coords.lon = pos.coords.longitude;
        locEl.value = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
        geoStatus.textContent = "Location detected ✅";
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 8000);
        fetchWeather(coords.lat, coords.lon, controller.signal);
      },
      async (err) => {
        // Fallback to IP-based detection (auto weather)
        try {
          const resp = await fetch("https://ipapi.co/json/");
          const j = await resp.json();
          if (j && j.latitude && j.longitude) {
            coords.lat = j.latitude;
            coords.lon = j.longitude;
            locEl.value = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
            geoStatus.textContent = "Approximate location detected via IP ✅";
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 8000);
            fetchWeather(coords.lat, coords.lon, controller.signal);
          } else {
            geoStatus.textContent = "Enter lat,lon manually.";
          }
        } catch (e) {
          geoStatus.textContent = "Enter lat,lon manually.";
          // If IP detection fails, try a free fallback (only city-level)
          try {
            const resp2 = await fetch("https://ipwho.is/");
            const j2 = await resp2.json();
            if (j2 && j2.success && j2.latitude && j2.longitude) {
              coords.lat = j2.latitude;
              coords.lon = j2.longitude;
              locEl.value = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
              geoStatus.textContent = "Approximate location via fallback ✅";
              const controller = new AbortController();
              setTimeout(() => controller.abort(), 8000);
              fetchWeather(coords.lat, coords.lon, controller.signal);
            }
          } catch {}
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  } else {
    if (geoStatus) geoStatus.textContent = "Geolocation not supported.";
  }
}

detectLocation();

// Debounced weather fetch on manual coordinate entry
function debounce(fn, wait) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}
const debouncedManualWeather = debounce(() => {
  const manual = (locEl.value || "").split(",").map(s => s.trim());
  if (manual.length === 2) {
    const maybeLat = parseFloat(manual[0]);
    const maybeLon = parseFloat(manual[1]);
    if (!Number.isNaN(maybeLat) && !Number.isNaN(maybeLon)) {
      coords.lat = maybeLat;
      coords.lon = maybeLon;
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);
      fetchWeather(coords.lat, coords.lon, controller.signal);
    }
  }
}, 400);
locEl.addEventListener("input", debouncedManualWeather);

// Persist input values for UX continuity
const STORAGE_KEY = "krishigpt.form";
function restoreForm() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj.crop) cropEl.value = obj.crop;
    if (obj.question) questionEl.value = obj.question;
    if (obj.loc) locEl.value = obj.loc;
    if (obj.lang && langEl) langEl.value = obj.lang;
  } catch {}
}
function saveForm() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ crop: cropEl.value, question: questionEl.value, loc: locEl.value, lang: getLang() })
    );
  } catch {}
}
restoreForm();
if (langEl) {
  langEl.addEventListener("change", () => {
    saveForm();
    if (coords.lat != null && coords.lon != null) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);
      fetchWeather(coords.lat, coords.lon, controller.signal);
    }
    applyI18n();
  });
}

function showValidation(msg) {
  validationEl.textContent = msg;
  validationEl.style.display = msg ? "block" : "none";
}

function clearOutputs() {
  if (planEl) planEl.textContent = "";
  if (planListEl) planListEl.innerHTML = "";
  fertEl.textContent = "";
  answerEl.textContent = "";
}

function setLoading(isLoading) {
  askBtn.disabled = isLoading;
  loadingEl.style.display = isLoading ? "block" : "none";
  if (isLoading) {
    if (planEl) planEl.classList.add("skeleton");
    fertEl.classList.add("skeleton");
    answerEl.classList.add("skeleton");
    setProgress(60);
  } else {
    if (planEl) planEl.classList.remove("skeleton");
    fertEl.classList.remove("skeleton");
    answerEl.classList.remove("skeleton");
    setProgress(100);
    setTimeout(() => setProgress(0), 300);
  }
}

async function submitForm() {
  if (submitForm._busy) {
    toast("Please wait…");
    return false;
  }
  const crop = cropEl.value.trim();
  const q = questionEl.value.trim();
  let lat = coords.lat;
  let lon = coords.lon;

  // allow manual override
  const manual = (locEl.value || "").split(",").map(s => s.trim());
  if (manual.length === 2) {
    const maybeLat = parseFloat(manual[0]);
    const maybeLon = parseFloat(manual[1]);
    if (!Number.isNaN(maybeLat) && !Number.isNaN(maybeLon)) {
      lat = maybeLat;
      lon = maybeLon;
    }
  }

  if (!crop || !q || lat == null || lon == null) {
    showValidation("Please provide crop, question, and a location (auto or manual).");
    return false;
  }

  showValidation("");
  setLoading(true);
  clearOutputs();
  saveForm();

  try {
    submitForm._busy = true;
    if (submitForm._controller) {
      try { submitForm._controller.abort(); } catch {}
    }
    const controller = new AbortController();
    submitForm._controller = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch("/ask", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        farmer_id: "web_user",
        question: q,
        crop,
        latitude: lat,
        longitude: lon,
        language: getLang()
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.error) {
      answerEl.textContent = "Error: " + (data.error || "Unknown error");
      toast(`Error: ${data.error}`);
    } else {
      // Render plan as step-by-step list
      if (Array.isArray(data.plan) && planListEl) {
        planListEl.innerHTML = "";
        data.plan.forEach((step) => {
          const li = document.createElement('li');
          li.textContent = String(step);
          planListEl.appendChild(li);
        });
      } else if (planEl) {
      planEl.textContent = Array.isArray(data.plan) ? data.plan.join("\n") : (JSON.stringify(data.plan));
      }
      fertEl.textContent = data.fertilizer || "—";
      const ans = data.answer || {};
      const summary = ans.summary ? `\n${ans.summary}\n` : "";
      const checklist = (ans.checklist || []).map((x, i) => `• ${x}`).join("\n");
      const warnings = (ans.warnings || []).map((x) => `⚠ ${x}`).join("\n");
      answerEl.textContent = [summary, checklist, warnings].filter(Boolean).join("\n\n");
      // Persist last successful response for offline viewing
      try { localStorage.setItem('krishigpt.last', JSON.stringify({ plan: planEl.textContent, fert: fertEl.textContent, answer: answerEl.textContent })); } catch {}
      toast("Answer ready");
    }
  } catch (e) {
    answerEl.textContent = "Request failed: " + (e.name === "AbortError" ? "Timed out. Please try again." : e.toString());
    toast("Request failed");
  } finally {
    setLoading(false);
    submitForm._busy = false;
  }
  return true;
}

askBtn.addEventListener("click", submitForm);

// Submit on Ctrl/Cmd+Enter from textarea
questionEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    submitForm();
  }
});

// Use my location button
if (geoBtn) {
  geoBtn.addEventListener("click", () => detectLocation());
}

// Quick chips fill question
if (quickChips) {
  quickChips.addEventListener("click", (e) => {
    const target = e.target.closest(".chip");
    if (!target) return;
    const q = target.getAttribute("data-q");
    if (q) {
      questionEl.value = q;
      saveForm();
    }
  });
}

// Simple speech-to-text using Web Speech API (if available)
if (micBtn && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recog = new SR();
  recog.lang = getLang() || "en-IN";
  recog.interimResults = false;
  micBtn.addEventListener("click", () => {
    try { recog.lang = getLang(); } catch {}
    recog.start();
  });
  recog.addEventListener("result", (ev) => {
    const transcript = Array.from(ev.results).map(r => r[0].transcript).join(" ");
    if (transcript) {
      questionEl.value = transcript.trim();
      saveForm();
    }
  });
}

// Minimal i18n for core labels
const I18N = {
  en: {
    label_plan: "Plan",
    label_fertilizer: "Fertilizer",
    label_analysis: "Analysis",
    label_crop: "Crop",
    label_location: "Location (lat,lon)",
    label_language: "Language",
    label_question: "Your question",
    ph_question: "e.g., quantity of fertilizer for crop",
    btn_use_location: "📍 Use my location",
    btn_speak: "🎤 Speak",
    btn_ask: "➤ Ask KrishiGPT",
    btn_clear: "🧹 Clear",
    btn_sample: "✨ Sample",
    btn_read: "Read analysis",
    chip_fertilizer: "Fertilizer",
    chip_irrigation: "Irrigation",
    chip_pests: "Pests",
    chip_sowing: "Sowing",
    q_fertilizer: "Fertilizer recommendation for my crop",
    q_irrigation: "Irrigation advice for today",
    q_pests: "Common pests and management",
    q_sowing: "Sowing window and spacing",
    hint_language_input: "Type your question in the selected language.",
    nothing_to_read: "Nothing to read"
  },
  hi: {
    label_plan: "योजना",
    label_fertilizer: "उर्वरक",
    label_analysis: "विश्लेषण",
    label_crop: "फसल",
    label_location: "स्थान (अक्षांश,देशांतर)",
    label_language: "भाषा",
    label_question: "आपका सवाल",
    ph_question: "जैसे, फसल के लिए उर्वरक की मात्रा",
    btn_use_location: "📍 मेरी लोकेशन उपयोग करें",
    btn_speak: "🎤 बोलें",
    btn_ask: "➤ KrishiGPT से पूछें",
    btn_clear: "🧹 साफ करें",
    btn_sample: "✨ उदाहरण",
    btn_read: "विश्लेषण सुनें",
    chip_fertilizer: "उर्वरक",
    chip_irrigation: "सिंचाई",
    chip_pests: "कीट",
    chip_sowing: "बुवाई",
    q_fertilizer: "मेरी फसल के लिए उर्वरक सलाह",
    q_irrigation: "आज की सिंचाई सलाह",
    q_pests: "सामान्य कीट और प्रबंधन",
    q_sowing: "बुवाई समय और दूरी",
    hint_language_input: "चयनित भाषा में अपना प्रश्न लिखें।",
    nothing_to_read: "पढ़ने के लिए कुछ नहीं है"
  },
  mr: {
    label_plan: "योजना",
    label_fertilizer: "खत",
    label_analysis: "विश्लेषण",
    label_crop: "पीक",
    label_location: "स्थान (अक्षांश,रेखांश)",
    label_language: "भाषा",
    label_question: "तुमचा प्रश्न",
    ph_question: "उदा., पिकासाठी खताचे प्रमाण",
    btn_use_location: "📍 माझे स्थान वापरा",
    btn_speak: "🎤 बोला",
    btn_ask: "➤ KrishiGPT ला विचारा",
    btn_clear: "🧹 साफ करा",
    btn_sample: "✨ नमुना",
    btn_read: "विश्लेषण ऐका",
    btn_volume: "आवाज",
    chip_fertilizer: "खत",
    chip_irrigation: "पाणी",
    chip_pests: "किडी",
    chip_sowing: "पेरणी",
    q_fertilizer: "माझ्या पिकासाठी खताची शिफारस",
    q_irrigation: "आजच्या पाण्याची सल्ला",
    q_pests: "सामान्य किडी व व्यवस्थापन",
    q_sowing: "पेरणीचा काळ आणि अंतर",
    hint_language_input: "निवडलेल्या भाषेत प्रश्न लिहा.",
    nothing_to_read: "वाचण्यासाठी काहीही नाही"
  },
  bn: {
    label_plan: "পরিকল্পনা",
    label_fertilizer: "সার",
    label_analysis: "বিশ্লেষণ",
    label_crop: "ফসল",
    label_location: "অবস্থান (অক্ষাংশ,দ্রাঘিমাংশ)",
    label_language: "ভাষা",
    label_question: "আপনার প্রশ্ন",
    ph_question: "যেমন, ফসলের জন্য সারের পরিমাণ",
    btn_use_location: "📍 আমার অবস্থান ব্যবহার করুন",
    btn_speak: "🎤 বলুন",
    btn_ask: "➤ KrishiGPT-কে জিজ্ঞেস করুন",
    btn_clear: "🧹 পরিষ্কার",
    btn_sample: "✨ নমুনা",
    btn_read: "বিশ্লেষণ শুনুন",
    btn_volume: "ভলিউম",
    chip_fertilizer: "সার",
    chip_irrigation: "সেচ",
    chip_pests: "পোকা",
    chip_sowing: "বপন",
    q_fertilizer: "আমার ফসলের সার পরামর্শ",
    q_irrigation: "আজকের সেচ পরামর্শ",
    q_pests: "সাধারণ পোকা ও ব্যবস্থাপনা",
    q_sowing: "বপনের সময় ও দূরত্ব",
    hint_language_input: "নির্বাচিত ভাষায় প্রশ্ন লিখুন।",
    nothing_to_read: "পড়ার জন্য কিছু নেই"
  },
  ta: {
    label_plan: "திட்டம்",
    label_fertilizer: "உரம்",
    label_analysis: "பகுப்பாய்வு",
    label_crop: "பயிர்",
    label_location: "இருப்பிடம் (அகலம்,நீளம்)",
    label_language: "மொழி",
    label_question: "உங்கள் கேள்வி",
    ph_question: "எ.கா., பயிருக்கு உர அளவு",
    btn_use_location: "📍 என் இருப்பிடத்தைப் பயன்படுத்து",
    btn_speak: "🎤 பேசுங்கள்",
    btn_ask: "➤ KrishiGPT-யிடம் கேளுங்கள்",
    btn_clear: "🧹 நீக்கு",
    btn_sample: "✨ எடுத்துக்காட்டு",
    btn_read: "பகுப்பாய்வு கேளுங்கள்",
    btn_volume: "ஒலி",
    chip_fertilizer: "உரம்",
    chip_irrigation: "பாசனம்",
    chip_pests: "பூச்சி",
    chip_sowing: "விதைப்பு",
    q_fertilizer: "என் பயிர்க்கு உர பரிந்துரை",
    q_irrigation: "இன்றைய பாசன ஆலோசனை",
    q_pests: "பொது பூச்சிகள் மற்றும் மேலாண்மை",
    q_sowing: "விதைப்பு நேரம் மற்றும் இடைவெளி",
    hint_language_input: "தேர்ந்த மொழியில் உங்கள் கேள்வியை எழுதுங்கள்.",
    nothing_to_read: "படிக்க எதுவும் இல்லை"
  },
  te: {
    label_plan: "ప్రణాళిక",
    label_fertilizer: "ఎరువు",
    label_analysis: "విశ్లేషణ",
    label_crop: "పంట",
    label_location: "స్థానం (అక్షాంశం,రేఖాంశం)",
    label_language: "భాష",
    label_question: "మీ ప్రశ్న",
    ph_question: "ఉదా., పంటకు ఎరువు మోతాదు",
    btn_use_location: "📍 నా స్థానాన్ని ఉపయోగించు",
    btn_speak: "🎤 మాట్లాడండి",
    btn_ask: "➤ KrishiGPT ను అడగండి",
    btn_clear: "🧹 క్లియర్",
    btn_sample: "✨ నమూనా",
    btn_read: "విశ్లేషణ వినండి",
    btn_volume: "వాల్యూం",
    chip_fertilizer: "ఎరువు",
    chip_irrigation: "పారుదల",
    chip_pests: "కీటకాలు",
    chip_sowing: "విత్తనం",
    q_fertilizer: "నా పంటకు ఎరువు సిఫార్సు",
    q_irrigation: "ఈరోజు పారుదల సలహా",
    q_pests: "సాధారణ కీటకాలు మరియు నియంత్రణ",
    q_sowing: "విత్తన సమయం మరియు దూరం",
    hint_language_input: "ఎంచుకున్న భాషలో మీ ప్రశ్నను టైప్ చేయండి.",
    nothing_to_read: "చదవడానికి ఏమీ లేదు"
  },
  kn: {
    label_plan: "ಯೋಜನೆ",
    label_fertilizer: "ರಸಗೊಬ್ಬರ",
    label_analysis: "ವಿಶ್ಲೇಷಣೆ",
    label_crop: "ಬೆಳೆ",
    label_location: "ಸ್ಥಳ (ಅಕ್ಷಾಂಶ, ರೇಖಾಂಶ)",
    label_language: "ಭಾಷೆ",
    label_question: "ನಿಮ್ಮ ಪ್ರಶ್ನೆ",
    ph_question: "ಉದಾ., ಬೆಳೆಗಾಗಿ ರಸಗೊಬ್ಬರ ಪ್ರಮಾಣ",
    btn_use_location: "📍 ನನ್ನ ಸ್ಥಳ ಬಳಸಿ",
    btn_speak: "🎤 ಮಾತನಾಡಿ",
    btn_ask: "➤ KrishiGPT ಅನ್ನು ಕೇಳಿ",
    btn_clear: "🧹 ಕ್ಲೀರ್",
    btn_sample: "✨ ಮಾದರಿ",
    btn_read: "ವಿಶ್ಲేಷಣೆಯನ್ನು ಕೇಳಿ",
    btn_volume: "ಧ್ವನಿ",
    chip_fertilizer: "ರಸಗೊಬ್ಬರ",
    chip_irrigation: "ನೀರಾವರಿ",
    chip_pests: "ಕೀಟಗಳು",
    chip_sowing: "ಬಿತ್ತನೆ",
    q_fertilizer: "ನನ್ನ ಬೆಳೆಗಾಗಿ ರಸಗೊಬ್ಬರ ಸಲಹೆ",
    q_irrigation: "ಇಂದಿನ ನೀರಾವರಿ ಸಲಹೆ",
    q_pests: "ಸಾಮಾನ್ಯ ಕೀಟಗಳು ಮತ್ತು ನಿರ್ವಹಣೆ",
    q_sowing: "ಬಿತ್ತನೆ ಸಮಯ ಮತ್ತು ಅಂತರ",
    hint_language_input: "ಆಯ್ದ ಭಾಷೆಯಲ್ಲಿ ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಬರೆಯಿರಿ.",
    nothing_to_read: "ಓದಲು ಏನೂ ಇಲ್ಲ"
  },
  gu: {
    label_plan: "યોજના",
    label_fertilizer: "ખાતર",
    label_analysis: "વિશ્લેષણ",
    label_crop: "પાક",
    label_location: "સ્થાન (અક્ષાંશ, રેખાંશ)",
    label_language: "ભાષા",
    label_question: "તમારો પ્રશ્ન",
    ph_question: "દા.ત., પાક માટે ખાતરનું પ્રમાણ",
    btn_use_location: "📍 મારું સ્થાન વાપરો",
    btn_speak: "🎤 બોલો",
    btn_ask: "➤ KrishiGPT ને પૂછો",
    btn_clear: "🧹 ક્લિયર",
    btn_sample: "✨ નમૂનો",
    btn_read: "વિશ્લેષણ સાંભળો",
    btn_volume: "અવાજ",
    chip_fertilizer: "ખાતર",
    chip_irrigation: "સિંચાઈ",
    chip_pests: "કીટકો",
    chip_sowing: "વાવેતર",
    q_fertilizer: "મારા પાક માટે ખાતરની સલાહ",
    q_irrigation: "આજની સિંચાઈ સલાહ",
    q_pests: "સામાન્ય કીટકો અને વ્યવસ્થાપન",
    q_sowing: "વાવેતર સમય અને અંતર",
    hint_language_input: "પસંદ કરેલી ભાષામાં તમારો પ્રશ્ન લખો.",
    nothing_to_read: "વાંચવા માટે કઈ નથી"
  },
  pa: {
    label_plan: "ਯੋਜਨਾ",
    label_fertilizer: "ਖਾਦ",
    label_analysis: "ਵਿਸ਼ਲੇਸ਼ਣ",
    label_crop: "ਫਸਲ",
    label_location: "ਟਿਕਾਣਾ (ਅਕਸ਼ਾਂਸ਼, ਦੇਸ਼ਾਂਤਰ)",
    label_language: "ਭਾਸ਼ਾ",
    label_question: "ਤੁਹਾਡਾ ਸਵਾਲ",
    ph_question: "ਜਿਵੇਂ, ਫਸਲ ਲਈ ਖਾਦ ਦੀ ਮਾਤਰਾ",
    btn_use_location: "📍 ਮੇਰਾ ਟਿਕਾਣਾ ਵਰਤੋ",
    btn_speak: "🎤 ਬੋਲੋ",
    btn_ask: "➤ KrishiGPT ਨੂੰ ਪੁੱਛੋ",
    btn_clear: "🧹 ਸਾਫ ਕਰੋ",
    btn_sample: "✨ ਨਮੂਨਾ",
    btn_read: "ਵਿਸ਼ਲੇਸ਼ਣ ਸੁਣੋ",
    btn_volume: "ਆਵਾਜ਼",
    chip_fertilizer: "ਖਾਦ",
    chip_irrigation: "ਸਿੰਚਾਈ",
    chip_pests: "ਕੀੜੇ",
    chip_sowing: "ਬੀਜਾਈ",
    q_fertilizer: "ਮੇਰੀ ਫਸਲ ਲਈ ਖਾਦ ਸਿਫਾਰਸ਼",
    q_irrigation: "ਅੱਜ ਦੀ ਸਿੰਚਾਈ ਸਲਾਹ",
    q_pests: "ਆਮ ਕੀੜੇ ਤੇ ਪ੍ਰਬੰਧਨ",
    q_sowing: "ਬੀਜਾਈ ਦਾ ਸਮਾਂ ਤੇ ਦੂਰੀ",
    hint_language_input: "ਚੁਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਆਪਣਾ ਸਵਾਲ ਲਿਖੋ।",
    nothing_to_read: "ਪੜ੍ਹਨ ਲਈ ਕੁਝ ਨਹੀਂ"
  },
  ur: {
    label_plan: "منصوبہ",
    label_fertilizer: "کھاد",
    label_analysis: "تجزیہ",
    label_crop: "فصل",
    label_location: "مقام (عرض البلد، طول البلد)",
    label_language: "زبان",
    label_question: "آپ کا سوال",
    ph_question: "مثلاً، فصل کے لیے کھاد کی مقدار",
    btn_use_location: "📍 میرا مقام استعمال کریں",
    btn_speak: "🎤 بولیں",
    btn_ask: "➤ KrishiGPT سے پوچھیں",
    btn_clear: "🧹 صاف کریں",
    btn_sample: "✨ نمونہ",
    btn_read: "تجزیہ سنیں",
    chip_fertilizer: "کھاد",
    chip_irrigation: "آبپاشی",
    chip_pests: "کیڑے",
    chip_sowing: "بوائی",
    q_fertilizer: "میری فصل کے لیے کھاد کی سفارش",
    q_irrigation: "آج کی آبپاشی مشورہ",
    q_pests: "عام کیڑے اور ان کا انتظام",
    q_sowing: "بوائی کا وقت اور فاصلہ",
    hint_language_input: "منتخب زبان میں اپنا سوال لکھیں۔",
    nothing_to_read: "پڑھنے کے لیے کچھ نہیں"
  }
  // Add more languages here as needed
};

function applyI18n() {
  const lang = getLang();
  const dict = I18N[lang] || I18N.en;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const txt = dict[key];
    if (typeof txt === "string") {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON" || el.tagName === "SELECT" || el.tagName === "OPTION") {
        el.textContent = txt;
      } else {
        el.textContent = txt;
      }
    }
  });
  // Placeholder translations
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const txt = dict[key];
    if (typeof txt === 'string') {
      el.setAttribute('placeholder', txt);
    }
  });
  // Translate chip "data-q" prompts
  document.querySelectorAll('#quickChips .chip').forEach((el) => {
    const qKey = el.getAttribute('data-i18n-q');
    if (qKey && dict[qKey]) {
      el.setAttribute('data-q', dict[qKey]);
    }
  });
  // Language input hint
  if (langHint && dict.hint_language_input) {
    langHint.textContent = dict.hint_language_input;
  }
}

applyI18n();

// Read analysis aloud using Speech Synthesis
if (readBtn && "speechSynthesis" in window) {
  readBtn.addEventListener("click", () => {
    const text = buildReadableText();
    if (!text) { toast(getDict().nothing_to_read || "Nothing to read"); return; }
    const utter = new SpeechSynthesisUtterance(text);
    const lang = getLang();
    utter.lang = normalizeLang(lang) || "en-IN";
    const voice = pickVoiceForLang(lang);
    if (voice) {
      utter.voice = voice;
    } else {
      // Inform user about missing voice for selected language
      const missingMsg = {
        te: "Telugu voice not found on this device. Install a Telugu TTS voice in your OS/browser for better results.",
        ta: "Tamil voice not found on this device.",
        bn: "Bengali voice not found on this device.",
        mr: "Marathi voice not found on this device.",
        gu: "Gujarati voice not found on this device.",
        pa: "Punjabi voice not found on this device.",
        kn: "Kannada voice not found on this device.",
        hi: "Hindi voice not found on this device.",
      };
      if (missingMsg[lang]) toast(missingMsg[lang]);
    }
    try { speechSynthesis.cancel(); } catch {}
    speechSynthesis.speak(utter);
  });
}

function getDict() { const d = I18N[getLang()] || I18N.en; return d; }
function t(key, fallback) { const d = getDict(); return d[key] || fallback || key; }
function buildReadableText() {
  const parts = [];
  if (planListEl && planListEl.children && planListEl.children.length) {
    const steps = Array.from(planListEl.children).map((li, i) => {
      const raw = String(li.textContent || '').trim();
      const hasNumberPrefix = /^\s*\d+[\).\-:\s]+/.test(raw);
      return hasNumberPrefix ? raw : `${i + 1}. ${raw}`;
    });
    parts.push(steps.join(' '));
  } else if (planEl && planEl.textContent) {
    parts.push(planEl.textContent);
  }
  if (fertEl && fertEl.textContent) parts.push(fertEl.textContent);
  if (answerEl && answerEl.textContent) parts.push(answerEl.textContent);
  return parts.filter(Boolean).join('. ');
}
// Volume button: if native voice missing, use server TTS fallback
let currentAudio = null;
let speechRate = 1.0;
try { const saved = parseFloat(localStorage.getItem('krishigpt.rate') || '1'); if (!Number.isNaN(saved) && saved > 0.4 && saved < 2.1) speechRate = saved; } catch {}
function updateSpeedButtonLabel() { if (speedBtn) speedBtn.textContent = `${(Math.round(speechRate*100)/100)}x`; }
updateSpeedButtonLabel();
if (speedBtn) {
  speedBtn.addEventListener('click', () => {
    const options = [0.75, 1.0, 1.25, 1.5];
    const idx = options.findIndex(v => Math.abs(v - speechRate) < 0.01);
    const next = options[(idx + 1) % options.length];
    speechRate = next;
    updateSpeedButtonLabel();
    try { localStorage.setItem('krishigpt.rate', String(speechRate)); } catch {}
    // If audio is currently playing via fallback, update playback rate live
    if (currentAudio && !currentAudio.paused) {
      try { currentAudio.playbackRate = speechRate; } catch {}
    }
  });
}
if (volumeBtn) {
  volumeBtn.addEventListener("click", async () => {
    // Toggle behavior: if playing, stop
    if (speechSynthesis?.speaking) {
      try { speechSynthesis.cancel(); } catch {}
      return;
    }
    if (currentAudio && !currentAudio.paused) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {}
      currentAudio = null;
      return;
    }

    const text = buildReadableText();
    if (!text) { toast(getDict().nothing_to_read || "Nothing to read"); return; }
    const lang = getLang();
    // Prefer native voice if available
    const hasVoice = !!pickVoiceForLang(lang);
    if ("speechSynthesis" in window && hasVoice) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = normalizeLang(lang) || "en-IN";
      const voice = pickVoiceForLang(lang);
      if (voice) utter.voice = voice;
      try { utter.rate = speechRate; } catch {}
      try { speechSynthesis.cancel(); } catch {}
      speechSynthesis.speak(utter);
      return;
    }

    // Fallback to server TTS
    try {
      setProgress(50);
      const res = await fetch('/tts', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ text, lang }) });
      if (!res.ok) throw new Error('TTS request failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      try { audio.playbackRate = speechRate; } catch {}
      audio.play();
      audio.addEventListener('ended', () => { URL.revokeObjectURL(url); currentAudio = null; });
    } catch (e) {
      toast('Audio playback failed');
    } finally {
      setProgress(0);
    }
  });
}

// Voice selection helpers
function normalizeLang(lang) {
  if (!lang) return "en-IN";
  const map = { en: "en-IN", hi: "hi-IN", te: "te-IN", ta: "ta-IN", bn: "bn-IN", mr: "mr-IN", gu: "gu-IN", pa: "pa-IN", kn: "kn-IN" };
  return map[lang] || lang;
}

let AVAILABLE_VOICES = [];
function refreshVoices() {
  try { AVAILABLE_VOICES = window.speechSynthesis.getVoices() || []; } catch { AVAILABLE_VOICES = []; }
}
if ("speechSynthesis" in window) {
  refreshVoices();
  try { window.speechSynthesis.addEventListener("voiceschanged", refreshVoices); } catch {}
}

function pickVoiceForLang(lang) {
  if (!AVAILABLE_VOICES || AVAILABLE_VOICES.length === 0) return null;
  const wanted = normalizeLang(lang);
  // Exact match
  let v = AVAILABLE_VOICES.find(v => (v.lang || "").toLowerCase() === wanted.toLowerCase());
  if (v) return v;
  // Starts-with match
  v = AVAILABLE_VOICES.find(v => (v.lang || "").toLowerCase().startsWith((lang || "en").toLowerCase()));
  if (v) return v;
  // Regional alternatives (e.g., te-IN vs te)
  v = AVAILABLE_VOICES.find(v => (v.lang || "").toLowerCase().includes((lang || "en").toLowerCase()));
  return v || null;
}

// Progress helpers
function setProgress(value) {
  if (!pageProgress) return;
  pageProgress.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

// Toast helpers
let toastTimer;
function toast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.display = "none";
  }, 2500);
}

// Clear and Sample
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    cropEl.value = "";
    questionEl.value = "";
    // keep location
    clearOutputs();
    saveForm();
  });
}
if (sampleBtn) {
  sampleBtn.addEventListener("click", () => {
    cropEl.value = "wheat";
    questionEl.value = "Fertilizer recommendation for current week";
    saveForm();
  });
}

// Clear previous results and form on page load for fresh start
try {
  localStorage.removeItem('krishigpt.last');
  localStorage.removeItem('krishigpt.form');
  
  // Clear all form fields
  if (cropEl) cropEl.value = '';
  if (locEl) locEl.value = '';
  if (questionEl) questionEl.value = '';
  if (langEl) langEl.value = 'en';
  
  // Clear all result displays
  if (planEl) planEl.textContent = '';
  if (planListEl) planListEl.innerHTML = '';
  if (fertEl) fertEl.textContent = '';
  if (answerEl) answerEl.textContent = '';
  
  // Reset geo status
  if (geoStatus) geoStatus.textContent = 'Detecting location…';
  
  // Reset coordinates
  coords = { lat: null, lon: null };
} catch {}

// Copy buttons for results
function addCopyButton(targetEl, label) {
  if (!targetEl) return;
  const btn = document.createElement('button');
  btn.className = 'secondary';
  btn.textContent = label || 'Copy';
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(targetEl.textContent || '');
      toast('Copied');
    } catch { toast('Copy failed'); }
  });
  const container = targetEl.parentElement?.querySelector?.('.card-head');
  if (container) container.appendChild(btn);
}

addCopyButton(planEl, 'Copy');
addCopyButton(fertEl, 'Copy');
addCopyButton(answerEl, 'Copy');

// Stop speech synthesis when page refreshes or unloads
window.addEventListener('beforeunload', () => {
  try { 
    if (speechSynthesis?.speaking) {
      speechSynthesis.cancel(); 
    }
    if (currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
  } catch {}
});

window.addEventListener('pagehide', () => {
  try { 
    if (speechSynthesis?.speaking) {
      speechSynthesis.cancel(); 
    }
    if (currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
  } catch {}
});
