# iOS Plugin Setup (requires macOS + Xcode)

## 1. iOS-Plattform hinzufügen
```bash
npx cap add ios
```

## 2. Plugin-Datei kopieren
```bash
cp ios-plugin-src/MlKitDocumentScannerPlugin.swift ios/App/App/
```

## 3. AppDelegate.swift aktualisieren
In `ios/App/App/AppDelegate.swift` die `application(_:didFinishLaunchingWithOptions:)` Methode:
```swift
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Kein manuelles registerPlugin nötig – @objc(MlKitDocumentScannerPlugin) reicht
        return true
    }
}
```

## 4. Info.plist – Kamera-Berechtigung
In `ios/App/App/Info.plist` hinzufügen:
```xml
<key>NSCameraUsageDescription</key>
<string>Wird für den Dokumentenscanner benötigt</string>
```

## 5. Xcode öffnen und bauen
```bash
npx cap open ios
```
→ In Xcode: Product → Run

## Hinweise
- Nutzt `VNDocumentCameraViewController` (Apple Vision Framework, iOS 13+)
- Kein Firebase/ML Kit nötig auf iOS – Apple hat eigenen nativen Scanner
- Automatische Kantenerkennung und Perspektivkorrektur sind eingebaut
