import {
  Component,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  OnInit, AfterViewInit, HostListener
} from '@angular/core';
import {Camera, CameraResultType, CameraSource} from '@capacitor/camera';

declare var cv: any;
declare global {
  interface Window {
    isOpenCvReady?: boolean;
  }
}

interface Point {
  x: number;
  y: number;
}

interface DetectedCorners {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

enum PageState {
  NoPhoto,
  PhotoTaken,
  Detecting,
  ManualAdjust,
  Cropped
}

@Component({
  selector: 'app-media-page',
  templateUrl: './media-page.page.html',
  styleUrls: ['./media-page.page.scss'],
})
export class MediaPagePage implements OnInit, AfterViewInit {
  public PageState = PageState;
  public currentState: PageState = PageState.NoPhoto;
  public capturedPhoto: string | null = null;
  public originalPhoto: string | null = null;
  public rotationAngle: number = 0;
  public isOpenCvReady = false;

  private detectedCorners: DetectedCorners | null = null;
  private adjustedCorners: DetectedCorners | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private imageRect: DOMRect | null = null;
  private draggingPoint: keyof DetectedCorners | null = null;
  private processingCanvas: HTMLCanvasElement | null = null;
  private isImageLoaded = false;

  public debugEdgesImage: string | null = null;
  public debugMorphedEdgesImage: string | null = null;
  public debugContoursImage: string | null = null;

  @ViewChild('imageContainer') imageContainerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('photoDisplay') photoDisplayRef!: ElementRef<HTMLImageElement>;
  @ViewChild('overlayCanvas') overlayCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('processingCanvas') processingCanvasRef!: ElementRef<HTMLCanvasElement>;


  constructor(private cdRef: ChangeDetectorRef) {
  }

  ngAfterViewInit() {
    this.processingCanvas = this.processingCanvasRef?.nativeElement ?? null;
    setTimeout(() => this.setupOverlayCanvas(), 0);
    window.addEventListener('opencvready', () => {
      console.log('OpenCV Ready Event empfangen');
      this.isOpenCvReady = true;
      this.cdRef.detectChanges();
    });
    if (!this.isOpenCvReady && typeof cv !== 'undefined' && (window as any).isOpenCvReady) {
      console.log("OpenCV war bereits bereit bei AfterViewInit.");
      this.isOpenCvReady = true;
      this.cdRef.detectChanges();
    }
  }

