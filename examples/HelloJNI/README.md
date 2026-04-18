# HelloJNI sample app

A tiny Android app I wrote to have something predictable to trace.

It registers two `native` methods on `com.example.hellojni.MainActivity`:

- `getHelloString()` — `JNIEnv->NewStringUTF("Hello JNI")`
- `checkActivation(String)` — string compare against a hardcoded value

The native code lives in `libhello-jni.so` (built for arm64-v8a, armeabi-v7a,
x86 and x86_64 — pick whichever your test device wants).

Source repo: https://github.com/nyxFault/HelloJNI

## Install

```bash
adb install examples/HelloJNI/app-debug.apk
```

Then in JNIXray, pick the device → pick `com.example.hellojni` → start the
trace → tap the buttons in the app.
