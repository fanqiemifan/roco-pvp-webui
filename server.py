#!/usr/bin/env python3
import argparse
import http.server
import json
import os
import re
import socketserver
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

DEFAULT_PORT = 9988
APP_DATA_DIRNAME = "LuokePVPWebui"
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_SELECTION_COUNT = 6
DEFAULT_OPACITY = 0.5
DEFAULT_SATURATION = 1.0
DEFAULT_HEALTH_PERCENT = 100
DEFAULT_ENERGY_VALUE = 10


def get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", None) is not None:
        return Path(sys.executable).resolve().parent
    try:
        return Path(__file__).resolve().parent
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
DATA_DIR = get_data_dir()
CACHE_DIR = DATA_DIR / "cache"
BACKGROUND_FILE = CACHE_DIR / "background.png"

# 确保必要的目录存在（静默处理，允许后续延迟创建）
try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass
try:
    CACHE_DIR.mkdir(exist_ok=True)
except Exception:
    pass
try:
    IMG_DIR.mkdir(exist_ok=True)
except Exception:
    pass


def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(exist_ok=True)
    IMG_DIR.mkdir(exist_ok=True)


def panel_state_path(position: str):
    return CACHE_DIR / f"{position}.json"


def scoreboard_state_path():
    return CACHE_DIR / "scoreboard.json"


def build_sprite_entry(path: Path):
    name = path.name
    stem = path.stem
    display_name = stem.split("_", 1)[1] if "_" in stem else stem
    return {
        "id": name,
        "filename": name,
        "displayName": display_name,
        "path": f"/img/{name}",
    }


def list_sprites():
    sprites = []
    for path in sorted(IMG_DIR.iterdir(), key=lambda item: item.name.lower()):
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS:
            sprites.append(build_sprite_entry(path))
    return sprites


def sprite_lookup():
    return {entry["filename"]: entry for entry in list_sprites()}


def normalize_search_name(value):
    if value is None:
        return ""
    text = str(value).strip().lower()
    return "".join(ch for ch in text if not ch.isspace())


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
        display_name = normalize_search_name(sprite["displayName"])
        stem_name = normalize_search_name(Path(sprite["filename"]).stem)
        file_name = normalize_search_name(sprite["filename"])
        rank = None
        match_type = None

        if normalized_query == display_name:
            rank = (0, len(display_name), sprite["filename"])
            match_type = "exact-display-name"
        elif normalized_query == stem_name:
            rank = (1, len(stem_name), sprite["filename"])
            match_type = "exact-stem"
        elif normalized_query == file_name:
            rank = (2, len(file_name), sprite["filename"])
            match_type = "exact-filename"
        elif display_name.startswith(normalized_query):
            rank = (3, len(display_name), sprite["filename"])
            match_type = "prefix-display-name"
        elif stem_name.startswith(normalized_query):
            rank = (4, len(stem_name), sprite["filename"])
            match_type = "prefix-stem"
        elif normalized_query in display_name:
            rank = (5, display_name.index(normalized_query), len(display_name), sprite["filename"])
            match_type = "contains-display-name"
        elif normalized_query in stem_name:
            rank = (6, stem_name.index(normalized_query), len(stem_name), sprite["filename"])
            match_type = "contains-stem"
        elif normalized_query in file_name:
            rank = (7, file_name.index(normalized_query), len(file_name), sprite["filename"])
            match_type = "contains-filename"

        if rank is None:
            continue

        matches.append({"sprite": sprite, "rank": rank, "matchType": match_type})

    matches.sort(key=lambda item: item["rank"])
    return matches