  private async loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
    });
  }

  checkCvReady() {
    if (!this.isOpenCvReady && typeof cv !== 'undefined') {
      console.warn("OpenCV war bereits definiert, setze isOpenCvReady.");
      this.isOpenCvReady = true;
      this.cdRef.detectChanges();
    }
    if (!this.isOpenCvReady) {
      setTimeout(() => {
        this.checkCvReady();
      }, 50);
    }
  }

  ngOnInit() {
    this.checkCvReady();
  }

  private setupOverlayCanvas() {
    if (this.overlayCanvasRef?.nativeElement) {
      console.log("Overlay Canvas Element initial gefunden.");
    } else {
      setTimeout(() => {
        if (this.overlayCanvasRef?.nativeElement) {
          console.log("Overlay Canvas Element verzögert gefunden.");
        } else {
          console.error("Overlay Canvas Element NICHT gefunden bei setupOverlayCanvas.");
        }
      }, 100);
    }
  }

  private resetState() {
    console.log("resetState aufgerufen.");
    this.capturedPhoto = null;
    this.originalPhoto = null;
    this.rotationAngle = 0;
    this.detectedCorners = null;
    this.adjustedCorners = null;
    this.currentState = PageState.NoPhoto;
    this.clearOverlay();
    this.draggingPoint = null;
    this.imageRect = null;
    this.isImageLoaded = false;
    this.cdRef.detectChanges();
  }

  public async takePhoto() {
    try {
      this.isImageLoaded = false;
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt
      });
      const base64 = `data:image/${image.format};base64,${image.base64String}`;
      this.originalPhoto = base64;
      this.capturedPhoto = base64;
      this.rotationAngle = 0;
      this.detectedCorners = null;
      this.adjustedCorners = null;
      this.currentState = PageState.PhotoTaken;
      this.cdRef.detectChanges();
    } catch (error) {
      console.error("Fehler beim Aufnehmen des Fotos:", error);
      if (error instanceof Error && error.message.toLowerCase().includes('cancelled')) {
        console.log("Fotoaufnahme abgebrochen.");
      } else {
        alert("Fehler beim Aufnehmen des Fotos: " + (error instanceof Error ? error.message : String(error)));
        this.resetState();
      }
    }
  }

  public onImageLoad() {
    console.log("IMG (load) event triggered.");
    this.isImageLoaded = true;
    if (this.currentState === PageState.ManualAdjust) {
      console.log("onImageLoad: Zustand ist ManualAdjust, rufe updateOverlaySize.");
      this.updateOverlaySize();
    } else {
      console.log("onImageLoad: Zustand ist NICHT ManualAdjust, tue nichts weiter.");
    }
  }

  public deletePhoto() {
    this.resetState();
  }

  public async onRotate() {
    if (!this.originalPhoto || this.currentState === PageState.ManualAdjust) return;
    this.isImageLoaded = false;
    try {
      const img = await this.loadImage(this.originalPhoto);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Kein 2D-Kontext verfügbar.");
      this.rotationAngle = (this.rotationAngle + 90) % 360;
      if (this.rotationAngle === 90 || this.rotationAngle === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((this.rotationAngle * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      this.originalPhoto = canvas.toDataURL("image/jpeg", 1.0);
      this.capturedPhoto = this.originalPhoto;
      this.cdRef.detectChanges();
    } catch (err) {
      console.error("Fehler beim Rotieren des Bildes:", err);
      this.isImageLoaded = true; // Zurücksetzen
    }
  }

  calculateMeanBrightness(grayMat: any): number {
    const mean = new cv.Mat();
    const stddev = new cv.Mat();
    cv.meanStdDev(grayMat, mean, stddev);
    const brightness = mean.doubleAt(0, 0);
    mean.delete();
    stddev.delete();
    return brightness;
  }

  public async detectDocument() {
    if (!this.originalPhoto || !this.processingCanvas || !this.isOpenCvReady) {
      alert("Bild oder OpenCV.js nicht verfügbar.");
      this.currentState = PageState.PhotoTaken;
      this.cdRef.detectChanges();
      return;
    }
    if (this.currentState === PageState.Detecting) return;

    this.currentState = PageState.Detecting;
    this.detectedCorners = null;
    this.adjustedCorners = null;
    this.clearOverlay();
    this.cdRef.detectChanges();

    const canvas = this.processingCanvas;
    try {
      const img = await this.loadImage(this.originalPhoto);
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Kein 2D-Kontext verfügbar.");
      ctx.drawImage(img, 0, 0);

      let src: any, gray: any, blurred: any, edges: any, contours: any,
        hierarchy: any, maxContour: any = null;

      const gaussianBlurKernelSize = new cv.Size(5, 5);

      const approxPolyEpsilonFactor = 0.02;
      const minContourAreaFactor = 0.1;
      const minAspectRatio = 0.5;
      const maxAspectRatio = 2.5;

      try {
        console.log("OpenCV: Lese Bild...");
        src = cv.imread(canvas);
        gray = new cv.Mat();
        blurred = new cv.Mat();
        edges = new cv.Mat();
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();

        console.log("OpenCV: Graustufen...");
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.equalizeHist(gray, gray);
        console.log("OpenCV: Gaussian Blur...");
        cv.GaussianBlur(gray, blurred, gaussianBlurKernelSize, 0);

        const meanBrightness = this.calculateMeanBrightness(gray);
        const cannyThreshold1 = Math.max(20, meanBrightness * 0.2);
        const cannyThreshold2 = Math.max(130, meanBrightness * 0.6);

        console.log(`OpenCV: Canny Edges (T1=${cannyThreshold1}, T2=${cannyThreshold2})...`);
        cv.Canny(blurred, edges, cannyThreshold1, cannyThreshold2);

        // Morphologische Operation: Kantenlücken schließen
        console.log("OpenCV: Morphologische Operation (Dilation)...");
        let dilated = new cv.Mat();
        let kernel = cv.Mat.ones(3, 3, cv.CV_8U); // 3x3 Kernel
        cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2); // 2 Iterationen
        console.log("OpenCV: Morphologische Operation (Erosion)...");
        cv.erode(dilated, edges, kernel, new cv.Point(-1, -1), 1); // 1 Iteration
        kernel.delete();
        dilated.delete();
        console.log("OpenCV: Konturensuche (auf Canny Edges, RETR_EXTERNAL)...");
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        // Debug: Kantenbild speichern
        const edgesCanvas = document.createElement('canvas');
        edgesCanvas.width = canvas.width;
        edgesCanvas.height = canvas.height;
        cv.imshow(edgesCanvas, edges);
        this.debugEdgesImage = edgesCanvas.toDataURL('image/jpeg', 0.8);
        console.log("Canny-Kanten gespeichert:", this.debugEdgesImage.substring(0, 50) + "...");

        // Debug: Kantenbild nach Morphologie speichern
        const morphedEdgesCanvas = document.createElement('canvas');
        morphedEdgesCanvas.width = canvas.width;
        morphedEdgesCanvas.height = canvas.height;
        cv.imshow(morphedEdgesCanvas, edges);
        this.debugMorphedEdgesImage = morphedEdgesCanvas.toDataURL('image/jpeg', 0.8);
        console.log("Kanten nach Morphologie gespeichert:", this.debugMorphedEdgesImage.substring(0, 50) + "...");

        // Debug: Alle Konturen zeichnen
        let contourImg = src.clone();
        cv.drawContours(contourImg, contours, -1, new cv.Scalar(0, 255, 0, 255), 2);
        const contourCanvas = document.createElement('canvas');
        contourCanvas.width = canvas.width;
        contourCanvas.height = canvas.height;
        cv.imshow(contourCanvas, contourImg);
        this.debugContoursImage = contourCanvas.toDataURL('image/jpeg', 0.8);
        console.log("Alle Konturen gespeichert:", this.debugContoursImage.substring(0, 50) + "...");
        contourImg.delete();

        // Konturen nach Fläche sortieren
        const contourAreas: { index: number; area: number }[] = [];
        for (let i = 0; i < contours.size(); i++) {
          const area = cv.contourArea(contours.get(i));
          contourAreas.push({index: i, area});
        }
        contourAreas.sort((a, b) => b.area - a.area);
        console.log(`Konturen gefunden: ${contours.size()}. Sortierte Flächen:`, contourAreas.map(c => c.area.toFixed(0)));

        // Sammle gültige Konturen für Debug-Bild
        let validContours = new cv.MatVector();
        let maxArea = 0;
        let foundContour: any = null;
        const minArea = img.width * img.height * minContourAreaFactor;
        console.log(`Filterung (minArea=${minArea.toFixed(0)})...`);

        for (const {index} of contourAreas) {
          const contour = contours.get(index);
          const area = cv.contourArea(contour);
          console.log(`Kontur ${index}: Fläche=${area.toFixed(0)} (minArea=${minArea.toFixed(0)})`);

          if (area < minArea) {
            console.log(` - Abgelehnt: Fläche zu klein`);
            continue;
          }

          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, approxPolyEpsilonFactor * peri, true);
          console.log(` - Ecken nach approxPolyDP: ${approx.rows}`);

          if (approx.rows !== 4) {
            console.log(` - Abgelehnt: Kein Viereck (${approx.rows} Ecken)`);
            approx.delete();
            continue;
          }

          if (!cv.isContourConvex(approx)) {
            console.log(` - Abgelehnt: Nicht konvex`);
            approx.delete();
            continue;
          }

          const rect = cv.boundingRect(approx);
          if (rect.height === 0) {
            console.log(` - Abgelehnt: Ungültiges Rechteck (Höhe=0)`);
            approx.delete();
            continue;
          }

          const aspectRatio = rect.width / rect.height;
          const isValidAspectRatio =
            (aspectRatio >= minAspectRatio && aspectRatio <= maxAspectRatio) ||
            (1 / aspectRatio >= minAspectRatio && 1 / aspectRatio <= maxAspectRatio);
          console.log(` - Aspektverhältnis: ${aspectRatio.toFixed(2)} (gültig: ${minAspectRatio}-${maxAspectRatio})`);

          if (!isValidAspectRatio) {
            console.log(` - Abgelehnt: Ungültiges Aspektverhältnis`);
            approx.delete();
            continue;
          }

          console.log(` - Gültige Kontur! Fläche=${area.toFixed(0)}, AR=${aspectRatio.toFixed(2)}`);
          validContours.push_back(approx.clone()); // Für Debug-Bild
          if (area > maxArea) {
            maxArea = area;
            if (foundContour) foundContour.delete();
            foundContour = approx.clone();
          }
          approx.delete();
        }

        // Debug: Gültige Konturen zeichnen
        let validContourImg = src.clone();
        cv.drawContours(validContourImg, validContours, -1, new cv.Scalar(255, 0, 0, 255), 3);
        const validContourCanvas = document.createElement('canvas');
        validContourCanvas.width = canvas.width;
        validContourCanvas.height = canvas.height;
        cv.imshow(validContourCanvas, validContourImg);
        this.debugContoursImage = validContourCanvas.toDataURL('image/jpeg', 0.8); // Überschreibt mit gültigen Konturen
        console.log("Gültige Konturen gespeichert:", this.debugContoursImage.substring(0, 50) + "...");
        validContourImg.delete();
        validContours.delete();

        if (!foundContour) {
          console.log("No suitable contour found after filtering. Initializing default corners.");
          const defaultCorners: DetectedCorners = {
            topLeft: { x: 0, y: 0 },
            topRight: { x: img.width, y: 0 },
            bottomRight: { x: img.width, y: img.height },
            bottomLeft: { x: 0, y: img.height }
          };
          this.detectedCorners = JSON.parse(JSON.stringify(defaultCorners));
          this.adjustedCorners = JSON.parse(JSON.stringify(defaultCorners));

          console.log("Setting state to ManualAdjust with default corners:", this.adjustedCorners);
          this.currentState = PageState.ManualAdjust;

          this.cdRef.detectChanges();
          await new Promise(resolve => setTimeout(resolve, 50));
          this.updateOverlaySize();
        } else {
          console.log("Erfolgreichste Kontur ausgewählt.");
          maxContour = foundContour;
          const pts: Point[] = [];
          for (let i = 0; i < 4; i++) {
            pts.push({
              x: maxContour.intPtr(i, 0)[0],
              y: maxContour.intPtr(i, 0)[1]
            });
          }
          pts.sort((a, b) => a.y - b.y);
          const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
          const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
          this.detectedCorners = {
            topLeft: top[0],
            topRight: top[1],
            bottomRight: bottom[1],
            bottomLeft: bottom[0],
          };
          this.adjustedCorners = JSON.parse(JSON.stringify(this.detectedCorners));
          console.log("Setze Status auf ManualAdjust. Ecken:", this.detectedCorners);
          this.currentState = PageState.ManualAdjust;
          this.cdRef.detectChanges();
          await new Promise(resolve => setTimeout(resolve, 50));
          this.updateOverlaySize();
        }
      } catch (cvError) {
        console.error("OpenCV Fehler während der Erkennung:", cvError);
        alert("Ein Fehler ist bei der Bildverarbeitung aufgetreten.");
        this.currentState = PageState.PhotoTaken;
      } finally {
        console.log("Gebe OpenCV Objekte frei...");
        [src, gray, blurred, edges, /*contours,*/ hierarchy, maxContour].filter(m => m && typeof m.delete === 'function' && !m.isDeleted()).forEach(m => {
          try {
            m.delete();
          } catch (e) {
            console.error("Fehler beim Löschen von Mat:", e);
          }
        });
        if (contours && typeof contours.delete === 'function' && !contours.isDeleted()) {
          try {
            contours.delete();
          } catch (e) {
            console.error("Fehler beim Löschen von contours MatVector:", e);
          }
        }
        if (hierarchy && typeof hierarchy.delete === 'function' && !hierarchy.isDeleted()) {
          try {
            hierarchy.delete();
          } catch (e) {
            console.error("Fehler beim Löschen von hierarchy Mat:", e);
          }
        }
        console.log("OpenCV Objekte freigegeben.");
        this.cdRef.detectChanges();
      }
    } catch (err) {
      console.error("Fehler beim Laden des Bildes:", err);
      alert("Bild konnte nicht geladen werden.");
      this.currentState = PageState.PhotoTaken;
      this.cdRef.detectChanges();
    }
  }

  public async applyPerspectiveTransform() {
    if (!this.isOpenCvReady || !this.originalPhoto || !this.processingCanvas || !this.adjustedCorners) {
      return;
    }
    console.log("Starte applyPerspectiveTransform...");
    const canvas = this.processingCanvas;

    const img = await this.loadImage(this.originalPhoto);
    console.log("Bild für Transformation geladen.");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    let src: any, dst: any, M: any, srcCoords: any, dstCoords: any;
    try {
      src = cv.imread(canvas);
      const {
        topLeft,
        topRight,
        bottomRight,
        bottomLeft
      } = this.adjustedCorners!;
      console.log("Angepasste Ecken:", this.adjustedCorners);
      const srcPoints = [topLeft.x, topLeft.y, topRight.x, topRight.y, bottomRight.x, bottomRight.y, bottomLeft.x, bottomLeft.y];
      srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, srcPoints);
      const widthA = Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y);
      const widthB = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
      const maxWidth = Math.max(widthA, widthB);
      const heightA = Math.hypot(topRight.x - bottomRight.x, topRight.y - bottomRight.y);
      const heightB = Math.hypot(topLeft.x - bottomLeft.x, topLeft.y - bottomLeft.y);
      const maxHeight = Math.max(heightA, heightB);
      console.log(`Zielgröße: ${maxWidth.toFixed(0)}x${maxHeight.toFixed(0)}`);
      const dstPoints = [0, 0, maxWidth - 1, 0, maxWidth - 1, maxHeight - 1, 0, maxHeight - 1];
      dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, dstPoints);
      console.log("Berechne Matrix...");
      M = cv.getPerspectiveTransform(srcCoords, dstCoords);
      dst = new cv.Mat();
      const dsize = new cv.Size(maxWidth, maxHeight);
      console.log("Wende warpPerspective an...");
      cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 255));
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = maxWidth;
      tempCanvas.height = maxHeight;
      console.log("Zeige auf temp Canvas...");
      cv.imshow(tempCanvas, dst);
      console.log("Konvertiere zu Base64...");
      const resultBase64 = tempCanvas.toDataURL('image/jpeg', 0.9);
      console.log(`Ergebnis Base64 Länge: ${resultBase64.length}, Start: ${resultBase64.substring(0, 30)}...`);
      this.capturedPhoto = resultBase64;
      this.currentState = PageState.Cropped;
      this.detectedCorners = null;
      this.adjustedCorners = null;
      this.clearOverlay();
      console.log("Transformation abgeschlossen, Zustand: Cropped");
      this.cdRef.detectChanges();
      console.log("Change Detection nach Transformation durchgeführt.");
    } catch (cvError) {
      console.error("OpenCV Fehler bei Transformation:", cvError);
      alert("Fehler bei der Bildtransformation.");
      this.currentState = PageState.ManualAdjust;
    } finally {
      console.log("Gebe Transformations-Objekte frei...");
      [src, dst, M, srcCoords, dstCoords].filter(m => m && typeof m.delete === 'function' && !m.isDeleted()).forEach(m => {
        try {
          m.delete();
        } catch (e) {
          console.error("Fehler beim Löschen von Mat:", e);
        }
      });
      this.cdRef.detectChanges();
    }
  }

  public updateOverlaySize() {
    console.log("updateOverlaySize aufgerufen. Status:", this.currentState);
    const imageElement = this.photoDisplayRef?.nativeElement;
    const isImageReady = this.isImageLoaded || (imageElement?.complete && imageElement?.naturalWidth > 0);
    if (!isImageReady || this.currentState !== PageState.ManualAdjust) {
      console.log("updateOverlaySize: Bedingungen nicht erfüllt.");
      this.clearOverlay();
      return;
    }
    setTimeout(() => {
      const photoElement = this.photoDisplayRef?.nativeElement;
      const overlayElement = this.overlayCanvasRef?.nativeElement;
      if (overlayElement && photoElement && photoElement.offsetParent) {
        this.imageRect = photoElement.getBoundingClientRect();
        console.log("imageRect (raw):", this.imageRect);

        // Berechne die tatsächliche Bildgröße im Container
        const naturalWidth = photoElement.naturalWidth;
        const naturalHeight = photoElement.naturalHeight;
        const containerWidth = this.imageRect.width;
        const containerHeight = this.imageRect.height;
        const imgRatio = naturalWidth / naturalHeight;
        const containerRatio = containerWidth / containerHeight;

        let displayWidth, displayHeight, offsetX, offsetY;
        if (imgRatio > containerRatio) {
          // Bild wird horizontal eingepasst
          displayWidth = containerWidth;
          displayHeight = containerWidth / imgRatio;
          offsetX = 0;
          offsetY = (containerHeight - displayHeight) / 2;
        } else {
          // Bild wird vertikal eingepasst
          displayHeight = containerHeight;
          displayWidth = containerHeight * imgRatio;
          offsetX = (containerWidth - displayWidth) / 2;
          offsetY = 0;
        }

        console.log(`Display: ${displayWidth}x${displayHeight}, Offset: (${offsetX}, ${offsetY})`);

        const canvas = overlayElement;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = containerWidth * dpr;
        canvas.height = containerHeight * dpr;
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${containerHeight}px`;
        this.overlayCtx = canvas.getContext('2d');
        if (this.overlayCtx) {
          this.overlayCtx.scale(dpr, dpr);
          // Speichere Skalierung und Offset für drawOverlay
          this.imageRect = {
            width: displayWidth,
            height: displayHeight,
            left: this.imageRect.left + offsetX,
            top: this.imageRect.top + offsetY,
            right: this.imageRect.left + offsetX + displayWidth,
            bottom: this.imageRect.top + offsetY + displayHeight,
          } as DOMRect;
          console.log("Angepasstes imageRect:", this.imageRect);
          if (this.currentState === PageState.ManualAdjust) {
            this.drawOverlay();
          } else {
            this.clearOverlay();
          }
        }
      } else {
        console.warn("Overlay oder Foto nicht gefunden.");
        this.imageRect = null;
        this.clearOverlay();
      }
    }, 50);
  }

  public drawOverlay() {
    console.log("--- drawOverlay START ---");
    if (!this.overlayCtx || !this.adjustedCorners || !this.imageRect || !this.photoDisplayRef?.nativeElement) {
      console.error("drawOverlay ABBRUCH: Voraussetzungen nicht erfüllt.");
      this.clearOverlay();
      return;
    }
    const ctx = this.overlayCtx;
    const canvas = ctx.canvas;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    const img = this.photoDisplayRef.nativeElement;
    console.log(`Bildmaße (natural): ${img.naturalWidth}x${img.naturalHeight}`);
    console.log(`imageRect: ${this.imageRect.width}x${this.imageRect.height} @ left=${this.imageRect.left}, top=${this.imageRect.top}`);

    const scaleX = this.imageRect.width / img.naturalWidth;
    const scaleY = this.imageRect.height / img.naturalHeight;
    console.log(`Skalierungsfaktoren: scaleX=${scaleX.toFixed(3)}, scaleY=${scaleY.toFixed(3)}`);

    const corners = this.adjustedCorners;
    console.log("Ecken (Originalkoordinaten):", JSON.stringify(corners));

    // Test: Zeichne ein rotes Kreuz in der Bildmitte
    const centerX = img.naturalWidth / 2 * scaleX;
    const centerY = img.naturalHeight / 2 * scaleY;
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2 / dpr;
    ctx.beginPath();
    ctx.moveTo(centerX - 20, centerY);
    ctx.lineTo(centerX + 20, centerY);
    ctx.moveTo(centerX, centerY - 20);
    ctx.lineTo(centerX, centerY + 20);
    ctx.stroke();
    console.log(`Testkreuz bei: (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);

    // Rest des Codes bleibt gleich
    const cornerKeys: (keyof DetectedCorners)[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.lineWidth = 5 / dpr;
    ctx.beginPath();
    const p1 = {x: corners.topLeft.x * scaleX, y: corners.topLeft.y * scaleY};
    const p2 = {x: corners.topRight.x * scaleX, y: corners.topRight.y * scaleY};
    const p3 = {
      x: corners.bottomRight.x * scaleX,
      y: corners.bottomRight.y * scaleY
    };
    const p4 = {
      x: corners.bottomLeft.x * scaleX,
      y: corners.bottomLeft.y * scaleY
    };
    console.log("Skalierte Punkte:", {p1, p2, p3, p4});
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.stroke();

    const handleRadius = 15 / dpr;
    ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
    cornerKeys.forEach(key => {
      const point = corners[key];
      const sx = point.x * scaleX;
      const sy = point.y * scaleY;
      ctx.beginPath();
      ctx.arc(sx, sy, handleRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(sx, sy, handleRadius * 0.4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
    });
    console.log("--- drawOverlay ENDE ---");
  }

  public clearOverlay() {
    if (!this.overlayCtx) {
      return;
    }
    const canvas = this.overlayCtx.canvas;
    const dpr = window.devicePixelRatio || 1;
    this.overlayCtx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  public startDrag(event: MouseEvent | TouchEvent) {
    if (this.currentState !== PageState.ManualAdjust || !this.adjustedCorners || !this.imageRect) return;
    event.preventDefault();
    event.stopPropagation();
    console.log("--- startDrag START ---");
    const touch = (event as TouchEvent).changedTouches?.[0];
    const clientX = touch ? touch.clientX : (event as MouseEvent).clientX;
    const clientY = touch ? touch.clientY : (event as MouseEvent).clientY;
    console.log(`Event Coords (Client): X=${clientX.toFixed(1)}, Y=${clientY.toFixed(1)}`);
    console.log(`Image Rect: left=${this.imageRect.left.toFixed(1)}, top=${this.imageRect.top.toFixed(1)}, width=${this.imageRect.width.toFixed(1)}, height=${this.imageRect.height.toFixed(1)}`);
    const currentPoint = this.getCanvasPoint(event);
    if (!currentPoint) {
      console.warn("startDrag: getCanvasPoint lieferte null.");
      console.log("--- startDrag ENDE (Fehler) ---");
      return;
    }
    console.log(`Bild Coords (berechnet): X=${currentPoint.x.toFixed(1)}, Y=${currentPoint.y.toFixed(1)}`);
    const img = this.photoDisplayRef.nativeElement;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const scaleX = this.imageRect.width / img.naturalWidth;
    const scaleY = this.imageRect.height / img.naturalHeight;
    if (isNaN(scaleX) || isNaN(scaleY) || scaleX <= 0 || scaleY <= 0) return;
    const handleHitRadius = 25;
    const toleranceX = handleHitRadius / scaleX;
    const toleranceY = handleHitRadius / scaleY;
    let minDistanceSq = toleranceX * toleranceX + toleranceY * toleranceY;
    let closestPointKey: keyof DetectedCorners | null = null;
    console.log(`Suche nächsten Punkt (Toleranz: X=${toleranceX.toFixed(1)}, Y=${toleranceY.toFixed(1)})...`);
    for (const key in this.adjustedCorners) {
      const corner = this.adjustedCorners[key as keyof DetectedCorners];
      const dx = currentPoint.x - corner.x;
      const dy = currentPoint.y - corner.y;
      const distanceSq = dx * dx + dy * dy;
      console.log(` - Distanz zu ${key} (${corner.x.toFixed(0)}, ${corner.y.toFixed(0)}): dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}, distSq=${distanceSq.toFixed(1)} (min=${minDistanceSq.toFixed(1)})`);
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestPointKey = key as keyof DetectedCorners;
      }
    }
    if (closestPointKey) {
      this.draggingPoint = closestPointKey;
      console.log(`Starte Drag von Punkt: ${this.draggingPoint}`);
      if (this.overlayCanvasRef?.nativeElement) this.overlayCanvasRef.nativeElement.style.cursor = 'grabbing';
    } else {
      console.log("Kein Punkt innerhalb der Toleranz gefunden.");
      if (this.overlayCanvasRef?.nativeElement) this.overlayCanvasRef.nativeElement.style.cursor = 'grab';
    }
    console.log("--- startDrag ENDE ---");
  }

  public dragPoint(event: MouseEvent | TouchEvent) {
    if (this.currentState !== PageState.ManualAdjust || !this.draggingPoint || !this.adjustedCorners) return;
    event.preventDefault();
    event.stopPropagation();
    const currentPoint = this.getCanvasPoint(event);
    if (!currentPoint) return;
    this.adjustedCorners[this.draggingPoint] = currentPoint;
    this.drawOverlay();
  }

  public endDrag(event: MouseEvent | TouchEvent) {
    if (this.currentState !== PageState.ManualAdjust || !this.draggingPoint) return;
    event.preventDefault();
    event.stopPropagation();
    console.log("Beende Drag von:", this.draggingPoint);
    this.draggingPoint = null;
    if (this.overlayCanvasRef?.nativeElement) {
      this.overlayCanvasRef.nativeElement.style.cursor = 'grab';
    }
  }

  public cancelAdjust() {
    if (this.detectedCorners) {
      this.adjustedCorners = JSON.parse(JSON.stringify(this.detectedCorners));
      this.currentState = PageState.ManualAdjust;
      this.drawOverlay();
    } else {
      this.currentState = PageState.PhotoTaken;
      this.clearOverlay();
    }
    this.draggingPoint = null;
    this.cdRef.detectChanges();
  }


  public onFilter() {
    console.log('Filter anwenden (nicht implementiert)');
  }

  public onSave() {
    if (this.capturedPhoto && (this.currentState === PageState.Cropped || this.currentState === PageState.PhotoTaken)) {
      alert("Bild gespeichert (simuliert).");
    } else {
      alert("Kein finales Bild zum Speichern vorhanden.");
    }
  }

  private getCanvasPoint(event: MouseEvent | TouchEvent): Point | null {
    if (!this.imageRect || !this.photoDisplayRef?.nativeElement) {
      console.warn("getCanvasPoint: imageRect oder photoDisplayRef nicht verfügbar.");
      return null;
    }
    const img = this.photoDisplayRef.nativeElement;
    if (!img.naturalWidth || !img.naturalHeight || !this.imageRect.width || !this.imageRect.height) {
      console.warn("getCanvasPoint: naturalWidth/Height oder imageRect.width/height nicht verfügbar.");
      return null;
    }
    const touch = (event as TouchEvent).changedTouches?.[0];
    const clientX = touch ? touch.clientX : (event as MouseEvent).clientX;
    const clientY = touch ? touch.clientY : (event as MouseEvent).clientY;
    const rectX = clientX - this.imageRect.left;
    const rectY = clientY - this.imageRect.top;
    const scaleX = img.naturalWidth / this.imageRect.width;
    const scaleY = img.naturalHeight / this.imageRect.height;
    if (isNaN(scaleX) || isNaN(scaleY) || scaleX <= 0 || scaleY <= 0) {
      console.warn("getCanvasPoint: Ungültige Skalierungsfaktoren.");
      return null;
    }
    let imageX = rectX * scaleX;
    let imageY = rectY * scaleY;
    imageX = Math.max(0, Math.min(img.naturalWidth, imageX));
    imageY = Math.max(0, Math.min(img.naturalHeight, imageY));
    return {x: imageX, y: imageY};
  }

  @HostListener('window:resize')
  public onWindowResize() {
    console.log("Window Resize erkannt.");
    if (this.currentState !== PageState.NoPhoto && this.currentState !== PageState.Detecting) {
      this.updateOverlaySize();
    }
  }
}
