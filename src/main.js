import "@m3e/web/theme";
import "@m3e/web/shape";
import "@m3e/web/button";
import "@m3e/web/icon-button";
import "@m3e/web/dialog";
import "@m3e/web/switch";
import "./style.css";
import "@m3e/web/segmented-button";
import {
  Hct, MaterialDynamicColors, SchemeExpressive, SchemeTonalSpot, SchemeVibrant, argbFromHex, hexFromArgb,
} from "@material/material-color-utilities";

const STORAGE_KEY = "xdan:newtab";
const WALLPAPER_KEY = "xdan:newtab:wallpaper";
const SWATCHES = ["#77DD77", "#6750A4", "#4A90E2", "#00A6A6", "#F2B33D", "#FF8A65", "#E05A8A", "#9E9E9E"];
const MORPHS = ["9-sided-cookie", "soft-burst", "4-leaf-clover", "pentagon", "sunny", "puffy-diamond", "flower", "6-sided-cookie"];
const HOVER_SHAPES = ["4-sided-cookie", "sunny", "soft-burst", "8-leaf-clover", "puffy-diamond", "6-sided-cookie"];
const BACKDROP_SHAPES = ["puffy", "soft-boom", "very-sunny", "ghost-ish", "flower", "soft-burst", "12-sided-cookie", "bun"];
const FONTS = {
  outfit: ["Outfit", null],
  manrope: ["Manrope", "Manrope:wght@400..800"],
  comfortaa: ["Comfortaa", "Comfortaa:wght@400..700"],
  rubik: ["Rubik", "Rubik:wght@400..800"],
};
const ENGINES = {
  google: ["Google", "https://www.google.com/search?q="],
  duckduckgo: ["DuckDuckGo", "https://duckduckgo.com/?q="],
  bing: ["Bing", "https://www.bing.com/search?q="],
  brave: ["Brave", "https://search.brave.com/search?q="],
};
const DEFAULTS = {
  color: "#77DD77",
  scheme: "auto",
  variant: "vibrant",
  engine: "google",
  font: "outfit",
  name: "",
  hour24: true,
  clockStyle: "digital",
  showClock: true,
  showSeconds: false,
  showDate: true,
  showGreeting: true,
  showShortcuts: true,
  motion: true,
  suggestions: false,
  voice: false,
  wallpaper: "none",
  wallpaperDim: 45,
  shortcuts: [
    { name: "YouTube", url: "https://youtube.com" },
    { name: "GitHub", url: "https://github.com" },
    { name: "Gmail", url: "https://mail.google.com" },
    { name: "Reddit", url: "https://reddit.com" },
    { name: "XDan", url: "https://xdan.cc" },
  ],
};

function sanitise(raw) {
  const result = structuredClone(DEFAULTS);
  if (!raw || typeof raw !== "object") return result;
  for (const key of Object.keys(DEFAULTS)) {
    if (key === "shortcuts") continue;
    if (typeof raw[key] === typeof DEFAULTS[key]) result[key] = raw[key];
  }
  if (!ENGINES[result.engine]) result.engine = DEFAULTS.engine;
  if (!FONTS[result.font]) result.font = DEFAULTS.font;
  if (!/^#[\da-f]{6}$/i.test(result.color)) result.color = DEFAULTS.color;
  if (Array.isArray(raw.shortcuts)) {
    result.shortcuts = raw.shortcuts
      .map((s) => ({ name: String(s?.name ?? "").slice(0, 24), url: normaliseUrl(String(s?.url ?? "")) }))
      .filter((s) => s.url);
  }
  return result;
}

// m3e-theme 2.5.14 always builds tonal-spot palettes whatever its variant says,
// so the page generates the real scheme (2025 spec) and sets the roles itself.
const SCHEMES = { "tonal-spot": SchemeTonalSpot, vibrant: SchemeVibrant, expressive: SchemeExpressive };
const dynamicColors = new MaterialDynamicColors();
const colorRoles = [...dynamicColors.allColors, dynamicColors.surfaceVariant(), dynamicColors.shadow(), dynamicColors.scrim(), dynamicColors.surfaceTint()];
function paletteFor(color, variant, isDark) {
  const Scheme = SCHEMES[variant] ?? SchemeVibrant;
  const scheme = new Scheme(Hct.fromInt(argbFromHex(color)), isDark, 0, "2025");
  const roles = {};
  for (const role of colorRoles) roles[`--md-sys-color-${role.name.replace(/_/g, "-").toLowerCase()}`] = hexFromArgb(role.getArgb(scheme));
  return roles;
}

function normaliseUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); return true; } catch { return false; }
}

