# Document Scanner Prototype (Ionic/Capacitor)

Dieses Projekt ist ein Prototyp zur Demonstration einer einfachen Dokumenten-Scanner-Funktionalität für iOS und Android in einer Ionic/Capacitor-Umgebung. 

Der Scanner nutzt auf beiden Plattformen native Frameworks, um eine optimale Performance und Benutzererfahrung (automatische Kantenerkennung, Perspektivkorrektur) zu gewährleisten.

## Features
- **iOS**: Nutzt das native `VisionKit` (`VNDocumentCameraViewController`). Kein ML Kit erforderlich.
- **Android**: Nutzt das Google `ML Kit Document Scanner` API.
- **Output**: Gibt die gescannten Seiten als Array von Base64-Strings zurück.

## Projektstruktur für den Scanner
Die relevanten Dateien für die Scan-Funktionalität sind:
- **iOS Plugin**: `ios-plugin-src/MlKitDocumentScannerPlugin.swift`
- **iOS Plugin-Registrierung**: `ios/App/App/MainViewController.swift` *(ohne diese Datei funktioniert das Plugin nicht)*
- **Android Plugin**: `android/app/src/main/java/de/cs4u/media_utility/MlKitDocumentScannerPlugin.java`
- **TypeScript Interface**: `src/plugins/mlkit-document-scanner.ts`

---

## Transfer-Guide: Integration in ein anderes Projekt

Um die Scan-Funktionalität in ein bestehendes Capacitor-Projekt zu übertragen, folgen Sie diesen Schritten:

### 1. TypeScript Interface & Registrierung
Kopieren Sie die Datei `src/plugins/mlkit-document-scanner.ts` in Ihr Projekt (z.B. nach `src/app/plugins/`). Diese Datei definiert das Interface und registriert das Plugin bei Capacitor.

### 2. iOS Integration
1. **Plugin-Datei kopieren**: Kopieren Sie `ios-plugin-src/MlKitDocumentScannerPlugin.swift` in Ihr Xcode-Projekt unter `ios/App/App/`.

2. **Plugin explizit registrieren** *(kritisch — ohne diesen Schritt bleibt das Plugin unregistriert)*:
   Capacitor's `registerPlugins()` lädt Plugins ausschließlich aus npm-Packages. Eingebettete Plugins (ohne npm-Package) müssen manuell registriert werden.

   Erstellen Sie `ios/App/App/MainViewController.swift`:
   ```swift
   import UIKit
   import Capacitor

   class MainViewController: CAPBridgeViewController {
       override open func capacitorDidLoad() {
           bridge?.registerPluginInstance(MlKitDocumentScannerPlugin())
       }
   }
   ```

   Passen Sie `ios/App/App/Base.lproj/Main.storyboard` an — ersetzen Sie den `viewController`-Eintrag:
   ```xml
   <!-- Vorher -->
   <viewController id="BYZ-38-t0r" customClass="CAPBridgeViewController" customModule="Capacitor" sceneMemberID="viewController"/>

   <!-- Nachher -->
   <viewController id="BYZ-38-t0r" customClass="MainViewController" customModuleProvider="target" sceneMemberID="viewController"/>
   ```

   Fügen Sie beide Dateien in Xcode dem Target hinzu (File → Add Files to "App"), damit sie in `project.pbxproj` eingetragen werden.

3. **Berechtigungen**: Fügen Sie in der `Info.plist` (`ios/App/App/Info.plist`) den Kamerazugriff hinzu:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Wird für den Dokumentenscanner benötigt</string>
   ```

4. **Frameworks**: Stellen Sie sicher, dass `VisionKit` im Projekt verfügbar ist (Standard ab iOS 13).

### 3. Android Integration
1. **Datei kopieren**: Kopieren Sie `android/app/src/main/java/de/cs4u/media_utility/MlKitDocumentScannerPlugin.java` in Ihr Android-Projekt. 
   > **Hinweis**: Passen Sie das `package` oben in der Datei an Ihre Projektstruktur an (z.B. `package com.ihre.app;`).
2. **Abhängigkeiten**: Fügen Sie in Ihrer `android/app/build.gradle` die ML Kit Abhängigkeit hinzu:
   ```gradle
   dependencies {
       implementation 'com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1'
   }
   ```
3. **Plugin-Registrierung**: Falls Sie Capacitor 5 oder tiefer nutzen, müssen Sie das Plugin ggf. in der `MainActivity.java` manuell hinzufügen. Ab Capacitor 6/7 (wie in diesem Prototyp) wird das Plugin durch die `@CapacitorPlugin` Annotation automatisch erkannt, sofern es im richtigen Package liegt.

### 4. Verwendung in Angular/TypeScript
Importieren Sie den Scanner und rufen Sie die `scanDocument` Methode auf:

```typescript
import { MlKitDocumentScanner } from './path/to/mlkit-document-scanner';

async function scan() {
  try {
    const result = await MlKitDocumentScanner.scanDocument({
      maxNumDocuments: 24
    });
    
    if (result.status === 'success' && result.scannedImages) {
      console.log('Gescannte Bilder:', result.scannedImages); // Array von Base64 Strings
    }
  } catch (error) {
    console.error('Scan fehlgeschlagen', error);
  }
}
```

## Entwicklung & Testen
- **iOS**: Benötigt ein physisches Gerät (Dokumentenscan funktioniert nicht im Simulator). Öffnen mit `npx cap open ios`.
- **Android**: Funktioniert auf physischen Geräten mit Google Play Services. Öffnen mit `npx cap open android`.
