#!/usr/bin/env python3

import argparse
import re
from pathlib import Path

from PIL import Image, ImageOps


SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
DERIVATIVE_PATTERN = re.compile(r"@\d+w$")


def is_supported_image(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED_EXTENSIONS


def is_derivative(path: Path) -> bool:
    return DERIVATIVE_PATTERN.search(path.stem) is not None


def derivative_path(source: Path, width: int) -> Path:
    return source.with_name(f"{source.stem}@{width}w{source.suffix}")


def target_widths(source_width: int) -> list[int]:
    widths = []
    width = 480
    while width < source_width:
        widths.append(width)
        width *= 2
    return widths


def save_resized(source: Path, destination: Path, width: int) -> None:
    with Image.open(source) as img:
        img = ImageOps.exif_transpose(img)
        ratio = width / img.width
        height = max(1, int(img.height * ratio))
        resized = img.resize((width, height), Image.Resampling.LANCZOS)

        fmt = "PNG" if source.suffix.lower() == ".png" else "JPEG"
        if fmt == "JPEG" and resized.mode not in ("RGB", "L"):
            resized = resized.convert("RGB")

        save_kwargs = {"format": fmt}
        if fmt == "JPEG":
            save_kwargs.update({"quality": 85, "optimize": True})
        else:
            save_kwargs.update({"optimize": True})

        resized.save(destination, **save_kwargs)


def process_image(source: Path, force: bool, clean_stale: bool) -> tuple[int, int]:
    with Image.open(source) as img:
        img = ImageOps.exif_transpose(img)
        widths = target_widths(img.width)

    generated = 0
    skipped = 0
    expected_files: set[Path] = set()
    source_stat = source.stat()
    # Use both mtime and ctime so replacements with preserved mtime still trigger updates.
    source_reference_time = max(source_stat.st_mtime, source_stat.st_ctime)

    for width in widths:
        destination = derivative_path(source, width)
        expected_files.add(destination)

        needs_update = force or not destination.exists() or (
            destination.stat().st_mtime < source_reference_time
        )
        if needs_update:
            save_resized(source, destination, width)
            generated += 1
        else:
            skipped += 1

    if clean_stale:
        prefix = f"{source.stem}@"
        for candidate in source.parent.glob(f"{prefix}*w{source.suffix}"):
            if candidate not in expected_files and is_derivative(candidate):
                candidate.unlink()

    return generated, skipped


def iter_sources(path: Path):
    if path.is_file():
        if is_supported_image(path) and not is_derivative(path):
            yield path
        return

    for candidate in path.rglob("*"):
        if candidate.is_file() and is_supported_image(candidate) and not is_derivative(candidate):
            yield candidate


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate responsive image variants (e.g. @480w) for images."
    )
    parser.add_argument(
        "legacy_path",
        nargs="?",
        help="Optional path for backward compatibility. Use --path for clarity.",
    )
    parser.add_argument(
        "--path",
        dest="path",
        help="Image file or directory to process (defaults to assets/img).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate all responsive variants even when up-to-date.",
    )
    parser.add_argument(
        "--no-clean-stale",
        action="store_true",
        help="Do not remove stale responsive variants not matching current source size.",
    )
    args = parser.parse_args()

    target = Path(args.path or args.legacy_path or "assets/img")
    if not target.exists():
        print(f"Path not found: {target}")
        return 1

    total_sources = 0
    total_generated = 0
    total_skipped = 0

    for source in iter_sources(target):
        total_sources += 1
        generated, skipped = process_image(
            source, force=args.force, clean_stale=not args.no_clean_stale
        )
        total_generated += generated
        total_skipped += skipped

    print(
        "Processed "
        f"{total_sources} source images, generated {total_generated} variants, "
        f"skipped {total_skipped} up-to-date variants."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
