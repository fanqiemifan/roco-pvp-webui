#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs

import eventlet
import socketio
from flask import Flask, abort, jsonify, request, send_file, send_from_directory

DEFAULT_PORT = 9988
APP_DATA_DIRNAME = "LuokePVPWebui"
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_SELECTION_COUNT = 6
DEFAULT_OPACITY = 0.5
DEFAULT_SATURATION = 1.0
DEFAULT_HEALTH_PERCENT = 100
DEFAULT_ENERGY_VALUE = 10
DEFAULT_BEST_OF = 7
SUPPORTED_BEST_OF = {1, 3, 5, 7}


def get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", None) is not None:
        return Path(sys.executable).resolve().parent
    try:
        script_dir = Path(__file__).resolve().parent
        if script_dir.name == "backend":
            return script_dir.parent
        return script_dir
    except Exception:
        return Path.cwd()


def get_data_dir() -> Path:
    base = get_base_dir()
    if sys.platform.startswith("win"):
        root = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        if root:
            try:
                data_path = Path(root) / APP_DATA_DIRNAME
                data_path.mkdir(parents=True, exist_ok=True)
                return data_path
            except Exception:
                pass
    try:
        data_dir = base / APP_DATA_DIRNAME
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir
    except Exception:
        return base


BASE_DIR = get_base_dir()
IMG_DIR = BASE_DIR / "img"
JSON_DIR = BASE_DIR / "json"
SPRITES_INDEX_FILE = JSON_DIR / "sprites.json"
DATA_DIR = get_data_dir()
CACHE_DIR = DATA_DIR / "cache"
BACKGROUND_FILE = CACHE_DIR / "background.png"


def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(exist_ok=True)
    IMG_DIR.mkdir(exist_ok=True)
    JSON_DIR.mkdir(exist_ok=True)


def panel_state_path(position: str):
    return CACHE_DIR / f"{position}.json"


def scoreboard_state_path():
    return CACHE_DIR / "scoreboard.json"


def sprite_number_from_filename(filename: str):
    match = re.match(r"^NO\.(\d+)_", filename or "")
    return int(match.group(1)) if match else None


def sprite_variant_from_filename(filename: str):
    match = re.search(r"-(\d+)$", Path(filename).stem if filename else "")
    return int(match.group(1)) if match else 0


def normalize_sprite_record(record, fallback_path: Optional[Path] = None):
    if not isinstance(record, dict):
        return None

    path_value = record.get("path") if isinstance(record.get("path"), str) else ""
    filename = Path(path_value).name if path_value else record.get("filename") or record.get("id")
    if (not isinstance(filename, str) or not filename) and path_value:
        filename = Path(path_value).name
    if not isinstance(filename, str) or not filename:
        return None

    filename = Path(filename).name
    display_name = (
        record.get("displayName")
        or record.get("chineseName")
        or record.get("name")
        or Path(filename).stem
    )
    path_value = f"img/{filename}"
    number = record.get("number") if isinstance(record.get("number"), int) else sprite_number_from_filename(filename)
    aliases = [
        str(alias).strip()
        for alias in (record.get("aliases") or [])
        if isinstance(alias, str) and alias.strip()
    ]
    for alias in [display_name, record.get("chineseName"), record.get("name"), filename, Path(filename).stem]:
        if isinstance(alias, str) and alias.strip() and alias.strip() not in aliases:
            aliases.append(alias.strip())
    if number is not None:
        for alias in [str(number), f"{number:03d}", f"NO.{number:03d}", f"NO.{number:03d}_{display_name}"]:
            if alias not in aliases:
                aliases.append(alias)

    normalized = {
        "id": filename,
        "filename": filename,
        "displayName": str(display_name),
        "name": str(display_name),
        "chineseName": str(display_name),
        "path": str(path_value),
        "aliases": aliases,
        "number": number,
        "variant": record.get("variant") if isinstance(record.get("variant"), int) else sprite_variant_from_filename(filename),
    }
    return normalized


def build_sprite_entry(path: Path):
    name = path.name
    stem = path.stem
    display_name = stem.split("_", 1)[1] if "_" in stem else stem
    return {
        "id": name,
        "filename": name,
        "displayName": display_name,
        "name": display_name,
        "chineseName": display_name,
        "path": f"img/{name}",
        "aliases": [name, stem],
        "number": sprite_number_from_filename(name),
        "variant": sprite_variant_from_filename(name),
    }


