"""
一次性把 Wiki 精灵全量数据拉到本地。
需要key 使用ai调用运行时找我要key
调用 Rocom 后端的 `GET /api/v1/games/rocom/wiki/pets` 分页接口,
会同时落盘两份 JSON:

  1. **原始版** (默认 ``data/pets_raw.json``)
     直接保存后端 items[] 原貌 (按 pet_id 升序),不做任何字段处理,
     方便后续排查字段差异。

  2. **简化版** (默认 ``data/pets.json``)
     对原始数据二次加工: 按 ``handbook_no`` 升序,
     只保留以下字段:
       pet_id, asset_id, name, form,
       handbook_no, stage, element_id, elements,
       official_icon, official_small_icon,
       icon_url, image_url, _raw, season_id

用法:
    python tools/dump_pet_ids.py
    python tools/dump_pet_ids.py --api-key YOUR_KEY --page-size 100
    python tools/dump_pet_ids.py --raw-output data/pets_raw.json --output data/pets.json
    python tools/dump_pet_ids.py --only-simplified   # 只跑简化版
    python tools/dump_pet_ids.py --only-raw          # 只跑原始版

依赖:
    pip install httpx
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx


DEFAULT_BASE_URL = "https://wegame.shallow.ink"
DEFAULT_API_PATH = "/api/v1/games/rocom/wiki/pets"
DEFAULT_OUTPUT = "data/pets.json"             # 简化版
DEFAULT_RAW_OUTPUT = "data/pets_raw.json"     # 原始版
DEFAULT_PAGE_SIZE = 100
DEFAULT_TIMEOUT = 15.0
DEFAULT_MAX_PAGES = 200  # 安全网,防止翻页死循环

CDN_BASE = "https://game.gtimg.cn/images/rocom/rocodata/jingling"

# 简化版保留的字段(按 handbook_no 排序后的输出顺序)
SIMPLIFIED_KEEP_FIELDS = [
    "pet_id",
    "asset_id",
    "name",
    "form",
    "handbook_no",
    "stage",
    "element_id",
    "elements",
    "official_icon",
    "official_small_icon",
    "icon_url",
    "image_url",
    "_raw",
    "season_id",
]


def _handbook_sort_key(item: Dict[str, Any]):
    """handbook_no 排序键:
    - 缺失 (None / 空字符串) -> 排最后
    - 整数或纯数字字符串   -> 数值升序
    - 其他字符串          -> 字典序
    """
    hb = item.get("handbook_no")
    if hb in (None, ""):
        return (1, 0, "")
    if isinstance(hb, int) and not isinstance(hb, bool):
        return (0, hb, "")
    s = str(hb).strip()
    if s.isdigit():
        return (0, int(s), "")
    return (0, 1 << 30, s)


def _pick_fields(item: Dict[str, Any], fields: List[str]) -> Dict[str, Any]:
    """从规范化条目里挑出指定字段,缺失补 None。"""
    out: Dict[str, Any] = {}
    for k in fields:
        v = item.get(k, None)
        if v is None and k not in item:
            v = None
        out[k] = v
    return out


def _asset_pet_id(pet_id: Any) -> Optional[int]:
    """与项目 core/egg_service.py / main.py 保持一致的偏移规则:
    pet_id < 3000 时 + 3000, 否则保持不变。"""
    try:
        n = int(str(pet_id).strip())
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return n if n >= 3000 else n + 3000


def _cdn_url(pet_id: Any, image_type: str = "icon") -> str:
    asset_id = _asset_pet_id(pet_id)
    if asset_id is None:
        return ""
    if image_type not in ("icon", "image"):
        image_type = "icon"
    return f"{CDN_BASE}/{asset_id}/{image_type}.png"


def _first(items: Any) -> str:
    """从后端返回的 *_names 数组里取第一个,容错 None / 空数组。"""
    if not items:
        return ""
    if isinstance(items, list):
        for v in items:
            if v not in (None, ""):
                return str(v)
        return ""
    return str(items)


def _list(items: Any) -> List[str]:
    if not items:
        return []
    if not isinstance(items, list):
        return [str(items)]
    return [str(v) for v in items if v not in (None, "")]


def _normalize_item(raw: Dict[str, Any]) -> Dict[str, Any]:
    """从后端 items[...] 里抽出稳定字段并补上 CDN 链接。

    后端真实结构 (来自 657 条实际抓取):
      - pet_id / name / form / rarity  在顶层
      - type_ids / type_names / egg_group_ids / egg_group_names 在顶层(数组)
      - handbook_no / stage / season_id / has_ride_talent / has_shiny /
        icon / small_icon / body_size 在顶层
      - element / element_id 用 type_names[0] / type_ids[0]
      - egg_groups / egg_group_ids 用 egg_group_names / egg_group_ids
    """
    pet_id = raw.get("pet_id") or raw.get("id")
    name = raw.get("name") or ""
    form = raw.get("form") or ""
    asset_id = _asset_pet_id(pet_id)

    # 后端在顶层也直接给了 *_names / *_ids 数组
    type_names = raw.get("type_names") or []
    type_ids = raw.get("type_ids") or []
    egg_group_names = raw.get("egg_group_names") or []
    egg_group_ids = raw.get("egg_group_ids") or []

    return {
        "pet_id": pet_id,
        "asset_id": asset_id,
        "name": name,
        "form": form,
        "rarity": raw.get("rarity") or raw.get("quality") or "",
        "stage": raw.get("stage") or "",
        "handbook_no": raw.get("handbook_no") or "",
        "element": _first(type_names),
        "element_id": _first(type_ids),
        "elements": _list(type_names),
        "element_ids": _list(type_ids),
        "egg_group": _first(egg_group_names),
        "egg_group_id": _first(egg_group_ids),
        "egg_groups": _list(egg_group_names),
        "egg_group_ids_list": _list(egg_group_ids),
        "season_id": raw.get("season_id") or "",
        "has_ride_talent": bool(raw.get("has_ride_talent", False)),
        "has_shiny": bool(raw.get("has_shiny", False)),
        # 后端官方给的图标 URL (另一套 CDN: wegame.shallow.ink)
        "official_icon": raw.get("icon") or "",
        "official_small_icon": raw.get("small_icon") or "",
        # 老 CDN (game.gtimg.cn) 兜底 URL
        "icon_url": _cdn_url(pet_id, "icon"),
        "image_url": _cdn_url(pet_id, "image"),
        # 体型范围,蛋尺寸反查要用
        "body_size": raw.get("body_size") or {},
        # 保留原始数据,方便后续排查字段
        "_raw": {k: v for k, v in raw.items()
                  if k not in (
                      "pet_id", "id", "name", "form",
                      "rarity", "quality", "stage",
                      "handbook_no", "season_id",
                      "type_ids", "type_names",
                      "egg_group_ids", "egg_group_names",
                      "has_ride_talent", "has_shiny",
                      "icon", "small_icon", "body_size",
                  )},
    }


async def fetch_page(
    client: httpx.AsyncClient,
    path: str,
    page_no: int,
    page_size: int,
    q: str = "",
    retries: int = 3,
) -> List[Dict[str, Any]]:
    params = {
        "page_no": page_no,
        "page_size": page_size,
    }
    if q:
        params["q"] = q

    last_err: Optional[str] = None
    for attempt in range(1, retries + 1):
        try:
            resp = await client.get(path, params=params, timeout=DEFAULT_TIMEOUT)
            if resp.status_code != 200:
                last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
                await asyncio.sleep(0.5 * attempt)
                continue
            payload = resp.json()
            if payload.get("code") != 0:
                last_err = f"业务码 {payload.get('code')}: {payload.get('message')}"
                # 业务错误不重试
                return []
            data = payload.get("data") or {}
            items = data.get("items") or []
            return items if isinstance(items, list) else []
        except (httpx.TimeoutException, httpx.RequestError) as e:
            last_err = f"网络异常: {e}"
            await asyncio.sleep(0.5 * attempt)
        except Exception as e:  # JSON 解析等
            last_err = f"解析异常: {e}"
            return []

    print(f"  [!] 第 {page_no} 页失败 ({retries} 次重试): {last_err}", file=sys.stderr)
    return []


async def dump_all_pets(
    base_url: str,
    api_path: str,
    api_key: str,
    page_size: int,
    max_pages: int,
    delay: float,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """翻页拉全量精灵。返回 (normalized_list, raw_items)。

    - normalized_list: 经过 _normalize_item 规范化的列表,带有 _raw 字段
    - raw_items     : 后端 items[] 原貌(去重、按 pet_id 升序)
    """
    headers: Dict[str, str] = {"User-Agent": "astrbot-rocom-dump/1.0"}
    if api_key:
        headers["X-API-Key"] = api_key

    raw_items: List[Dict[str, Any]] = []
    collected: List[Dict[str, Any]] = []
    seen_ids: set[Any] = set()

    async with httpx.AsyncClient(base_url=base_url, headers=headers) as client:
        page = 1
        while page <= max_pages:
            print(f"[*] 拉取第 {page} 页 (page_size={page_size}) ...", flush=True)
            items = await fetch_page(client, api_path, page_no=page, page_size=page_size)
            if not items:
                print(f"[+] 第 {page} 页为空,翻页结束", flush=True)
                break

            new_count = 0
            for raw in items:
                if not isinstance(raw, dict):
                    continue
                pid = raw.get("pet_id") or raw.get("id")
                if pid in seen_ids:
                    continue
                seen_ids.add(pid)
                raw_items.append(raw)
                collected.append(_normalize_item(raw))
                new_count += 1

            print(f"    -> 本页 {len(items)} 条,新增 {new_count} 条,累计 {len(collected)}", flush=True)

            if len(items) < page_size:
                # 最后一页
                break

            page += 1
            if delay > 0:
                await asyncio.sleep(delay)

    # 原始版按 pet_id 数字升序稳定排序
    raw_items.sort(key=lambda x: (
        int(x["pet_id"]) if str(x.get("pet_id", "")).isdigit() else 1 << 30,
        str(x.get("name") or ""),
    ))

    return collected, raw_items


def write_outputs(
    raw_items: List[Dict[str, Any]],
    collected: List[Dict[str, Any]],
    raw_output: Optional[Path],
    simplified_output: Optional[Path],
) -> Dict[str, int]:
    """落盘两份 JSON,返回每个文件写入的条数。"""
    written: Dict[str, int] = {}

    if raw_output is not None:
        raw_output.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "source": "GET /api/v1/games/rocom/wiki/pets",
            "generated_at": int(time.time()),
            "count": len(raw_items),
            "items": raw_items,
        }
        raw_output.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        written[str(raw_output)] = len(raw_items)
        print(f"[✓] 已写入 {raw_output} ({len(raw_items)} 条,原始数据)")

    if simplified_output is not None:
        # 简化版:按 handbook_no 升序,只保留 SIMPLIFIED_KEEP_FIELDS 字段
        simplified = [
            _pick_fields(item, SIMPLIFIED_KEEP_FIELDS)
            for item in collected
        ]
        simplified.sort(key=_handbook_sort_key)

        simplified_output.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 2,
            "updatetime": date.today().isoformat(),
            "source": "GET /api/v1/games/rocom/wiki/pets (simplified)",
            "generated_at": int(time.time()),
            "count": len(simplified),
            "keep_fields": list(SIMPLIFIED_KEEP_FIELDS),
            "sort_by": "handbook_no",
            "items": simplified,
        }
        simplified_output.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        written[str(simplified_output)] = len(simplified)
        print(f"[✓] 已写入 {simplified_output} ({len(simplified)} 条,按 handbook_no 排序)")

    return written


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="从 Rocom Wiki 拉全量精灵,输出原始版 + 简化版两份 JSON")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL, help="API base URL")
    p.add_argument("--api-path", default=DEFAULT_API_PATH, help="wiki/pets 路径")
    p.add_argument("--api-key", default="", help="X-API-Key (与 astrbot 配置里的 wegame_api_key 一致)")

    p.add_argument("--output", default=DEFAULT_OUTPUT,
                   help="简化版 JSON 路径(按 handbook_no 排序,只保留必要字段)")
    p.add_argument("--raw-output", default=DEFAULT_RAW_OUTPUT,
                   help="原始版 JSON 路径(后端 items[] 原貌,按 pet_id 排序)")
    p.add_argument("--no-raw", action="store_true",
                   help="不写原始版 JSON,等价于 --only-simplified")
    p.add_argument("--no-simplified", action="store_true",
                   help="不写简化版 JSON,等价于 --only-raw")
    p.add_argument("--only-raw", action="store_true", help="只写原始版")
    p.add_argument("--only-simplified", action="store_true", help="只写简化版")

    p.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help="每页条数(最大 100)")
    p.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES, help="最大翻页数(安全网)")
    p.add_argument("--delay", type=float, default=0.1, help="每页之间的间隔秒数,避免打挂后端")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.page_size < 1 or args.page_size > 100:
        print("[!] page_size 必须在 [1, 100]", file=sys.stderr)
        return 2

    # 决定写哪几个文件
    write_raw = not (args.no_raw or args.only_simplified)
    write_simplified = not (args.no_simplified or args.only_raw)
    raw_output = Path(args.raw_output) if write_raw else None
    simplified_output = Path(args.output) if write_simplified else None

    try:
        collected, raw_items = asyncio.run(dump_all_pets(
            base_url=args.base_url,
            api_path=args.api_path,
            api_key=args.api_key,
            page_size=args.page_size,
            max_pages=args.max_pages,
            delay=args.delay,
        ))
    except KeyboardInterrupt:
        print("\n[!] 用户中断", file=sys.stderr)
        return 130

    written = write_outputs(raw_items, collected, raw_output, simplified_output)

    if not written:
        print("[!] 没有写出任何文件,请检查 --output / --raw-output / --only-* 参数", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())