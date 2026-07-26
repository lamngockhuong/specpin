#!/usr/bin/env python3
"""Draw numbered bounding boxes onto a UI image from a bbox JSON sidecar.

Input JSON: an array of { "itemNo": "1"|"1.1"|..., "position": {startX,startY,endX,endY} }
in original-image pixel space. This script only DRAWS -- it performs no detection.
Shared JSON shape with tkm:generate-ui-specs so outputs round-trip into the editor web app.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageColor, ImageDraw, ImageFont


@dataclass(frozen=True)
class BboxItem:
    item_no: str
    start_x: int
    start_y: int
    end_x: int
    end_y: int


# Hierarchical itemNo up to depth 3: 1, 1.2, 1.2.3
ITEM_NO_PATTERN = re.compile(r"^[1-9]\d*(\.[1-9]\d*){0,2}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Draw component bounding boxes and itemNo labels onto an image."
    )
    parser.add_argument("input_image", help="Path to the original source image")
    parser.add_argument("bbox_json", help="Path to the bbox JSON sidecar")
    parser.add_argument("output_image", help="Path to the annotated output image")
    parser.add_argument("--box-color", default="#E53935", help="Bounding box color")
    parser.add_argument("--label-color", default="#FFFFFF", help="Label text color")
    parser.add_argument("--label-bg", default="#111111", help="Label background color")
    parser.add_argument("--line-width", type=int, default=3, help="Bounding box stroke width")
    parser.add_argument("--font-size", type=int, default=16, help="Label font size")
    return parser.parse_args()


def coerce_coordinate(position: dict[str, Any], key: str, item_no: str) -> int:
    value = position.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"itemNo {item_no!r} is missing a numeric {key}")
    return int(round(value))


def validate_item_no(item_no: str) -> str:
    normalized = item_no.strip()
    if not ITEM_NO_PATTERN.fullmatch(normalized):
        raise ValueError(
            "itemNo must use hierarchical numbering like 1, 1.1, or 1.1.1 with max depth 3"
        )
    return normalized


def load_bbox_items(path: Path) -> list[BboxItem]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if isinstance(data, list):
        raw_items = data
    elif isinstance(data, dict) and isinstance(data.get("items"), list):
        raw_items = data["items"]
    else:
        raise ValueError("BBox JSON must be an array or an object containing an 'items' array")

    items: list[BboxItem] = []
    seen_item_nos: set[str] = set()

    for index, raw_item in enumerate(raw_items, start=1):
        if not isinstance(raw_item, dict):
            raise ValueError(f"BBox entry #{index} must be an object")

        item_no = raw_item.get("itemNo")
        position = raw_item.get("position")
        if not isinstance(item_no, str) or not item_no.strip():
            raise ValueError(f"BBox entry #{index} is missing a non-empty itemNo")
        item_no = validate_item_no(item_no)
        if item_no in seen_item_nos:
            raise ValueError(f"Duplicate itemNo detected: {item_no}")
        if not isinstance(position, dict):
            raise ValueError(f"BBox entry #{index} is missing a position object")

        start_x = coerce_coordinate(position, "startX", item_no)
        start_y = coerce_coordinate(position, "startY", item_no)
        end_x = coerce_coordinate(position, "endX", item_no)
        end_y = coerce_coordinate(position, "endY", item_no)
        if start_x > end_x or start_y > end_y:
            raise ValueError(
                f"itemNo {item_no!r} must satisfy startX <= endX and startY <= endY"
            )

        seen_item_nos.add(item_no)
        items.append(BboxItem(item_no, start_x, start_y, end_x, end_y))

    return items


def clamp_box(item: BboxItem, image_width: int, image_height: int) -> tuple[int, int, int, int]:
    max_x = max(image_width - 1, 0)
    max_y = max(image_height - 1, 0)
    left = min(max(item.start_x, 0), max_x)
    right = min(max(item.end_x, 0), max_x)
    top = min(max(item.start_y, 0), max_y)
    bottom = min(max(item.end_y, 0), max_y)
    return left, top, right, bottom


def load_font(font_size: int) -> ImageFont.ImageFont:
    for candidate in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(candidate, font_size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_label(
    draw: ImageDraw.ImageDraw,
    font: ImageFont.ImageFont,
    item_no: str,
    box: tuple[int, int, int, int],
    image_width: int,
    image_height: int,
    label_bg: tuple[int, int, int],
    label_color: tuple[int, int, int],
) -> None:
    padding_x = 6
    padding_y = 4
    text_box = draw.textbbox((0, 0), item_no, font=font)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]

    label_width = text_width + (padding_x * 2)
    label_height = text_height + (padding_y * 2)
    label_left = min(box[0], max(image_width - label_width, 0))
    label_top = box[1] - label_height - 4
    if label_top < 0:
        label_top = min(box[1] + 4, max(image_height - label_height, 0))

    label_right = label_left + label_width
    label_bottom = label_top + label_height
    draw.rectangle((label_left, label_top, label_right, label_bottom), fill=label_bg)
    draw.text((label_left + padding_x, label_top + padding_y), item_no, font=font, fill=label_color)


def annotate_image(args: argparse.Namespace) -> int:
    if args.line_width < 1:
        raise ValueError("line-width must be at least 1")

    bbox_items = load_bbox_items(Path(args.bbox_json))
    font = load_font(args.font_size)
    outline = ImageColor.getrgb(args.box_color)
    text_color = ImageColor.getrgb(args.label_color)
    text_bg = ImageColor.getrgb(args.label_bg)

    with Image.open(args.input_image) as source_image:
        annotated = source_image.convert("RGBA")

    draw = ImageDraw.Draw(annotated)
    image_width, image_height = annotated.size

    for item in bbox_items:
        box = clamp_box(item, image_width, image_height)
        draw.rectangle(box, outline=outline, width=args.line_width)
        draw_label(draw, font, item.item_no, box, image_width, image_height, text_bg, text_color)

    output_image = Path(args.output_image)
    output_image.parent.mkdir(parents=True, exist_ok=True)
    if output_image.suffix.lower() in {".jpg", ".jpeg"}:
        annotated.convert("RGB").save(output_image)
    else:
        annotated.save(output_image)

    return len(bbox_items)


def main() -> int:
    args = parse_args()
    count = annotate_image(args)
    print(f"Annotated {count} bounding boxes into {args.output_image}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
