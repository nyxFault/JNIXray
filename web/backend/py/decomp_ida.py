"""IDA Pro headless decompiler driver.

Invoked by idat64 via ``-S<path_to_this_file>``. IDA's ``-S`` flag has very
brittle quoting when the script takes arguments, so we read the target
symbol and output file from environment variables set by the Node
orchestrator:

    JNIXRAY_SYMBOL  — e.g. "Java_com_example_Foo_bar"
    JNIXRAY_OUT     — absolute path of the text file to write
"""

import os
import sys


def _run():
    try:
        import ida_auto
        import ida_funcs
        import ida_hexrays
        import ida_name
        import idaapi
        import idc
    except Exception as ex:  # noqa: BLE001
        _emit("// idapython unavailable: %s" % ex)
        return

    symbol = os.environ.get("JNIXRAY_SYMBOL", "")
    out = os.environ.get("JNIXRAY_OUT", "")
    if not symbol or not out:
        _emit("// JNIXRAY_SYMBOL / JNIXRAY_OUT env vars not set")
        idc.qexit(1)
        return

    ida_auto.auto_wait()

    text = ""
    try:
        if not ida_hexrays.init_hexrays_plugin():
            text = "// Hex-Rays decompiler not licensed / unavailable"
        else:
            ea = ida_name.get_name_ea(idaapi.BADADDR, symbol)
            if ea == idaapi.BADADDR:
                text = "// symbol not found: " + symbol
            else:
                fn = ida_funcs.get_func(ea)
                if fn is None:
                    text = "// address has no function: " + symbol
                else:
                    cfunc = ida_hexrays.decompile(fn.start_ea)
                    if cfunc is None:
                        text = "// decompilation failed for " + symbol
                    else:
                        text = str(cfunc)
    except Exception as ex:  # noqa: BLE001
        text = "// ida exception: %s" % ex

    _emit(text)
    idc.qexit(0)


def _emit(text):
    out = os.environ.get("JNIXRAY_OUT", "")
    if not out:
        sys.stderr.write(text)
        return
    fh = open(out, "w")
    try:
        fh.write(text)
    finally:
        fh.close()


_run()