// Downscale an uploaded image so it fits comfortably in localStorage.
async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.length < 3_500_000) return data;
  }
  throw new Error("Image too large");
}

function mount(scope) {
  const $ = (id) => document.getElementById(id);
  const theme = $("nt-theme");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let settings = sanitise(JSON.parse(readStorage(STORAGE_KEY) || "null"));
  let morphIndex = 0;
  let editing = -1;
  let editMode = false;
  const playful = () => settings.motion && !reduceMotion;

  const save = () => {
    writeStorage(STORAGE_KEY, JSON.stringify(settings));
    const saved = $("nt-saved");
    saved.classList.remove("nt-pulse");
    void saved.offsetWidth;
    saved.classList.add("nt-pulse");
  };
  const update = (patch) => { Object.assign(settings, patch); apply(); save(); };

  // ── Clock ────────────────────────────────────────────────
  function tick() {
    const now = new Date();
    const options = { hour: "2-digit", minute: "2-digit", hour12: !settings.hour24 };
    if (settings.showSeconds) options.second = "2-digit";
    $("nt-time").textContent = now.toLocaleTimeString(undefined, options);
    $("nt-time").dateTime = now.toISOString();
    $("nt-date").textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    $("nt-date-day").textContent = now.getDate();
    const hour = now.getHours();
    const part = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    $("nt-greeting").textContent = settings.name ? `${part}, ${settings.name}` : part;
    const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (hour % 12) + m / 60;
    $("nt-hand-h").style.rotate = `${h * 30}deg`;
    $("nt-hand-m").style.rotate = `${m * 6}deg`;
    $("nt-hand-s").style.rotate = `${s * 6}deg`;
    scope.timeout(tick, 1000 - now.getMilliseconds() + 5);
  }

  // ── Morphing hero + breathing backdrop ───────────────────
  function morph() {
    morphIndex = (morphIndex + 1) % MORPHS.length;
    $("nt-morph").name = MORPHS[morphIndex];
  }
  scope.listen($("nt-clock-shape"), "click", morph);

  const backdrop = $("nt-backdrop");
  const blobs = [
    { x: -6, y: 28, size: 30 }, { x: 82, y: -8, size: 22 }, { x: 88, y: 46, size: 18 },
    { x: 74, y: 78, size: 12 }, { x: -2, y: 86, size: 16 },
  ].map((spot, index) => {
    const shape = document.createElement("m3e-shape");
    shape.name = BACKDROP_SHAPES[index];
    shape.style.setProperty("--x", `${spot.x}vw`);
    shape.style.setProperty("--y", `${spot.y}vh`);
    shape.style.setProperty("--size", `${spot.size}vmax`);
    shape.style.setProperty("--delay", `${index * -3.7}s`);
    backdrop.append(shape);
    return shape;
  });
  let blobStep = 0;
  function breathe() {
    if (playful() && !document.hidden) {
      blobStep++;
      blobs.forEach((shape, index) => { shape.name = BACKDROP_SHAPES[(index + blobStep) % BACKDROP_SHAPES.length]; });
      morph();
    }
    scope.timeout(breathe, 7000);
  }

  // ── Search, suggestions, voice ───────────────────────────
  const query = $("nt-query");
  const list = $("nt-suggestions");
  const listWrap = $("nt-suggestions-wrap");
  const searchBox = $("nt-search-box");
  let suggestionItems = [];
  let activeSuggestion = -1;
  let suggestToken = 0;

  function go(text) {
    const value = text.trim();
    if (!value) return;
    const direct = /^\S+\.\S{2,}$/.test(value) ? normaliseUrl(value) : null;
    location.href = direct ?? ENGINES[settings.engine][1] + encodeURIComponent(value);
  }
  scope.listen($("nt-search"), "submit", (event) => {
    event.preventDefault();
    go(activeSuggestion >= 0 ? suggestionItems[activeSuggestion] : query.value);
  });

  function setListHeight(open) {
    searchBox.classList.toggle("nt-expanded", open);
    listWrap.style.height = open ? `${list.scrollHeight}px` : "0px";
  }
  function closeSuggestions() {
    setListHeight(false);
    suggestionItems = [];
    activeSuggestion = -1;
    query.setAttribute("aria-expanded", "false");
    query.removeAttribute("aria-activedescendant");
  }
  function showSuggestions(items) {
    suggestionItems = items.slice(0, 6);
    activeSuggestion = -1;
    list.replaceChildren(...suggestionItems.map((text, index) => {
      const item = document.createElement("li");
      item.id = `nt-suggestion-${index}`;
      item.role = "option";
      item.textContent = text;
      item.addEventListener("pointerdown", (event) => { event.preventDefault(); go(text); });
      return item;
    }));
    setListHeight(suggestionItems.length > 0);
    query.setAttribute("aria-expanded", String(suggestionItems.length > 0));
  }
  function highlight(index) {
    activeSuggestion = index;
    [...list.children].forEach((item, i) => item.setAttribute("aria-selected", String(i === index)));
    if (index >= 0) query.setAttribute("aria-activedescendant", `nt-suggestion-${index}`);
    else query.removeAttribute("aria-activedescendant");
  }

  // Google's suggest endpoint has no CORS, so it is read through JSONP.
  function fetchSuggestions(text) {
    const token = ++suggestToken;
    const callback = `__ntSuggest${token}`;
    const script = document.createElement("script");
    const done = () => { delete window[callback]; script.remove(); };
    window[callback] = (data) => {
      done();
      if (token === suggestToken && document.activeElement === query && query.value.trim()) {
        showSuggestions(Array.isArray(data?.[1]) ? data[1].filter((s) => typeof s === "string") : []);
      }
    };
    script.onerror = done;
    script.src = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(text)}&callback=${callback}`;
    document.head.append(script);
  }
  let debounce = 0;
  scope.listen(query, "input", () => {
    clearTimeout(debounce);
    const text = query.value.trim();
    if (!settings.suggestions || !text) { suggestToken++; closeSuggestions(); return; }
    debounce = setTimeout(() => fetchSuggestions(text), 150);
  });
  scope.cleanup(() => clearTimeout(debounce));
  scope.listen(query, "keydown", (event) => {
    if (!suggestionItems.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const n = suggestionItems.length;
      highlight(event.key === "ArrowDown" ? (activeSuggestion + 1) % n : (activeSuggestion - 1 + n) % n);
      query.value = suggestionItems[activeSuggestion];
    } else if (event.key === "Escape") {
      closeSuggestions();
    }
  });
  // Clear the old rows only once the box has finished contracting.
  scope.listen(listWrap, "transitionend", () => { if (!suggestionItems.length) list.replaceChildren(); });
  scope.listen(query, "focus", () => { $("nt-search-icon").querySelector("m3e-shape").name = "4-sided-cookie"; });
  scope.listen(query, "blur", () => { $("nt-search-icon").querySelector("m3e-shape").name = "circle"; closeSuggestions(); });
  scope.listen(document, "keydown", (event) => {
    if (event.key === "/" && document.activeElement === document.body) { event.preventDefault(); query.focus(); }
    if (event.key === "Escape" && sheetOpen()) closeSheet();
  });

  let recognition = null;
  const mic = $("nt-mic");
  scope.listen(mic, "click", () => {
    if (!SpeechRecognition) return;
    if (recognition) { recognition.stop(); return; }
    recognition = new SpeechRecognition();
    recognition.lang = navigator.language;
    recognition.interimResults = true;
    mic.classList.add("nt-listening");
    mic.querySelector("m3e-shape").name = "soft-burst";
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      query.value = result[0].transcript;
      if (result.isFinal) go(query.value);
    };
    recognition.onend = recognition.onerror = () => {
      recognition = null;
      mic.classList.remove("nt-listening");
      mic.querySelector("m3e-shape").name = "circle";
    };
    recognition.start();
  });
  scope.cleanup(() => recognition?.abort());

  // ── Shortcuts ────────────────────────────────────────────
  const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const ICONS = {
    left: "M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z",
    right: "M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z",
    remove: "M7 21q-.82 0-1.41-.59Q5 19.83 5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .83-.59 1.41Q17.83 21 17 21Zm2-4h2V8H9Zm4 0h2V8h-2Z",
    add: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  };
  let dragFrom = -1;

  function move(from, to) {
    if (to < 0 || to >= settings.shortcuts.length || from === to) return;
    const [item] = settings.shortcuts.splice(from, 1);
    settings.shortcuts.splice(to, 0, item);
    save();
    renderShortcuts(to);
  }

  function renderShortcuts(focusIndex) {
    const nav = $("nt-shortcuts");
    nav.replaceChildren();
    nav.classList.toggle("nt-editing", editMode);
    settings.shortcuts.forEach((shortcut, index) => {
      const item = document.createElement("div");
      item.className = "nt-shortcut-item";
      const link = document.createElement(editMode ? "div" : "a");
      link.className = "nt-shortcut";
      if (!editMode) link.href = shortcut.url;
      const tile = document.createElement("span");
      tile.className = "nt-tile";
      const shape = document.createElement("m3e-shape");
      shape.name = "circle";
      const letter = document.createElement("span");
      letter.className = "nt-letter";
      letter.textContent = (shortcut.name || "?").slice(0, 1).toUpperCase();
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = `https://icons.duckduckgo.com/ip3/${new URL(shortcut.url).hostname}.ico`;
      img.addEventListener("error", () => img.remove(), { once: true });
      tile.append(shape, letter, img);
      const label = document.createElement("span");
      label.className = "nt-label";
      label.textContent = shortcut.name;
      link.append(tile, label);
      const hoverShape = HOVER_SHAPES[index % HOVER_SHAPES.length];
      const on = () => { shape.name = hoverShape; };
      const off = () => { shape.name = "circle"; };
      item.addEventListener("pointerenter", on);
      item.addEventListener("pointerleave", off);
      item.addEventListener("focusin", on);
      item.addEventListener("focusout", off);
      item.append(link);

      if (editMode) {
        item.draggable = true;
        item.addEventListener("dragstart", (event) => { dragFrom = index; item.classList.add("nt-dragging"); event.dataTransfer.effectAllowed = "move"; });
        item.addEventListener("dragend", () => { dragFrom = -1; item.classList.remove("nt-dragging"); });
        item.addEventListener("dragover", (event) => { if (dragFrom >= 0) { event.preventDefault(); item.classList.add("nt-drop"); } });
        item.addEventListener("dragleave", () => item.classList.remove("nt-drop"));
        item.addEventListener("drop", (event) => { event.preventDefault(); move(dragFrom, index); });
        const tools = document.createElement("div");
        tools.className = "nt-tools";
        const tool = (name, label, action, disabled) => {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.tool = name;
          button.setAttribute("aria-label", `${label} ${shortcut.name}`);
          button.innerHTML = icon(ICONS[name]);
          button.disabled = disabled;
          button.addEventListener("click", action);
          tools.append(button);
          return button;
        };
        tool("left", "Move left", () => move(index, index - 1), index === 0);
        const editButton = tool("edit", "Edit", () => openShortcut(index), false);
        tool("remove", "Remove", () => { settings.shortcuts.splice(index, 1); save(); renderShortcuts(Math.min(index, settings.shortcuts.length - 1)); }, false);
        tool("right", "Move right", () => move(index, index + 1), index === settings.shortcuts.length - 1);
        item.append(tools);
        if (focusIndex === index) requestAnimationFrame(() => editButton.focus());
      }
      nav.append(item);
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "nt-shortcut nt-add";
    add.innerHTML = `<span class="nt-tile"><m3e-shape name="circle"></m3e-shape>${icon(ICONS.add)}</span><span class="nt-label">Add</span>`;
    const addShape = add.querySelector("m3e-shape");
    add.addEventListener("pointerenter", () => { addShape.name = "8-leaf-clover"; });
    add.addEventListener("pointerleave", () => { addShape.name = "circle"; });
    add.addEventListener("click", () => openShortcut(-1));
    const addItem = document.createElement("div");
    addItem.className = "nt-shortcut-item";
    addItem.append(add);
    nav.append(addItem);
  }

  scope.listen($("nt-edit-toggle"), "click", () => {
    editMode = !editMode;
    $("nt-edit-toggle").setAttribute("aria-pressed", String(editMode));
    $("nt-edit-toggle").querySelector("span").textContent = editMode ? "Done" : "Edit";
    $("nt-edit-hint").hidden = !editMode;
    renderShortcuts();
  });

  function openShortcut(index) {
    editing = index;
    const existing = settings.shortcuts[index];
    $("nt-shortcut-title").textContent = existing ? "Edit shortcut" : "Add shortcut";
    $("nt-shortcut-name").value = existing?.name ?? "";
    $("nt-shortcut-url").value = existing?.url ?? "";
    $("nt-shortcut-url").setCustomValidity("");
    $("nt-shortcut-dialog").show();
  }
  function saveShortcut() {
    const urlField = $("nt-shortcut-url");
    const url = normaliseUrl(urlField.value);
    if (!url) { urlField.setCustomValidity("Enter a valid web address"); urlField.reportValidity(); return; }
    const name = $("nt-shortcut-name").value.trim() || new URL(url).hostname.replace(/^www\./, "");
    if (editing >= 0) settings.shortcuts[editing] = { name, url }; else settings.shortcuts.push({ name, url });
    save();
    renderShortcuts();
    $("nt-shortcut-dialog").close();
  }
  scope.listen($("nt-shortcut-url"), "input", () => $("nt-shortcut-url").setCustomValidity(""));
  scope.listen($("nt-shortcut-save"), "click", saveShortcut);
  scope.listen($("nt-shortcut-cancel"), "click", () => $("nt-shortcut-dialog").close());
  scope.listen($("nt-shortcut-form"), "submit", (event) => { event.preventDefault(); saveShortcut(); });
  scope.listen($("nt-shortcut-form"), "keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); saveShortcut(); } });

  // ── Side sheet ───────────────────────────────────────────
  const sheet = $("nt-sheet");
  const scrim = $("nt-scrim");
  const opener = $("nt-open-settings");
  const sheetOpen = () => sheet.classList.contains("nt-open");
  // Container transform: the sheet is clipped to the button's rectangle, then grows out of it.
  function clipToOpener() {
    const button = opener.getBoundingClientRect();
    const panel = sheet.getBoundingClientRect();
    const radius = getComputedStyle(opener).borderTopLeftRadius;
    sheet.style.setProperty("--nt-clip", `inset(${button.top - panel.top}px ${panel.right - button.right}px ${panel.bottom - button.bottom}px ${button.left - panel.left}px round ${radius})`);
  }
  function openSheet() {
    // Jump (no transition) to the button's shape before growing out of it.
    sheet.style.transition = "none";
    clipToOpener();
    void sheet.offsetWidth;
    sheet.style.transition = "";
    scrim.hidden = false;
    sheet.inert = false;
    sheet.classList.add("nt-visible");
    opener.classList.add("nt-morphed");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sheet.classList.add("nt-open");
      scrim.classList.add("nt-open");
    }));
    opener.setAttribute("aria-expanded", "true");
    sheet.querySelector("#nt-close-settings").focus({ preventScroll: true });
  }
  function closeSheet() {
    clipToOpener();
    sheet.classList.remove("nt-open");
    scrim.classList.remove("nt-open");
    sheet.inert = true;
    opener.setAttribute("aria-expanded", "false");
    scope.timeout(() => {
      if (sheetOpen()) return;
      scrim.hidden = true;
      sheet.classList.remove("nt-visible");
      opener.classList.remove("nt-morphed");
    }, reduceMotion ? 0 : 450);
    opener.focus({ preventScroll: true });
  }
  scope.listen(opener, "click", openSheet);
  scope.listen($("nt-close-settings"), "click", closeSheet);
  scope.listen(scrim, "click", closeSheet);
  scope.listen(sheet, "keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...sheet.querySelectorAll("input:not([hidden]), m3e-switch, m3e-button-segment, m3e-button, m3e-icon-button, button")]
      .filter((el) => !el.closest("[hidden]") && !el.disabled);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  // Swatches
  const swatches = $("nt-swatches");
  for (const color of SWATCHES) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "nt-swatch";
    swatch.role = "radio";
    swatch.dataset.color = color;
    swatch.style.setProperty("--swatch", color);
    swatch.setAttribute("aria-label", color);
    swatch.innerHTML = '<m3e-shape name="circle"></m3e-shape>';
    swatch.addEventListener("click", () => update({ color }));
    swatches.append(swatch);
  }
  const custom = document.createElement("label");
  custom.className = "nt-swatch nt-swatch-custom";
  custom.innerHTML = '<m3e-shape name="circle"></m3e-shape><input type="color" aria-label="Custom colour">';
  const picker = custom.querySelector("input");
  picker.addEventListener("input", () => update({ color: picker.value.toUpperCase() }));
  swatches.append(custom);

  // Fonts
  const fonts = $("nt-fonts");
  const loadedFonts = new Set(["outfit"]);
  for (const [key, [family]] of Object.entries(FONTS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "radio";
    button.className = "nt-font";
    button.dataset.font = key;
    button.innerHTML = `<span class="nt-font-sample" style="font-family:'${family}',system-ui">Aa</span><span>${family}</span>`;
    button.addEventListener("click", () => update({ font: key }));
    fonts.append(button);
  }
  function loadFont(key) {
    if (loadedFonts.has(key)) return;
    loadedFonts.add(key);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${FONTS[key][1]}&display=swap`;
    link.dataset.ntFont = key;
    document.head.append(link);
  }
  // Load the samples once the sheet is first opened, not on every new tab.
  scope.listen(opener, "click", () => Object.keys(FONTS).forEach(loadFont), { once: true });

  // Generic controls
  for (const control of sheet.querySelectorAll("m3e-switch[data-key]")) {
    scope.listen(control, "change", () => update({ [control.dataset.key]: control.checked }));
  }
  for (const control of sheet.querySelectorAll("m3e-segmented-button[data-key]")) {
    scope.listen(control, "change", () => {
      const value = control.value ?? [...control.querySelectorAll("m3e-button-segment")].find((s) => s.checked)?.value;
      if (!value) return;
      if (control.dataset.key === "wallpaper" && value === "image" && !readStorage(WALLPAPER_KEY)) {
        $("nt-wallpaper-file").click();
        apply();
        return;
      }
      update({ [control.dataset.key]: value });
    });
  }
  scope.listen($("nt-name"), "input", () => update({ name: $("nt-name").value.trim() }));

  // Wallpaper
  scope.listen($("nt-wallpaper-pick"), "click", () => $("nt-wallpaper-file").click());
  scope.listen($("nt-wallpaper-file"), "change", async () => {
    const file = $("nt-wallpaper-file").files[0];
    $("nt-wallpaper-file").value = "";
    if (!file) return;
    try {
      const data = await compressImage(file);
      if (!writeStorage(WALLPAPER_KEY, data)) throw new Error("Storage full");
      update({ wallpaper: "image" });
    } catch {
      alert("That image couldn't be used as a wallpaper. Try a smaller one.");
    }
  });
  scope.listen($("nt-wallpaper-dim"), "input", () => update({ wallpaperDim: Number($("nt-wallpaper-dim").value) }));

  // Export / import / reset
  scope.listen($("nt-export"), "click", () => {
    const blob = new Blob([JSON.stringify({ app: "xdan-newtab", version: 1, settings }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "new-tab-settings.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  scope.listen($("nt-import"), "click", () => $("nt-import-file").click());
  scope.listen($("nt-import-file"), "change", async () => {
    const file = $("nt-import-file").files[0];
    $("nt-import-file").value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      settings = sanitise(parsed.settings ?? parsed);
      if (settings.wallpaper === "image" && !readStorage(WALLPAPER_KEY)) settings.wallpaper = "none";
      apply();
      save();
    } catch {
      alert("That file isn't a valid settings export.");
    }
  });
  scope.listen($("nt-reset"), "click", () => {
    if (!confirm("Reset all settings? Your shortcuts are kept.")) return;
    settings = { ...structuredClone(DEFAULTS), shortcuts: settings.shortcuts };
    writeStorage(WALLPAPER_KEY, null);
    apply();
    save();
  });

  // ── Apply settings to the page ───────────────────────────
  function apply() {
    theme.setAttribute("color", settings.color);
    theme.setAttribute("scheme", settings.scheme);
    theme.setAttribute("variant", settings.variant);
    applyPalette();
    if (settings.font !== "outfit") loadFont(settings.font);
    theme.style.setProperty("--nt-font", `"${FONTS[settings.font][0]}"`);
    theme.classList.toggle("nt-still", !playful());
    theme.classList.toggle("nt-analogue-mode", settings.clockStyle === "analogue");

    $("nt-hero").hidden = !settings.showClock && !settings.showGreeting && !settings.showDate;
    $("nt-clock-shape").hidden = !settings.showClock && !settings.showDate;
    $("nt-time").hidden = !settings.showClock;
    $("nt-date").hidden = !settings.showDate;
    $("nt-greeting").hidden = !settings.showGreeting;
    $("nt-shortcut-area").hidden = !settings.showShortcuts;
    $("nt-hand-s").style.display = settings.showSeconds ? "" : "none";

    const wallpaper = settings.wallpaper === "image" ? readStorage(WALLPAPER_KEY) : null;
    $("nt-wallpaper").style.backgroundImage = wallpaper ? `url("${wallpaper}")` : "";
    theme.classList.toggle("nt-has-wallpaper", Boolean(wallpaper));
    theme.style.setProperty("--nt-dim", settings.wallpaperDim / 100);
    $("nt-wallpaper-dim").value = settings.wallpaperDim;
    $("nt-wallpaper-dim").closest("label").hidden = !wallpaper;

    $("nt-engine-label").textContent = ENGINES[settings.engine][0];
    query.placeholder = `Search with ${ENGINES[settings.engine][0]}`;
    mic.hidden = !(settings.voice && SpeechRecognition);
    $("nt-voice-row").hidden = !SpeechRecognition;
    if (!settings.suggestions) closeSuggestions();

    for (const swatch of swatches.querySelectorAll(".nt-swatch[data-color]")) {
      const selected = swatch.dataset.color.toLowerCase() === settings.color.toLowerCase();
      swatch.setAttribute("aria-checked", String(selected));
      swatch.querySelector("m3e-shape").name = selected ? "9-sided-cookie" : "circle";
    }
    const isCustom = !SWATCHES.some((c) => c.toLowerCase() === settings.color.toLowerCase());
    custom.classList.toggle("nt-selected", isCustom);
    custom.style.setProperty("--swatch", settings.color);
    custom.querySelector("m3e-shape").name = isCustom ? "9-sided-cookie" : "circle";
    picker.value = settings.color;

    for (const button of fonts.children) {
      const selected = button.dataset.font === settings.font;
      button.setAttribute("aria-checked", String(selected));
    }
    for (const control of sheet.querySelectorAll("m3e-segmented-button[data-key]")) {
      const current = control.dataset.key === "wallpaper" && !wallpaper ? "none" : settings[control.dataset.key];
      for (const segment of control.querySelectorAll("m3e-button-segment")) segment.checked = segment.value === current;
    }
    for (const control of sheet.querySelectorAll("m3e-switch[data-key]")) control.checked = settings[control.dataset.key];
    if (document.activeElement !== $("nt-name")) $("nt-name").value = settings.name;

    renderShortcuts();
    tickOnce();
  }
  function tickOnce() {
    // Refresh the clock text straight away after a setting changes.
    const now = new Date();
    const options = { hour: "2-digit", minute: "2-digit", hour12: !settings.hour24 };
    if (settings.showSeconds) options.second = "2-digit";
    $("nt-time").textContent = now.toLocaleTimeString(undefined, options);
  }

  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  function applyPalette() {
    const isDark = settings.scheme === "dark" || (settings.scheme === "auto" && darkQuery.matches);
    // Wait for m3e-theme to write its own (tonal-spot) roles, then override them on the element.
    for (const [token, hex] of Object.entries(paletteFor(settings.color, settings.variant, isDark))) theme.style.setProperty(token, hex);
  }
  scope.listen(darkQuery, "change", applyPalette);

  apply();
  tick();
  scope.timeout(breathe, 7000);
  if (!matchMedia("(pointer: coarse)").matches) query.focus({ preventScroll: true });
}

// The page lives for the whole tab, so the scope only needs to register things.
const scope = {
  signal: new AbortController().signal,
  cleanup() {},
  listen(target, type, listener, options) { target?.addEventListener(type, listener, options); },
  timeout(fn, delay) { return setTimeout(fn, delay); },
};

const ready = ["m3e-theme", "m3e-shape", "m3e-switch", "m3e-segmented-button", "m3e-dialog"].map((tag) => customElements.whenDefined(tag));
Promise.all(ready).then(() => {
  mount(scope);
  requestAnimationFrame(() => document.documentElement.classList.add("nt-ready"));
});