def match_sprite_query(query: str, sprites=None):
    matches = collect_sprite_matches(query, sprites=sprites)
    return matches[0] if matches else None


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

    ranked_lookup = {item["sprite"]["id"]: item["rank"] for item in ranked_matches}
    best_id = best_match["sprite"]["id"]
    normalized_query = normalize_search_name(query)

    def family_sort_key(sprite):
        sprite_id = sprite["id"]
        if sprite_id == best_id:
            return (0, ranked_lookup.get(sprite_id, (0,)), sprite["filename"])
        if sprite_id in ranked_lookup:
            return (1, ranked_lookup[sprite_id], sprite["filename"])

        display_name = normalize_search_name(sprite["displayName"])
        stem_name = normalize_search_name(Path(sprite["filename"]).stem)
        query_related = normalized_query and (
            normalized_query in display_name
            or normalized_query in stem_name
            or normalized_query in variant_group
        )
        return (2 if query_related else 3, sprite["filename"])

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
        "scoreboardEnabled": True,
        "healthBadgeEnabled": True,
        "abilityBadgeEnabled": True,
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
            slot["opacityEnabled"] = False
            slot["opacity"] = DEFAULT_OPACITY
            slot["saturation"] = DEFAULT_SATURATION
            slot["healthEnabled"] = True
            slot["healthPercent"] = DEFAULT_HEALTH_PERCENT
            slot["energyValue"] = DEFAULT_ENERGY_VALUE

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
            "scoreboardEnabled": normalize_bool(metadata.get("scoreboardEnabled", True), default=True),
            "healthBadgeEnabled": normalize_bool(metadata.get("healthBadgeEnabled", True), default=True),
            "abilityBadgeEnabled": normalize_bool(metadata.get("abilityBadgeEnabled", True), default=True),
            "nameFontSize": normalize_font_size(metadata.get("nameFontSize", 64), default=64),
            "scoreFontSize": normalize_font_size(metadata.get("scoreFontSize", 64), default=64),
            "centerAreaEnabled": normalize_bool(metadata.get("centerAreaEnabled", True), default=True),
            "centerAreaColor": normalize_hex_color(metadata.get("centerAreaColor", "#393939"), default="#393939"),
            "mtime": path.stat().st_mtime,
        }
    )
    return state


