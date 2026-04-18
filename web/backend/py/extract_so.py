#!/usr/bin/env python3
"""Extract a single .so from an APK into a directory.

Usage:  extract_so.py <apk> <lib/arm64-v8a/libfoo.so> <out_dir>
Prints the absolute path of the extracted file on stdout.
"""
import os
import sys
import zipfile


def main() -> int:
    if len(sys.argv) != 4:
        sys.stderr.write(__doc__)
        return 2
    apk, rel, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, os.path.basename(rel))
    with zipfile.ZipFile(apk) as z:
        try:
            info = z.getinfo(rel)
        except KeyError:
            sys.stderr.write("%s not found inside %s\n" % (rel, apk))
            return 1
        with z.open(info) as src, open(dest, "wb") as dst:
            dst.write(src.read())
    sys.stdout.write(os.path.abspath(dest))
    return 0


if __name__ == "__main__":
    sys.exit(main())
