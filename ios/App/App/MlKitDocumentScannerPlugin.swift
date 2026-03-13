import Foundation
import Capacitor
import VisionKit

@objc(MlKitDocumentScanner)
public class MlKitDocumentScannerPlugin: CAPPlugin, CAPBridgedPlugin, VNDocumentCameraViewControllerDelegate {
    public let identifier = "MlKitDocumentScannerPlugin"
    public let jsName = "MlKitDocumentScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scanDocument", returnType: CAPPluginReturnPromise)
    ]

    private var savedCall: CAPPluginCall?

    @objc func scanDocument(_ call: CAPPluginCall) {
        guard VNDocumentCameraViewController.isSupported else {
            call.reject("Document scanning is not supported on this device")
            return
        }
        savedCall = call
        call.keepAlive = true
        DispatchQueue.main.async {
            let scanner = VNDocumentCameraViewController()
            scanner.delegate = self
            self.bridge?.viewController?.present(scanner, animated: true)
        }
    }

    public func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFinishWith scan: VNDocumentCameraScan
    ) {
        controller.dismiss(animated: true)
        guard let call = savedCall else { return }
        savedCall = nil

        var base64Images: [String] = []
        for i in 0..<scan.pageCount {
            let image = scan.imageOfPage(at: i)
            if let data = image.jpegData(compressionQuality: 0.9) {
                base64Images.append("data:image/jpeg;base64," + data.base64EncodedString())
            }
        }
        call.resolve(["scannedImages": base64Images, "status": "success"])
    }

    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
        savedCall?.resolve(["status": "cancel"])
        savedCall = nil
    }

    public func documentCameraViewController(
        _ controller: VNDocumentCameraViewController,
        didFailWithError error: Error
    ) {
        controller.dismiss(animated: true)
        savedCall?.reject("Scan failed: \(error.localizedDescription)", nil, error)
        savedCall = nil
    }
}
