#!/usr/bin/env python3
"""Export machine-readable size data using puncover internals.

Usage:
  uv run --with puncover python ./puncover_export.py \
    --elf /path/to/build/firmware.elf \
    --src-root /path/to/repo \
    --build-dir /path/to/build \
    --gcc-tools-base /path/to/arm-none-eabi- \
    --top 40 \
    --out /tmp/size-report.json
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from puncover.builders import ElfBuilder
from puncover.collector import Collector, SIZE, TYPE, TYPE_FUNCTION, TYPE_VARIABLE
from puncover.gcc_tools import GCCTools


def collect_report(elf: str, gcc_tools_base: str, src_root: str | None, build_dir: str | None, top: int):
    collector = Collector(GCCTools(gcc_tools_base))
    builder = ElfBuilder(collector, src_root=src_root, elf_file=elf, su_dir=build_dir)
    builder.build()

    functions = collector.all_functions()
    variables = collector.all_variables()

    total_code = sum(int(s.get(SIZE, 0) or 0) for s in functions)
    total_static = sum(int(s.get(SIZE, 0) or 0) for s in variables)

    by_file = defaultdict(lambda: {"code": 0, "static": 0, "stack": 0, "functions": 0, "variables": 0})

    def symbol_name(sym):
        return sym.get("display_name") or sym.get("name") or "<unnamed>"

    def symbol_file(sym):
        path = sym.get("path")
        return str(path) if path else "<unknown>"

    def symbol_stack(sym):
        v = sym.get("stack_size")
        return int(v) if isinstance(v, int) else 0

    for sym in functions:
        file_key = symbol_file(sym)
        by_file[file_key]["code"] += int(sym.get(SIZE, 0) or 0)
        by_file[file_key]["stack"] += symbol_stack(sym)
        by_file[file_key]["functions"] += 1

    for sym in variables:
        file_key = symbol_file(sym)
        by_file[file_key]["static"] += int(sym.get(SIZE, 0) or 0)
        by_file[file_key]["variables"] += 1

    top_functions = [
        {
            "name": symbol_name(s),
            "size": int(s.get(SIZE, 0) or 0),
            "stack": symbol_stack(s),
            "file": symbol_file(s),
            "calls_float": bool(s.get("calls_float_function", False)),
        }
        for s in functions[:top]
    ]

    top_variables = [
        {
            "name": symbol_name(s),
            "size": int(s.get(SIZE, 0) or 0),
            "file": symbol_file(s),
        }
        for s in variables[:top]
    ]

    top_files = sorted(
        (
            {
                "file": k,
                "code": v["code"],
                "static": v["static"],
                "stack": v["stack"],
                "functions": v["functions"],
                "variables": v["variables"],
            }
            for k, v in by_file.items()
        ),
        key=lambda x: (x["code"] + x["static"]),
        reverse=True,
    )[:top]

    float_callers = [s for s in functions if s.get("calls_float_function")]

    return {
        "elf": str(Path(elf)),
        "src_root": str(Path(src_root).resolve()) if src_root else None,
        "build_dir": str(Path(build_dir).resolve()) if build_dir else None,
        "totals": {
            "code_bytes": total_code,
            "static_bytes": total_static,
            "functions": len(functions),
            "variables": len(variables),
            "functions_calling_float": len(float_callers),
        },
        "top_functions": top_functions,
        "top_variables": top_variables,
        "top_files": top_files,
    }


def main():
    parser = argparse.ArgumentParser(description="Export size report JSON from an ELF using puncover")
    parser.add_argument("--elf", required=True, help="Path to ELF/shared object to analyze")
    parser.add_argument("--gcc-tools-base", required=True, help="Tool prefix, e.g. /.../arm-none-eabi-")
    parser.add_argument("--src-root", default=None, help="Source root for path normalization")
    parser.add_argument("--build-dir", default=None, help="Build output dir (for .su files)")
    parser.add_argument("--top", type=int, default=40, help="How many top symbols/files to keep")
    parser.add_argument("--out", default="-", help="Output JSON file path, or - for stdout")
    args = parser.parse_args()

    report = collect_report(
        elf=args.elf,
        gcc_tools_base=args.gcc_tools_base,
        src_root=args.src_root,
        build_dir=args.build_dir,
        top=args.top,
    )

    payload = json.dumps(report, indent=2)
    if args.out == "-":
        print(payload)
    else:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload + "\n", encoding="utf-8")
        print(out)


if __name__ == "__main__":
    main()
