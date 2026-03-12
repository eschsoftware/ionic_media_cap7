import { registerPlugin } from '@capacitor/core';

export interface MlKitDocumentScannerPlugin {
  scanDocument(options?: {
    letUserAdjustCrop?: boolean;
    maxNumDocuments?: number;
    responseType?: 'base64' | 'imageFilePath';
    croppedImageQuality?: number;
  }): Promise<{ scannedImages?: string[]; status?: 'success' | 'cancel' }>;
}

const MlKitDocumentScanner = registerPlugin<MlKitDocumentScannerPlugin>(
  'MlKitDocumentScanner'
);

export { MlKitDocumentScanner };