def save_scoreboard_state(payload):
    if not isinstance(payload, dict):
        raise ValueError("scoreboard payload must be an object")

    metadata = {
        "leftName": normalize_scoreboard_text(payload.get("leftName", "")),
        "leftScore": normalize_scoreboard_score(payload.get("leftScore", "0")),
        "rightName": normalize_scoreboard_text(payload.get("rightName", "")),
        "rightScore": normalize_scoreboard_score(payload.get("rightScore", "0")),
        "scoreboardEnabled": normalize_bool(payload.get("scoreboardEnabled", True), default=True),
        "healthBadgeEnabled": normalize_bool(payload.get("healthBadgeEnabled", True), default=True),
        "abilityBadgeEnabled": normalize_bool(payload.get("abilityBadgeEnabled", True), default=True),
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


class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def _send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length else b"{}"
        if not body:
            return {}
        return json.loads(body.decode("utf-8"))

    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path == "/cache/background.png":
            self.serve_file(BACKGROUND_FILE)
            return

        if path == "/api/images":
            self._send_json({"images": [get_panel_state("left"), get_panel_state("right")]})
            return

        if path == "/api/background":
            if BACKGROUND_FILE.exists():
                stat = BACKGROUND_FILE.stat()
                response = {
                    "exists": True,
                    "path": "/cache/background.png",
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                }
            else:
                response = {"exists": False}
            self._send_json(response)
            return

        if path == "/api/scoreboard":
            self._send_json(get_scoreboard_state())
            return

        if path == "/api/sprites":
            query = parse_qs(parsed_path.query)
            keyword = query.get("q", [""])[0].strip().lower()
            sprites = list_sprites()
            if keyword:
                sprites = [
                    sprite
                    for sprite in sprites
                    if keyword in sprite["displayName"].lower()
                    or keyword in sprite["filename"].lower()
                ]
            self._send_json({"sprites": sprites, "count": len(sprites)})
            return

        super().do_GET()

    def serve_file(self, file_path: Path):
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "Not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(file_path)))
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.end_headers()
        with file_path.open("rb") as fh:
            self.copyfile(fh, self.wfile)

    def do_POST(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path in {"/api/panels/left", "/api/panels/right"}:
            position = path.rsplit("/", 1)[-1]
            try:
                payload = self._read_json_body()
                state = save_panel_state(position, payload.get("selected", []))
                self._send_json({"success": True, "panel": state})
            except FileNotFoundError as exc:
                self._send_json({"success": False, "error": str(exc)}, status=404)
            except (ValueError, json.JSONDecodeError) as exc:
                self._send_json({"success": False, "error": str(exc)}, status=400)
            except Exception as exc:
                self._send_json({"success": False, "error": str(exc)}, status=500)
            return

        if path == "/api/upload/background":
            content_type = self.headers.get("Content-Type", "")
            if "boundary=" not in content_type:
                self._send_json({"success": False, "error": "Missing multipart boundary"}, status=400)
                return
            boundary = content_type.split("boundary=", 1)[1]
            content_length = int(self.headers.get("Content-Length", "0"))
            try:
                body = self.rfile.read(content_length)
                parts = body.split(b"--" + boundary.encode())
                file_data = None
                for part in parts:
                    if b"Content-Disposition" not in part:
                        continue
                    idx = part.find(b"\r\n\r\n")
                    if idx == -1:
                        continue
                    file_data = part[idx + 4 : -4]
                    break
                if not file_data:
                    raise ValueError("No file data")
                BACKGROUND_FILE.write_bytes(file_data)
                stat = BACKGROUND_FILE.stat()
                self._send_json(
                    {
                        "success": True,
                        "path": "/cache/background.png",
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                    }
                )
            except ValueError as exc:
                self._send_json({"success": False, "error": str(exc)}, status=400)
            except Exception as exc:
                self._send_json({"success": False, "error": str(exc)}, status=500)
            return

        if path == "/api/scoreboard":
            try:
                payload = self._read_json_body()
                state = save_scoreboard_state(payload)
                self._send_json({"success": True, "scoreboard": state})
            except (ValueError, json.JSONDecodeError) as exc:
                self._send_json({"success": False, "error": str(exc)}, status=400)
            except Exception as exc:
                self._send_json({"success": False, "error": str(exc)}, status=500)
            return

        if path == "/api/quick-fill":
            try:
                payload = self._read_json_body()
                preview = build_quick_fill_preview(payload.get("text", ""))
                self._send_json({"success": True, **preview})
            except (ValueError, json.JSONDecodeError) as exc:
                self._send_json({"success": False, "error": str(exc)}, status=400)
            except Exception as exc:
                self._send_json({"success": False, "error": str(exc)}, status=500)
            return

        self.send_error(404, "Not found")

    def do_DELETE(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path in {"/api/panels/left", "/api/panels/right"}:
            position = path.rsplit("/", 1)[-1]
            try:
                clear_panel_state(position)
                self._send_json({"success": True, "position": position})
            except Exception as exc:
                self._send_json({"success": False, "error": str(exc)}, status=500)
            return

        if path == "/api/delete/background":
            try:
                if BACKGROUND_FILE.exists():
                    BACKGROUND_FILE.unlink()
                self._send_json({"success": True, "position": "background"})
            except Exception as exc:
                self._send_json({"success": False, "error": str(exc)}, status=500)
            return

        self.send_error(404, "Not found")

    def log_message(self, format, *args):
        pass


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def create_server(port: int = DEFAULT_PORT, host: str = "127.0.0.1"):
    ensure_dirs()
    return ThreadingTCPServer((host, port), AppRequestHandler)


def print_startup_info(host: str, port: int):
    display_host = "localhost" if host in {"127.0.0.1", "0.0.0.0"} else host
    print("洛克王国PVP直播推流浏览器已启动")
    print(f"主页面: http://{display_host}:{port}")
    print(f"管理后台: http://{display_host}:{port}/admin.html")
    print(f"服务目录: {BASE_DIR}")
    print(f"精灵目录: {IMG_DIR}")
    print(f"缓存目录: {CACHE_DIR}")
    print(f"数据目录: {DATA_DIR}")
    print("按 Ctrl+C 停止服务器")


def serve(port: int = DEFAULT_PORT, host: str = "127.0.0.1"):
    os.chdir(BASE_DIR)
    try:
        with create_server(port=port, host=host) as httpd:
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
