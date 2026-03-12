import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { Camera } from '@capacitor/camera';
import { MlKitDocumentScanner } from '../../plugins/mlkit-document-scanner';

enum PageState {
  NoPhotos,
  PhotosScanned,
  Fullscreen
}

@Component({
  selector: 'app-media-page',
  templateUrl: './media-page.page.html',
  styleUrls: ['./media-page.page.scss'],
})
export class MediaPagePage implements OnInit {
  public PageState = PageState;
  public currentState: PageState = PageState.NoPhotos;
  
  // Array based state management for Multi-Scan Workflow
  public scannedImages: string[] = [];
  
  public fullscreenImage: string | null = null;
  public fullscreenBelowHeader: boolean = true;
  public isClosingFullscreen: boolean = false;

  constructor(private cdRef: ChangeDetectorRef) {}

  ngOnInit() {
    // Initialization no longer requires waiting for OpenCV
  }

  public async startDocumentScan() {
    try {
      // Request camera permission before scanning
      const permStatus = await Camera.requestPermissions({ permissions: ['camera'] });
      if (permStatus.camera === 'denied') {
        alert('Kameraberechtigung wurde verweigert. Bitte in den Einstellungen aktivieren.');
        return;
      }

      const { scannedImages } = await MlKitDocumentScanner.scanDocument({
         letUserAdjustCrop: true,
         maxNumDocuments: 24, // Allow batch scanning
      });

      if (scannedImages && scannedImages.length > 0) {
        // Append newly scanned images to the array (Multi-Scan Support)
        this.scannedImages = [...this.scannedImages, ...scannedImages];
        this.currentState = PageState.PhotosScanned;
        this.cdRef.detectChanges();
      }
    } catch (error: any) {
      console.error("Fehler beim Scannen des Dokuments:", error);
      // Ignore user cancellation, but show other errors
      const msg = error?.message || String(error);
      if (msg && !msg.toLowerCase().includes('cancel')) {
        alert("Scanner-Fehler: " + msg);
      }
    }
  }

  public removeImage(index: number) {
    this.scannedImages.splice(index, 1);
    if (this.scannedImages.length === 0) {
      this.currentState = PageState.NoPhotos;
    }
    this.cdRef.detectChanges();
  }

  public onSave() {
    if (this.scannedImages.length > 0) {
      alert(`${this.scannedImages.length} Bild(er) gespeichert (simuliert).`);
      // Here you would typically send the base64 array to your backend or state store
    } else {
      alert("Warnung: Keine Bilder zum Speichern vorhanden.");
    }
  }

  public deleteAllPhotos() {
    this.scannedImages = [];
    this.currentState = PageState.NoPhotos;
    this.cdRef.detectChanges();
  }

  public openFullscreen(imageSrc: string) {
    this.fullscreenImage = imageSrc;
    this.currentState = PageState.Fullscreen;
    this.cdRef.detectChanges();
  }

  public closeFullscreen() {
    this.isClosingFullscreen = true;
    this.cdRef.detectChanges();

    setTimeout(() => {
      this.currentState = PageState.PhotosScanned;
      this.fullscreenImage = null;
      this.isClosingFullscreen = false;
      this.cdRef.detectChanges();
    }, 300);
  }
}