def load_sprite_index():
    if not SPRITES_INDEX_FILE.exists():
        return []

    try:
        payload = json.loads(SPRITES_INDEX_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    sprites = payload.get("sprites") if isinstance(payload, dict) else payload
    if not isinstance(sprites, list):
        return []

    normalized = []
    for item in sprites:
        entry = normalize_sprite_record(item)
        if not entry:
            continue
        file_path = (BASE_DIR / entry["path"].lstrip("/")).resolve()
        try:
            file_path.relative_to(BASE_DIR.resolve())
        except ValueError:
            continue
        if file_path.exists() and file_path.is_file():
            normalized.append(entry)
    normalized.sort(key=lambda item: (
        item.get("number") if item.get("number") is not None else 10 ** 9,
        item.get("variant") or 0,
        item.get("filename") or "",
    ))
    return normalized


def list_sprites():
    indexed = load_sprite_index()
    if indexed:
        return indexed

    sprites = []
    if not IMG_DIR.exists():
        return sprites

    for path in sorted(IMG_DIR.iterdir(), key=lambda item: item.name.lower()):
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS:
            sprites.append(build_sprite_entry(path))

    sprites.sort(key=lambda item: (
        item.get("number") if item.get("number") is not None else 10 ** 9,
        item.get("variant") or 0,
        item.get("filename") or "",
    ))
    return sprites


def sprite_lookup():
    lookup = {}
    for entry in list_sprites():
        for key in [
            entry.get("id"),
            entry.get("filename"),
            Path(entry.get("path", "")).name if entry.get("path") else None,
            *(entry.get("aliases") or []),
        ]:
            if isinstance(key, str) and key:
                lookup[Path(key).name] = entry
    return lookup


def normalize_search_name(value):
    if value is None:
        return ""
    text = str(value).strip().lower()
    return "".join(ch for ch in text if not ch.isspace())


def sprite_number_aliases(sprite):
    number = sprite.get("number") if isinstance(sprite.get("number"), int) else None
    if number is None:
        return []
    return [str(number), f"{number:03d}", f"no.{number:03d}", f"no{number:03d}"]


def strip_variant_suffix(value):
    if value is None:
        return ""
    return re.sub(r"[-_](\d+)$", "", str(value).strip())


def sprite_variant_group(sprite):
    if not sprite:
        return ""
    display_name = sprite.get("displayName") or ""
    if display_name:
        return normalize_search_name(strip_variant_suffix(display_name))
    filename = sprite.get("filename") or ""
    stem = Path(filename).stem if filename else ""
    return normalize_search_name(strip_variant_suffix(stem))


def collect_sprite_matches(query: str, sprites=None):
    normalized_query = normalize_search_name(query)
    if not normalized_query:
        return []

    if sprites is None:
        sprites = list_sprites()

    matches = []

    for sprite in sprites:
        display_name = normalize_search_name(sprite.get("displayName"))
        chinese_name = normalize_search_name(sprite.get("chineseName"))
        raw_name = normalize_search_name(sprite.get("name"))
        filename = normalize_search_name(sprite.get("filename"))
        path_name = normalize_search_name(Path(sprite["path"]).name)
        stem_name = normalize_search_name(Path(sprite["path"]).stem)
        number_names = [normalize_search_name(alias) for alias in sprite_number_aliases(sprite)]
        alias_names = [normalize_search_name(alias) for alias in (sprite.get("aliases") or [])]
        exact_names = [display_name, chinese_name, raw_name, filename, path_name, stem_name]
        rank = None
        match_type = None

        if normalized_query in [name for name in exact_names if name]:
            rank = (0, len(display_name), sprite["path"])
            match_type = "exact-name"
        elif normalized_query in number_names:
            rank = (1, sprite.get("variant") or 0, sprite["path"])
            match_type = "exact-number"
        elif normalized_query in alias_names:
            rank = (2, len(normalized_query), sprite["path"])
            match_type = "exact-alias"
        elif normalized_query in path_name:
            rank = (3, len(path_name), sprite["path"])
            match_type = "contains-path"
        elif display_name.startswith(normalized_query):
            rank = (4, len(display_name), sprite["path"])
            match_type = "prefix-display-name"
        elif normalized_query in display_name:
            rank = (5, display_name.index(normalized_query), len(display_name), sprite["path"])
            match_type = "contains-display-name"
        else:
            alias_hit = next((alias for alias in alias_names if normalized_query in alias), None)
            if alias_hit:
                rank = (6, alias_hit.index(normalized_query), len(alias_hit), sprite["path"])
                match_type = "contains-alias"

        if rank is None:
            continue

        matches.append({"sprite": sprite, "rank": rank, "matchType": match_type})

    matches.sort(key=lambda item: item["rank"])
    return matches


def sprite_matches_keyword(sprite, keyword):
    normalized_keyword = normalize_search_name(keyword)
    if not normalized_keyword:
        return True
    return bool(collect_sprite_matches(normalized_keyword, sprites=[sprite]))


def build_quick_fill_candidates(query: str, best_match, sprites=None, ranked_matches=None):
    if not best_match:
        return []

    if sprites is None:
        sprites = list_sprites()
    if ranked_matches is None:
        ranked_matches = collect_sprite_matches(query, sprites=sprites)

    variant_group = sprite_variant_group(best_match["sprite"])
    if not variant_group:
        return [best_match["sprite"]]

    family = [sprite for sprite in sprites if sprite_variant_group(sprite) == variant_group]
    if len(family) <= 1:
        return [best_match["sprite"]]

    ranked_lookup = {item["sprite"]["path"]: item["rank"] for item in ranked_matches}
    best_id = best_match["sprite"]["path"]
    normalized_query = normalize_search_name(query)

    def family_sort_key(sprite):
        sprite_id = sprite["path"]
        if sprite_id == best_id:
            return (0, ranked_lookup.get(sprite_id, (0,)), sprite["path"])
        if sprite_id in ranked_lookup:
            return (1, ranked_lookup[sprite_id], sprite["path"])

        display_name = normalize_search_name(sprite["displayName"])
        stem_name = normalize_search_name(Path(sprite["path"]).stem)
        query_related = normalized_query and (
            normalized_query in display_name
            or normalized_query in stem_name
            or normalized_query in variant_group
        )
        return (2 if query_related else 3, sprite["path"])

    return sorted(family, key=family_sort_key)


def build_quick_fill_preview(text):
    if not isinstance(text, str):
        raise ValueError("text must be a string")

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    accepted_lines = lines[:MAX_SELECTION_COUNT]
    ignored_count = max(0, len(lines) - MAX_SELECTION_COUNT)
    sprites = list_sprites()
    matches = []

    for index, raw_name in enumerate(accepted_lines):
        ranked_matches = collect_sprite_matches(raw_name, sprites=sprites)
        matched = ranked_matches[0] if ranked_matches else None
        if matched:
            matches.append(
                {
                    "slot": index,
                    "input": raw_name,
                    "matched": True,
                    "matchType": matched["matchType"],
                    "sprite": matched["sprite"],
                    "candidates": build_quick_fill_candidates(
                        raw_name,
                        matched,
                        sprites=sprites,
                        ranked_matches=ranked_matches,
                    ),
                }
            )
        else:
            matches.append(
                {
                    "slot": index,
                    "input": raw_name,
                    "matched": False,
                    "matchType": None,
                    "sprite": None,
                    "candidates": [],
                }
            )

    return {
        "matches": matches,
        "acceptedCount": len(accepted_lines),
        "matchedCount": len([item for item in matches if item["matched"]]),
        "ignoredCount": ignored_count,
        "unmatched": [item["input"] for item in matches if not item["matched"]],
    }


def normalize_opacity(value):
    try:
        opacity = float(value)
    except (TypeError, ValueError):
        opacity = DEFAULT_OPACITY
    return min(1, max(0, opacity))


def normalize_saturation(value):
    try:
        saturation = float(value)
    except (TypeError, ValueError):
        saturation = DEFAULT_SATURATION
    return min(3, max(0, saturation))


def normalize_health_percent(value):
    try:
        health = int(value)
    except (TypeError, ValueError):
        health = DEFAULT_HEALTH_PERCENT
    return min(100, max(0, health))


def normalize_energy_value(value):
    try:
        energy = int(value)
    except (TypeError, ValueError):
        energy = DEFAULT_ENERGY_VALUE
    return min(10, max(0, energy))


def default_slot(index: int):
    return {
        "slot": index,
        "sprite": None,
        "opacityEnabled": False,
        "opacity": DEFAULT_OPACITY,
        "effectiveOpacity": 1,
        "saturation": DEFAULT_SATURATION,
        "healthEnabled": True,
        "healthPercent": DEFAULT_HEALTH_PERCENT,
        "energyValue": DEFAULT_ENERGY_VALUE,
    }


def default_panel_state(position: str):
    return {
        "position": position,
        "count": 0,
        "selected": [default_slot(index) for index in range(MAX_SELECTION_COUNT)],
        "mtime": None,
    }


def default_scoreboard_state():
    return {
        "leftName": "",
        "leftScore": "0",
        "rightName": "",
        "rightScore": "0",
        "bestOf": DEFAULT_BEST_OF,
        "scoreboardEnabled": True,
        "healthBadgeEnabled": True,
        "abilityBadgeEnabled": True,
        "eventTitle": "S2洛克联赛",
        "eventTitleEnabled": True,
        "nameFontSize": 64,
        "scoreFontSize": 64,
        "centerAreaEnabled": True,
        "centerAreaColor": "#393939",
        "mtime": None,
    }


def normalize_scoreboard_text(value, max_length=32):
    if value is None:
        return ""
    text = str(value).strip()
    return text[:max_length]


def normalize_scoreboard_score(value, max_length=4):
    if value is None:
        return "0"
    text = str(value).strip()
    if not text:
        return "0"
    return text[:max_length]


def normalize_best_of(value):
    try:
        best_of = int(value)
    except (TypeError, ValueError):
        best_of = DEFAULT_BEST_OF
    return best_of if best_of in SUPPORTED_BEST_OF else DEFAULT_BEST_OF


def normalize_font_size(value, default=64, minimum=12, maximum=160):
    try:
        size = int(value)
    except (TypeError, ValueError):
        size = default
    return min(maximum, max(minimum, size))


def normalize_bool(value, default=True):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return default


def normalize_hex_color(value, default="#393939"):
    if not isinstance(value, str):
        return default
    text = value.strip()
    if len(text) == 7 and text.startswith("#"):
        try:
            int(text[1:], 16)
            return text.upper()
        except ValueError:
            return default
    return default


def hydrate_selected(raw_selected):
    lookup = sprite_lookup()
    hydrated = []

    for index, item in enumerate(raw_selected[:MAX_SELECTION_COUNT]):
        slot = default_slot(index)

        if item is None:
            hydrated.append(slot)
            continue

        if isinstance(item, dict) and "sprite" in item:
            raw_sprite = item.get("sprite")
            sprite_id = raw_sprite.get("id") if isinstance(raw_sprite, dict) else raw_sprite
            slot["opacityEnabled"] = bool(item.get("opacityEnabled", False))
            slot["opacity"] = normalize_opacity(item.get("opacity", DEFAULT_OPACITY))
            slot["saturation"] = normalize_saturation(item.get("saturation", DEFAULT_SATURATION))
            if "healthEnabled" in item:
                slot["healthEnabled"] = bool(item.get("healthEnabled", False))
            elif "protectionEnabled" in item:
                slot["healthEnabled"] = bool(item.get("protectionEnabled", False))
            else:
                slot["healthEnabled"] = not slot["opacityEnabled"]
            slot["healthPercent"] = normalize_health_percent(
                item.get("healthPercent", item.get("protectionPercent", DEFAULT_HEALTH_PERCENT))
            )
            slot["energyValue"] = normalize_energy_value(item.get("energyValue", DEFAULT_ENERGY_VALUE))
        else:
            sprite_id = item.get("id") if isinstance(item, dict) else item

        if isinstance(sprite_id, str):
            sprite_id = Path(sprite_id).name
            if sprite_id in lookup:
                slot["sprite"] = lookup[sprite_id]

        slot["effectiveOpacity"] = slot["opacity"] if slot["opacityEnabled"] else 1
        hydrated.append(slot)

    while len(hydrated) < MAX_SELECTION_COUNT:
        hydrated.append(default_slot(len(hydrated)))

    return hydrated


def get_panel_state(position: str):
    state = default_panel_state(position)
    path = panel_state_path(position)

    if not path.exists():
        return state

    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return state

    selected = hydrate_selected(metadata.get("selected", []))
    state.update(
        {
            "count": len([item for item in selected if item["sprite"]]),
            "selected": selected,
            "mtime": path.stat().st_mtime,
        }
    )
    return state


def get_scoreboard_state():
    state = default_scoreboard_state()
    path = scoreboard_state_path()

    if not path.exists():
        return state

    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return state

    state.update(
        {
            "leftName": normalize_scoreboard_text(metadata.get("leftName", "")),
            "leftScore": normalize_scoreboard_score(metadata.get("leftScore", "0")),
            "rightName": normalize_scoreboard_text(metadata.get("rightName", "")),
            "rightScore": normalize_scoreboard_score(metadata.get("rightScore", "0")),
            "bestOf": normalize_best_of(metadata.get("bestOf", DEFAULT_BEST_OF)),
            "scoreboardEnabled": normalize_bool(metadata.get("scoreboardEnabled", True), default=True),
            "healthBadgeEnabled": normalize_bool(metadata.get("healthBadgeEnabled", True), default=True),
            "abilityBadgeEnabled": normalize_bool(metadata.get("abilityBadgeEnabled", True), default=True),
            "eventTitle": normalize_scoreboard_text(metadata.get("eventTitle", "S2洛克联赛"), max_length=40),
            "eventTitleEnabled": normalize_bool(metadata.get("eventTitleEnabled", True), default=True),
            "nameFontSize": normalize_font_size(metadata.get("nameFontSize", 64), default=64),
            "scoreFontSize": normalize_font_size(metadata.get("scoreFontSize", 64), default=64),
            "centerAreaEnabled": normalize_bool(metadata.get("centerAreaEnabled", True), default=True),
            "centerAreaColor": normalize_hex_color(metadata.get("centerAreaColor", "#393939"), default="#393939"),
            "mtime": path.stat().st_mtime,
        }
    )
    return state


def background_state():
    if BACKGROUND_FILE.exists():
        stat = BACKGROUND_FILE.stat()
        return {
            "exists": True,
            "path": "cache/background.png",
            "size": stat.st_size,
            "mtime": stat.st_mtime,
        }
    return {"exists": False}


def save_scoreboard_state(payload):
    if not isinstance(payload, dict):
        raise ValueError("scoreboard payload must be an object")

    metadata = {
        "leftName": normalize_scoreboard_text(payload.get("leftName", "")),
        "leftScore": normalize_scoreboard_score(payload.get("leftScore", "0")),
        "rightName": normalize_scoreboard_text(payload.get("rightName", "")),
        "rightScore": normalize_scoreboard_score(payload.get("rightScore", "0")),
        "bestOf": normalize_best_of(payload.get("bestOf", DEFAULT_BEST_OF)),
        "scoreboardEnabled": normalize_bool(payload.get("scoreboardEnabled", True), default=True),
        "healthBadgeEnabled": normalize_bool(payload.get("healthBadgeEnabled", True), default=True),
        "abilityBadgeEnabled": normalize_bool(payload.get("abilityBadgeEnabled", True), default=True),
        "eventTitle": normalize_scoreboard_text(payload.get("eventTitle", "S2洛克联赛"), max_length=40),
        "eventTitleEnabled": normalize_bool(payload.get("eventTitleEnabled", True), default=True),
        "nameFontSize": normalize_font_size(payload.get("nameFontSize", 64), default=64),
        "scoreFontSize": normalize_font_size(payload.get("scoreFontSize", 64), default=64),
        "centerAreaEnabled": normalize_bool(payload.get("centerAreaEnabled", True), default=True),
        "centerAreaColor": normalize_hex_color(payload.get("centerAreaColor", "#393939"), default="#393939"),
    }

    scoreboard_state_path().write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return get_scoreboard_state()


def save_scoreboard_best_of(payload):
    if not isinstance(payload, dict):
        raise ValueError("best-of payload must be an object")
    state = get_scoreboard_state()
    state["bestOf"] = normalize_best_of(payload.get("bestOf", DEFAULT_BEST_OF))
    return save_scoreboard_state(state)


def save_panel_state(position: str, selected_slots):
    if position not in {"left", "right"}:
        raise ValueError("Invalid position")
    if not isinstance(selected_slots, list):
        raise ValueError("selected must be a list")
    if len(selected_slots) > MAX_SELECTION_COUNT:
        raise ValueError("Too many slots provided")

    lookup = sprite_lookup()
    selected = []

    for index, item in enumerate(selected_slots[:MAX_SELECTION_COUNT]):
        slot = default_slot(index)

        if item is None:
            selected.append(slot)
            continue

        if not isinstance(item, dict):
            raise ValueError("slot must be an object or null")

        raw_sprite = item.get("sprite")
        sprite_id = raw_sprite.get("id") if isinstance(raw_sprite, dict) else raw_sprite
        slot["opacityEnabled"] = bool(item.get("opacityEnabled", False))
        slot["opacity"] = normalize_opacity(item.get("opacity", DEFAULT_OPACITY))
        slot["saturation"] = normalize_saturation(item.get("saturation", DEFAULT_SATURATION))
        if "healthEnabled" in item:
            slot["healthEnabled"] = bool(item.get("healthEnabled", False))
        else:
            slot["healthEnabled"] = bool(item.get("protectionEnabled", False))
        slot["healthPercent"] = normalize_health_percent(
            item.get("healthPercent", item.get("protectionPercent", DEFAULT_HEALTH_PERCENT))
        )
        slot["energyValue"] = normalize_energy_value(item.get("energyValue", DEFAULT_ENERGY_VALUE))

        if sprite_id is not None:
            if not isinstance(sprite_id, str):
                raise ValueError("sprite id must be a string or null")
            normalized_name = Path(sprite_id).name
            if normalized_name not in lookup:
                raise FileNotFoundError(f"Sprite not found: {normalized_name}")
            slot["sprite"] = lookup[normalized_name]

        slot["effectiveOpacity"] = slot["opacity"] if slot["opacityEnabled"] else 1
        selected.append(slot)

    while len(selected) < MAX_SELECTION_COUNT:
        selected.append(default_slot(len(selected)))

    metadata = {
        "position": position,
        "selected": [
            {
                "slot": slot["slot"],
                "sprite": slot["sprite"],
                "opacityEnabled": slot["opacityEnabled"],
                "opacity": slot["opacity"],
                "saturation": slot["saturation"],
                "healthEnabled": slot["healthEnabled"],
                "healthPercent": slot["healthPercent"],
                "energyValue": slot["energyValue"],
            }
            for slot in selected
        ],
    }
    panel_state_path(position).write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return get_panel_state(position)


def clear_panel_state(position: str):
    path = panel_state_path(position)
    if path.exists():
        path.unlink()

    legacy_png = CACHE_DIR / f"{position}.png"
    if legacy_png.exists():
        legacy_png.unlink()


def safe_send_from_base(path: str):
    normalized = Path(path)
    file_path = (BASE_DIR / normalized).resolve()
    try:
        file_path.relative_to(BASE_DIR.resolve())
    except ValueError:
        abort(404)
    if not file_path.exists() or not file_path.is_file():
        abort(404)
    return send_from_directory(BASE_DIR, str(normalized))


def emit_panel_update(position: str):
    sio.emit("panel:update", {"panel": get_panel_state(position)})


def emit_scoreboard_update():
    sio.emit("scoreboard:update", {"scoreboard": get_scoreboard_state()})


def emit_background_update():
    sio.emit("background:update", {"background": background_state()})


def snapshot_payload():
    return {
        "panels": [get_panel_state("left"), get_panel_state("right")],
        "scoreboard": get_scoreboard_state(),
        "background": background_state(),
    }


app = Flask(__name__)
sio = socketio.Server(async_mode="eventlet", cors_allowed_origins="*")
application = socketio.WSGIApp(sio, app)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,DELETE,OPTIONS"
    return response


@app.route("/", methods=["GET"])
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/cache/background.png", methods=["GET"])
def background_image():
    if not BACKGROUND_FILE.exists():
        abort(404)
    return send_file(BACKGROUND_FILE)


@app.route("/api/images", methods=["GET"])
def api_images():
    return jsonify({"images": [get_panel_state("left"), get_panel_state("right")]})


@app.route("/api/background", methods=["GET"])
def api_background():
    return jsonify(background_state())


@app.route("/api/scoreboard", methods=["GET"])
def api_scoreboard():
    return jsonify(get_scoreboard_state())


@app.route("/api/sprites", methods=["GET"])
def api_sprites():
    keyword = parse_qs(request.query_string.decode("utf-8")).get("q", [""])[0].strip()
    sprites = list_sprites()
    if keyword:
        sprites = [sprite for sprite in sprites if sprite_matches_keyword(sprite, keyword)]
    return jsonify({"sprites": sprites, "count": len(sprites)})


@app.route("/api/panels/<position>", methods=["POST", "DELETE"])
def api_panel(position):
    if position not in {"left", "right"}:
        return jsonify({"success": False, "error": "Invalid position"}), 404

    if request.method == "DELETE":
        try:
            clear_panel_state(position)
            state = get_panel_state(position)
            emit_panel_update(position)
            return jsonify({"success": True, "position": position, "panel": state})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 500

    try:
        payload = request.get_json(silent=False) or {}
        state = save_panel_state(position, payload.get("selected", []))
        emit_panel_update(position)
        return jsonify({"success": True, "panel": state})
    except FileNotFoundError as exc:
        return jsonify({"success": False, "error": str(exc)}), 404
    except (ValueError, TypeError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/upload/background", methods=["POST"])
def api_upload_background():
    try:
        upload = request.files.get("file")
        if upload is None or not upload.filename:
            raise ValueError("No file data")
        upload.save(BACKGROUND_FILE)
        payload = background_state()
        emit_background_update()
        return jsonify({"success": True, **payload})
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/scoreboard", methods=["POST"])
def api_save_scoreboard():
    try:
        payload = request.get_json(silent=False) or {}
        state = save_scoreboard_state(payload)
        emit_scoreboard_update()
        return jsonify({"success": True, "scoreboard": state})
    except (ValueError, TypeError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/scoreboard/best-of", methods=["POST"])
def api_save_scoreboard_best_of():
    try:
        payload = request.get_json(silent=False) or {}
        state = save_scoreboard_best_of(payload)
        emit_scoreboard_update()
        return jsonify({"success": True, "scoreboard": state})
    except (ValueError, TypeError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/quick-fill", methods=["POST"])
def api_quick_fill():
    try:
        payload = request.get_json(silent=False) or {}
        preview = build_quick_fill_preview(payload.get("text", ""))
        return jsonify({"success": True, **preview})
    except (ValueError, TypeError) as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/api/delete/background", methods=["DELETE"])
def api_delete_background():
    try:
        if BACKGROUND_FILE.exists():
            BACKGROUND_FILE.unlink()
        emit_background_update()
        return jsonify({"success": True, "position": "background", "background": background_state()})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/<path:filename>", methods=["GET"])
def static_files(filename):
    return safe_send_from_base(filename)


@sio.event
def connect(sid, environ, auth):
    sio.emit("snapshot", snapshot_payload(), to=sid)


class SocketIOServer:
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, host: str, port: int):
        ensure_dirs()
        self.host = host
        self.port = port
        self._listener = eventlet.listen((host, port))

    def serve_forever(self):
        eventlet.wsgi.server(self._listener, application, log_output=False)

    def shutdown(self):
        if self._listener is not None:
            try:
                self._listener.close()
            except Exception:
                pass
            self._listener = None

    def server_close(self):
        self.shutdown()


def create_server(port: int = DEFAULT_PORT, host: str = "127.0.0.1"):
    return SocketIOServer(host=host, port=port)


def print_startup_info(host: str, port: int):
    display_host = "localhost" if host in {"127.0.0.1", "0.0.0.0"} else host
    print("洛克王国PVP直播推流浏览器已启动")
    print(f"主页面: http://{display_host}:{port}")
    print(f"管理后台: http://{display_host}:{port}/admin.html")
    print(f"服务目录: {BASE_DIR}")
    print(f"精灵目录: {IMG_DIR}")
    print(f"精灵索引: {SPRITES_INDEX_FILE}")
    print(f"缓存目录: {CACHE_DIR}")
    print(f"数据目录: {DATA_DIR}")
    print("按 Ctrl+C 停止服务器")


def serve(port: int = DEFAULT_PORT, host: str = "127.0.0.1"):
    os.chdir(BASE_DIR)
    try:
        httpd = create_server(port=port, host=host)
        print_startup_info(host=host, port=port)
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
        return 0
    except OSError as exc:
        if exc.errno == 48:
            print(f"端口 {port} 已被占用，请尝试其他端口")
        else:
            print(f"启动服务器时发生错误: {exc}")
        return 1
    return 0


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="洛克王国PVP WebUI 本地服务")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，默认 127.0.0.1")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="监听端口，默认 9988")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    return serve(port=args.port, host=args.host)


if __name__ == "__main__":
    sys.exit(main())
