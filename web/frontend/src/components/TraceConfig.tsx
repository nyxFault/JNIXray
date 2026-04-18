import { useMemo, useState } from "react";
import clsx from "clsx";
import type { TraceOptions } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Switch,
} from "./ui";
import { LibraryPicker } from "./LibraryPicker";

interface Props {
  options: TraceOptions;
  onChange: (next: TraceOptions) => void;
  onStart: () => void;
  onStop: () => void;
  running: boolean;
  canStart: boolean;
  serial: string | null;
}

function CSV({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  return (
    <Input
      placeholder={placeholder}
      value={value.join(", ")}
      onChange={(e) =>
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

function Field({
  label,
  flag,
  hint,
  children,
}: {
  label: string;
  flag: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[11.5px] font-medium text-slate-200">{label}</label>
        <span className="text-[10.5px] font-mono text-slate-500">{flag}</span>
      </div>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-white/5 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-white/[0.03] rounded-t-lg"
      >
        <div className="text-left">
          <div className="text-[12px] font-semibold text-slate-100">{title}</div>
          {subtitle && (
            <div className="text-[10.5px] text-slate-500">{subtitle}</div>
          )}
        </div>
        <span
          className={clsx(
            "inline-block w-2 h-2 border-r-2 border-b-2 border-slate-400 transition-transform",
            open ? "rotate-45" : "-rotate-45",
          )}
        />
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

function validateOptions(o: TraceOptions): string | null {
  if (o.ignoreEnv && o.ignoreVm) {
    return "Ignoring both JNIEnv and JavaVM leaves nothing to trace — enable at least one.";
  }
  if (!o.target) return "Pick an Android package to trace.";
  if (!o.libraries.length) return "Add at least one library to trace (use * for all).";
  return null;
}

export function TraceConfig({
  options,
  onChange,
  onStart,
  onStop,
  running,
  canStart,
  serial,
}: Props) {
  const validationError = useMemo(() => validateOptions(options), [options]);
  const previewArgs = useMemo(() => {
    const o = options;
    const a: string[] = [];
    for (const l of o.libraries) a.push("-l", l);
    for (const i of o.include) a.push("-i", i);
    for (const e of o.exclude) a.push("-e", e);
    for (const i of o.includeExport) a.push("-I", i);
    for (const e of o.excludeExport) a.push("-E", e);
    if (o.injectMethod) a.push("-m", o.injectMethod);
    if (o.backtrace) a.push("-b", o.backtrace);
    if (o.remote) a.push("-R", o.remote);
    if (o.hideData) a.push("--hide-data");
    if (o.ignoreEnv) a.push("--ignore-env");
    if (o.ignoreVm) a.push("--ignore-vm");
    if (o.output) a.push("-o", o.output);
    if (o.prepend) a.push("-p", o.prepend);
    if (o.append) a.push("-a", o.append);
    for (const x of o.aux || []) a.push("--aux", x);
    if (o.target) a.push(o.target);
    return "jnitrace " + a.map((t) => (t.includes(" ") ? `'${t}'` : t)).join(" ");
  }, [options]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="text-brand-300">03.</span> Trace configuration
        </CardTitle>
        {running ? (
          <Badge tone="ok">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            tracing
          </Badge>
        ) : (
          <Badge tone="neutral">idle</Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        <Section
          title="Target"
          subtitle="The Android package and libraries you want to trace."
        >
          <Field
            label="Android package"
            flag="positional"
            hint="The app identifier to trace. It must already be installed on the device."
          >
            <Input
              placeholder="com.example.myapplication"
              value={options.target}
              onChange={(e) => onChange({ ...options, target: e.target.value })}
            />
          </Field>
          <Field
            label="Libraries to trace"
            flag="-l"
            hint="Native .so libraries whose JNI calls should be instrumented. Click Detect to list the app's libraries, type names manually, or use * to trace everything."
          >
            <CSV
              value={options.libraries}
              onChange={(libraries) => onChange({ ...options, libraries })}
              placeholder="libnative-lib.so, libanother-lib.so   (or *)"
            />
            <div className="mt-2">
              <LibraryPicker
                serial={serial}
                pkg={options.target}
                selected={options.libraries}
                onChange={(libraries) => onChange({ ...options, libraries })}
              />
            </div>
          </Field>
        </Section>

        <Section
          title="Attach behaviour"
          subtitle="How Frida connects to the process and what extra data is collected."
        >
          <Field
            label="Attach mechanism"
            flag="-m"
            hint="Spawn launches the app fresh (recommended, captures JNI_OnLoad). Attach hooks into an already-running process."
          >
            <Select
              value={options.injectMethod || "spawn"}
              onChange={(e) =>
                onChange({ ...options, injectMethod: e.target.value as "spawn" | "attach" })
              }
            >
              <option value="spawn">spawn — launch the app fresh</option>
              <option value="attach">attach — hook the running process</option>
            </Select>
          </Field>
          <Field
            label="Backtrace mode"
            flag="-b"
            hint="Controls how native call stacks are recorded. Accurate is precise but may miss frames; fuzzy is more complete but may include false frames; none disables stacks for maximum speed."
          >
            <Select
              value={options.backtrace || "accurate"}
              onChange={(e) =>
                onChange({
                  ...options,
                  backtrace: e.target.value as "accurate" | "fuzzy" | "none",
                })
              }
            >
              <option value="accurate">accurate — precise, may miss frames</option>
              <option value="fuzzy">fuzzy — complete, may be noisy</option>
              <option value="none">none — no backtraces (fastest)</option>
            </Select>
          </Field>
          <Field
            label="Remote Frida server"
            flag="-R"
            hint="Connect to a remote frida-server over the network instead of a USB device. Format: host:port. Leave blank to use USB."
          >
            <Input
              placeholder="e.g. 192.168.1.50:27042"
              value={options.remote || ""}
              onChange={(e) => onChange({ ...options, remote: e.target.value })}
            />
          </Field>
        </Section>

        <Section
          title="Filter by JNI method name"
          subtitle="Reduce noise by selecting which standard JNI methods (GetStringUTFChars, FindClass, RegisterNatives…) appear."
        >
          <Field
            label="Only include methods matching"
            flag="-i"
            hint="Regex on JNI method names (from jni.h). Matching methods are the only ones traced. Separate multiple regexes with commas."
          >
            <CSV
              value={options.include}
              onChange={(include) => onChange({ ...options, include })}
              placeholder="e.g. Get, RegisterNatives"
            />
          </Field>
          <Field
            label="Exclude methods matching"
            flag="-e"
            hint="Regex on JNI method names to hide from the trace. Useful for muting high-volume calls."
          >
            <CSV
              value={options.exclude}
              onChange={(exclude) => onChange({ ...options, exclude })}
              placeholder="e.g. ^Find, GetEnv"
            />
          </Field>
        </Section>

        <Section
          title="Filter by library export"
          subtitle="Pick which native functions from the traced library act as entry points (includes RegisterNatives bindings)."
          defaultOpen={false}
        >
          <Field
            label="Only trace from exports"
            flag="-I"
            hint='Exact export names. Examples: "stringFromJNI", "nativeMethod([B)V".'
          >
            <CSV
              value={options.includeExport}
              onChange={(includeExport) => onChange({ ...options, includeExport })}
              placeholder="stringFromJNI, nativeMethod([B)V"
            />
          </Field>
          <Field
            label="Do not trace from exports"
            flag="-E"
            hint="Skip calls entering from these exports (e.g. JNI_OnLoad)."
          >
            <CSV
              value={options.excludeExport}
              onChange={(excludeExport) => onChange({ ...options, excludeExport })}
              placeholder="JNI_OnLoad, nativeMethod"
            />
          </Field>
        </Section>

        <Section
          title="Output & data"
          subtitle="Control how much detail is printed and whether to save a JSON log."
          defaultOpen={false}
        >
          <Field
            label="Save full trace to JSON file"
            flag="-o"
            hint="Absolute path on the backend host where the trace will be written. Leave blank to skip file output."
          >
            <Input
              placeholder="/tmp/jnitrace.json"
              value={options.output || ""}
              onChange={(e) => onChange({ ...options, output: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-2">
            <Switch
              label="Hide extra data (hexdumps, string derefs)"
              checked={!!options.hideData}
              onChange={(v) => onChange({ ...options, hideData: v })}
            />
            <Switch
              label="Ignore JNIEnv calls"
              checked={!!options.ignoreEnv}
              onChange={(v) => onChange({ ...options, ignoreEnv: v })}
            />
            <Switch
              label="Ignore JavaVM calls"
              checked={!!options.ignoreVm}
              onChange={(v) => onChange({ ...options, ignoreVm: v })}
            />
            {options.ignoreEnv && options.ignoreVm && (
              <p className="text-[11px] text-amber-300 leading-snug">
                Both switches are on — jnitrace would have nothing to print. Disable at least one.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Advanced"
          subtitle="Inject extra Frida scripts and pass spawn parameters."
          defaultOpen={false}
        >
          <Field
            label="Prepend Frida script"
            flag="-p"
            hint="Path to a .js file loaded BEFORE jnitrace. Typical use: bypass anti-Frida / anti-debugging before tracing starts."
          >
            <Input
              placeholder="/path/to/anti-anti-frida.js"
              value={options.prepend || ""}
              onChange={(e) => onChange({ ...options, prepend: e.target.value })}
            />
          </Field>
          <Field
            label="Append Frida script"
            flag="-a"
            hint="Path to a .js file loaded AFTER jnitrace has set up. Use for custom extra hooks that rely on jnitrace being active."
          >
            <Input
              placeholder="/path/to/extra-hooks.js"
              value={options.append || ""}
              onChange={(e) => onChange({ ...options, append: e.target.value })}
            />
          </Field>
          <Field
            label="Spawn aux parameters"
            flag="--aux"
            hint="Extra frida spawn parameters, each as name=(string|bool|int)value. Example: uid=(int)10 to spawn as user 10."
          >
            <CSV
              value={options.aux || []}
              onChange={(aux) => onChange({ ...options, aux })}
              placeholder="uid=(int)10, foo=(string)bar"
            />
          </Field>
        </Section>

        <div className="rounded-lg border border-white/5 bg-black/50 p-2.5 overflow-x-auto">
          <div className="text-[10.5px] uppercase tracking-wider text-slate-500 mb-1">
            Equivalent command
          </div>
          <pre className="text-[11.5px] font-mono text-slate-200 whitespace-pre-wrap break-all">
            {previewArgs}
          </pre>
        </div>

        {validationError && !running && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            {validationError}
          </div>
        )}

        <div className="flex gap-2">
          {running ? (
            <Button variant="danger" onClick={onStop} className="flex-1">
              Stop trace
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={onStart}
              disabled={!canStart || !!validationError}
              className="flex-1"
            >
              Start tracing
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
