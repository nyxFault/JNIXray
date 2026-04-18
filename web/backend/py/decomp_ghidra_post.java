// JNIXray Ghidra post-script.
//
// Historically this was a .py script, but Ghidra 12 switched the default
// provider for *.py to PyGhidra (CPython bridge) which is an optional
// install. A Java GhidraScript has no such dependency — Ghidra compiles
// it on the fly during headless analysis.
//
// Invoked by analyzeHeadless like:
//   -postScript decomp_ghidra_post.java <symbol> <out_file>
//
// Writes the decompiled C for <symbol> to <out_file>. On any failure it
// writes a "// ..." comment to the same file so the Node orchestrator
// always has something to read back.
//
//@category JNIXray

import java.io.FileWriter;
import java.io.PrintWriter;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.decompiler.DecompiledFunction;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.FunctionManager;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;
import ghidra.program.model.symbol.SymbolTable;
import ghidra.util.task.ConsoleTaskMonitor;

public class decomp_ghidra_post extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) {
            println("decomp_ghidra_post: expected <symbol> <out_file>");
            return;
        }
        String symbol = args[0];
        String outFile = args[1];

        String text = "";
        try {
            Function fn = findFunction(symbol);
            if (fn == null) {
                text = "// symbol not found: " + symbol;
            } else {
                DecompInterface decomp = new DecompInterface();
                try {
                    decomp.openProgram(currentProgram);
                    DecompileResults res = decomp.decompileFunction(
                        fn, 120, new ConsoleTaskMonitor());
                    if (res != null && res.decompileCompleted()) {
                        DecompiledFunction dfn = res.getDecompiledFunction();
                        if (dfn != null) {
                            text = dfn.getC();
                        }
                    }
                } finally {
                    decomp.dispose();
                }
                if (text == null || text.isEmpty()) {
                    text = "// decompilation failed for " + symbol;
                }
            }
        } catch (Exception ex) {
            text = "// ghidra exception: " + ex.toString();
        }

        PrintWriter pw = new PrintWriter(new FileWriter(outFile));
        try {
            pw.write(text);
        } finally {
            pw.close();
        }
    }

    private Function findFunction(String symbol) {
        FunctionManager fm = currentProgram.getFunctionManager();
        FunctionIterator fit = fm.getFunctions(true);
        while (fit.hasNext()) {
            Function f = fit.next();
            if (f.getName().equals(symbol)) {
                return f;
            }
        }
        SymbolTable st = currentProgram.getSymbolTable();
        SymbolIterator sit = st.getSymbols(symbol);
        while (sit.hasNext()) {
            Symbol s = sit.next();
            Function f = fm.getFunctionAt(s.getAddress());
            if (f != null) {
                return f;
            }
        }
        return null;
    }
}
