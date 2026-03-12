package de.cs4u.media_utility;

import android.app.Activity;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import static com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG;
import static com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL;

@CapacitorPlugin(name = "MlKitDocumentScanner")
public class MlKitDocumentScannerPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> scanLauncher;
    private PluginCall savedCall;

    @Override
    public void load() {
        scanLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> handleScanResult(result)
        );
    }

    @PluginMethod
    public void scanDocument(PluginCall call) {
        if (savedCall != null) {
            call.reject("A scan is already in progress");
            return;
        }
        savedCall = call;
        bridge.saveCall(call);

        int maxPages = call.getInt("maxNumDocuments", 24);

        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setScannerMode(SCANNER_MODE_FULL)
            .setPageLimit(maxPages)
            .setResultFormats(RESULT_FORMAT_JPEG)
            .setGalleryImportAllowed(false)
            .build();

        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        scanner.getStartScanIntent(getActivity())
            .addOnSuccessListener(intentSender -> {
                IntentSenderRequest request = new IntentSenderRequest.Builder(intentSender).build();
                scanLauncher.launch(request);
            })
            .addOnFailureListener(e -> {
                PluginCall c = bridge.getSavedCall(call.getCallbackId());
                if (c != null) {
                    bridge.releaseCall(c);
                    savedCall = null;
                    c.reject("ML Kit failed to start: " + e.getMessage(), e);
                }
            });
    }

    private void handleScanResult(ActivityResult result) {
        if (savedCall == null) return;
        PluginCall call = bridge.getSavedCall(savedCall.getCallbackId());
        if (call == null) return;
        bridge.releaseCall(call);
        savedCall = null;

        JSObject response = new JSObject();

        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            response.put("status", "cancel");
            call.resolve(response);
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Unexpected result code: " + result.getResultCode());
            return;
        }

        GmsDocumentScanningResult scanResult =
            GmsDocumentScanningResult.fromActivityResultIntent(result.getData());

        if (scanResult == null || scanResult.getPages() == null) {
            call.reject("ML Kit returned null result");
            return;
        }

        ArrayList<String> base64Images = new ArrayList<>();
        for (GmsDocumentScanningResult.Page page : scanResult.getPages()) {
            try {
                String b64 = uriToBase64(page.getImageUri());
                base64Images.add("data:image/jpeg;base64," + b64);
            } catch (IOException e) {
                call.reject("Failed to read scanned image: " + e.getMessage(), e);
                return;
            }
        }

        response.put("scannedImages", new JSArray(base64Images));
        response.put("status", "success");
        call.resolve(response);
    }

    private String uriToBase64(Uri uri) throws IOException {
        InputStream inputStream = getContext().getContentResolver().openInputStream(uri);
        if (inputStream == null) throw new IOException("Cannot open stream for URI: " + uri);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int bytesRead;
        while ((bytesRead = inputStream.read(chunk)) != -1) {
            buffer.write(chunk, 0, bytesRead);
        }
        inputStream.close();
        return Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
    }
}
