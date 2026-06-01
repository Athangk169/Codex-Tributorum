# ── Codex Tributorum — ProGuard / R8 rules ─────────────────────────
#
# Keep the bits Capacitor + plugins reach into via reflection (the JS
# bridge calls Java by class/method name at runtime, so R8 mustn't
# rename or strip them).

# Keep stack traces sensible if something does crash in release.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Capacitor core / JS bridge ──
-keep public class com.getcapacitor.** { *; }
-keep public class com.getcapacitor.plugin.** { *; }
-keepattributes *Annotation*
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}

# ── App entry point ──
-keep class com.Sanguinius.** { *; }

# ── WebView <-> JS bridge ──
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Cordova compatibility plugins shim ──
-keep class org.apache.cordova.** { *; }

# ── AndroidX components used via reflection ──
-keep class androidx.appcompat.** { *; }
-keep class androidx.coordinatorlayout.** { *; }
-keep class androidx.core.splashscreen.** { *; }

# ── Strip debug logs from the release bundle ──
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
