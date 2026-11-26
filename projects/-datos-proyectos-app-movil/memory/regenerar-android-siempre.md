---
name: regenerar-android-siempre
description: Antes de compilar el APK de AMI, borrar android/ y regenerarla con scripts/build-apk.sh, sin preguntar ni renombrarla
metadata:
  type: feedback
---

Para compilar o instalar AMI en un dispositivo, la carpeta `android/` se borra y se vuelve a generar con
`./scripts/build-apk.sh` (con `--install` para instalar por adb). No se renombra ni se pregunta antes.

**Why:** `android/` está en `.gitignore` y se queda vieja en el clon. El 2026-11-26 la del clon era de
junio de 2025 (compileSdk 35, AGP 8.7.2) y no compilaba con Capacitor 8. Fabian pidió que siempre se elimine
y se regenere.

**How to apply:** `git check-ignore -q android && rm -rf android`, y luego
`JAVA_HOME=/opt/android-studio/jbr ANDROID_HOME=$HOME/Android/Sdk bash scripts/build-apk.sh --install`. En esta
máquina el script no es ejecutable (se corre con `bash`) y elige solo el JDK 25, con el que Gradle falla; el JDK 21
de `/usr/lib/jvm` no trae `javac`. El que compila es el `jbr` de Android Studio.
El script recrea la carpeta con `cap add android` y le reaplica `AndroidManifest.xml` y `build.gradle` desde
la raíz, que son la fuente de verdad. Relacionada: [[version-nueva-requiere-seeder-backend]].
