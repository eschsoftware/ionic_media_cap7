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
  Cropped,
  Fullscreen
}

interface DetectionResult {
  corners: DetectedCorners | null;
  confidence: number;
}

interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angle: number;
  length: number;
  midX: number;
  midY: number;
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
  public hasUserAdjusted: boolean = false;
  public fullscreenBelowHeader: boolean = true;
  public isClosingFullscreen: boolean = false;

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
  public debugAdaptiveThresholdImage: string | null = null;
  public debugMorphedImage: string | null = null;

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

  async resetFromPhoto() {
    console.log("resetFromPhoto aufgerufen");
    this.capturedPhoto = this.originalPhoto;
    this.detectedCorners = null;
    this.adjustedCorners = null;
    this.currentState = PageState.NoPhoto;
    this.clearOverlay();
    this.draggingPoint = null;
    this.imageRect = null;
    this.isImageLoaded = false;
    this.cdRef.detectChanges();

    await this.detectDocument();
  }

  private resetState() {
    console.log("resetState aufgerufen.");
    this.capturedPhoto = null;
    this.originalPhoto = null;
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
      this.detectedCorners = null;
      this.adjustedCorners = null;
      this.currentState = PageState.PhotoTaken;
      this.cdRef.detectChanges();
      await this.detectDocument();
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
    if (!this.capturedPhoto) return;
    this.isImageLoaded = false;
    try {
      const img = await this.loadImage(this.capturedPhoto);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Kein 2D-Kontext verfügbar.");
      canvas.width = img.height;
      canvas.height = img.width;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      this.originalPhoto = canvas.toDataURL("image/jpeg", 1.0);
      this.capturedPhoto = this.originalPhoto;
      this.cdRef.detectChanges();
    } catch (err) {
      console.error("Fehler beim Rotieren des Bildes:", err);
      this.isImageLoaded = true; // Zurücksetzen
    }
    await this.cancelAdjust();
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

  isContourAtEdge(contour: any, canvasWidth: any, canvasHeight: any) {
    const margin = Math.max(5, canvasWidth * 0.02);
    for (let i = 0; i < contour.rows; i++) {
      const pt = {
        x: contour.intPtr(i, 0)[0],
        y: contour.intPtr(i, 0)[1]
      };
      if (pt.x < margin || pt.x > canvasWidth - margin ||
        pt.y < margin || pt.y > canvasHeight - margin) {
        return true;
      }
    }
    return false;
  }

  private async standardDocumentDetection(img: HTMLImageElement, canvas: HTMLCanvasElement): Promise<DetectionResult> {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Kein 2D-Kontext verfügbar.");
    ctx.drawImage(img, 0, 0);

    let src, gray, blurred, edges, contours, hierarchy, maxContour = null;
    try {
      src = cv.imread(canvas);
      gray = new cv.Mat();
      blurred = new cv.Mat();
      edges = new cv.Mat();
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.equalizeHist(gray, gray);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

      const meanBrightness = this.calculateMeanBrightness(gray);
      const cannyThreshold1 = Math.max(20, meanBrightness * 0.2);
      const cannyThreshold2 = Math.max(130, meanBrightness * 0.6);
      cv.Canny(blurred, edges, cannyThreshold1, cannyThreshold2);

      let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      let dilated = new cv.Mat();
      cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2);
      cv.erode(dilated, edges, kernel, new cv.Point(-1, -1), 1);
      kernel.delete();
      dilated.delete();

      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const minArea = img.width * img.height * 0.1;
      const minAspectRatio = 0.5;
      const maxAspectRatio = 2.5;

      let maxArea = 0;
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        if (area < minArea) continue;

        const peri = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const rect = cv.boundingRect(approx);
          if (rect.height === 0) {
            approx.delete();
            continue;
          }
          const aspectRatio = rect.width / rect.height;
          const isValidAspectRatio =
            (aspectRatio >= minAspectRatio && aspectRatio <= maxAspectRatio) ||
            (1 / aspectRatio >= minAspectRatio && 1 / aspectRatio <= maxAspectRatio);
          if (isValidAspectRatio && area > maxArea) {
            maxArea = area;
            if (maxContour) maxContour.delete();
            maxContour = approx.clone();
          }
        }
        approx.delete();
      }

      if (!maxContour) {
        return {corners: null, confidence: 0};
      }

      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 4; i++) {
        pts.push({
          x: maxContour.intPtr(i, 0)[0],
          y: maxContour.intPtr(i, 0)[1]
        });
      }
      pts.sort((a, b) => a.y - b.y);
      const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
      const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
      const corners: DetectedCorners = {
        topLeft: top[0],
        topRight: top[1],
        bottomRight: bottom[1],
        bottomLeft: bottom[0],
      };
      const confidence = maxArea / (img.width * img.height);
      return {corners, confidence};
    } finally {
      [src, gray, blurred, edges, hierarchy, maxContour]
        .filter(m => m && typeof m.delete === 'function' && !m.isDeleted())
        .forEach(m => m.delete());
      if (contours && !contours.isDeleted()) contours.delete();
    }
  }

  private matToDataUrl(mat: any): string {
    const tempCanvas = document.createElement("canvas");
    cv.imshow(tempCanvas, mat); // Use cv.imshow to draw mat onto canvas
    return tempCanvas.toDataURL("image/png");
  }

  private async receiptDetection(
    img: HTMLImageElement,
    canvas: HTMLCanvasElement
  ): Promise<DetectionResult> {
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    if (!ctx) throw new Error("Could not get 2D context.");

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let thresh = new cv.Mat();
    let morphed = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    let debugContoursMat = src.clone();

    try {

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);

      const blockSize = 15;
      const C = 7;
      cv.adaptiveThreshold(
        blurred,
        thresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        blockSize,
        C
      );
      this.debugAdaptiveThresholdImage = this.matToDataUrl(thresh);

      const kernelSize = 3;
      const iterations = 3;
      let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize));
      cv.dilate(thresh, morphed, kernel, new cv.Point(-1, -1), iterations);
      cv.erode(morphed, morphed, kernel, new cv.Point(-1, -1), iterations);
      kernel.delete();
      this.debugMorphedImage = this.matToDataUrl(morphed);

      cv.findContours(
        morphed,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      );

      const minArea = canvas.width * canvas.height * 0.03;
      const maxAreaThreshold = canvas.width * canvas.height * 0.95;
      const minAspectRatio = 0.05;
      const maxAspectRatio = 20;

      let bestRect: any;
      let maxFoundArea = 0;

      const contourColor = new cv.Scalar(0, 255, 0, 255);
      const potentialColor = new cv.Scalar(0, 0, 255, 255);

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        if (area < minArea || area > maxAreaThreshold) {
          contour.delete();
          continue;
        }

        const rotatedRect = cv.minAreaRect(contour);
        const points = cv.RotatedRect.points(rotatedRect);
        const boundingArea = rotatedRect.size.width * rotatedRect.size.height;

        if (rotatedRect.size.height === 0 || rotatedRect.size.width === 0) {
          contour.delete();
          continue;
        }

        const aspectRatio = Math.max(rotatedRect.size.width / rotatedRect.size.height, rotatedRect.size.height / rotatedRect.size.width);

        if (aspectRatio >= minAspectRatio && aspectRatio <= maxAspectRatio) {

          for (let j = 0; j < 4; j++) {
            cv.line(debugContoursMat, points[j], points[(j + 1) % 4], potentialColor, 2);
          }

          if (boundingArea > maxFoundArea) {
            maxFoundArea = boundingArea;
            bestRect = rotatedRect;
          }
        }
        contour.delete();
      }

      if (bestRect) {
        const points = cv.RotatedRect.points(bestRect);
        for (let j = 0; j < 4; j++) {
          cv.line(debugContoursMat, points[j], points[(j + 1) % 4], contourColor, 3);
        }
      }
      this.debugContoursImage = this.matToDataUrl(debugContoursMat);

      if (!bestRect) {
        console.log("Receipt Detection: No suitable minAreaRect found.");
        return {corners: null, confidence: 0};
      }

      const boxPoints = cv.RotatedRect.points(bestRect);
      let pts: Point[] = boxPoints.map((p: any) => ({x: p.x, y: p.y}));

      pts.sort((a, b) => a.y - b.y);
      const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
      const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);

      const corners: DetectedCorners = {
        topLeft: top[0],
        topRight: top[1],
        bottomRight: bottom[1],
        bottomLeft: bottom[0],
      };

      const confidence = maxFoundArea / (canvas.width * canvas.height);

      console.log(`Receipt Detection: Found minAreaRect with area ${maxFoundArea.toFixed(0)}, Confidence: ${confidence.toFixed(3)}`);
      return {corners, confidence};

    } catch (error) {
      console.error("Error during receipt detection:", error);
      this.debugAdaptiveThresholdImage = null;
      this.debugMorphedImage = null;
      this.debugContoursImage = null;
      return {corners: null, confidence: 0};
    } finally {
      [
        src, gray, blurred, thresh, morphed, hierarchy, debugContoursMat
      ]
        .filter(m => m && !m.isDeleted())
        .forEach(m => m.delete());
      if (contours && !contours.isDeleted()) contours.delete();
      console.log("Receipt Detection: OpenCV Mats cleaned up.");
    }
  }

  calculateCombinedConfidence(
    area: number,
    aspectRatio: number,
    centerX: number,
    centerY: number,
    canvasWidth: number,
    canvasHeight: number
  ): number {
    // Flächen-Score (normalisiert zur Bildfläche)
    const areaScore = area / (canvasWidth * canvasHeight);

    // Aspektverhältnis-Score (1, wenn zwischen 0.5 und 2.0, sonst 0)
    const aspectScore = (aspectRatio >= 0.5 && aspectRatio <= 2.0) ? 1 : 0;

    // Zentralitäts-Score (Abstand zum Bildzentrum relativ zur maximalen Distanz)
    const imageCenterX = canvasWidth / 2;
    const imageCenterY = canvasHeight / 2;
    const distanceToCenter = Math.sqrt(
      Math.pow(centerX - imageCenterX, 2) + Math.pow(centerY - imageCenterY, 2)
    );
    const maxDistance = Math.sqrt(
      Math.pow(canvasWidth / 2, 2) + Math.pow(canvasHeight / 2, 2)
    );
    const centralityScore = 1 - (distanceToCenter / maxDistance);

    // Kombinierte Confidence (gewichtete Summe)
    const confidence =
      (areaScore * 0.4) + (aspectScore * 0.3) + (centralityScore * 0.3);
    return Math.min(1, Math.max(0, confidence)); // Begrenze zwischen 0 und 1
  }

  public async receiptDetectionV3(
    img: HTMLImageElement,
    canvas: HTMLCanvasElement
  ): Promise<DetectionResult> {
    console.log("Starting Receipt Detection V3");
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    if (!ctx) throw new Error("Could not get 2D context.");

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    let debugContoursMat = src.clone();

    let edges = new cv.Mat();
    let morphedEdges = new cv.Mat();
    let largestContour = new cv.Mat();
    let bestQuadApprox = new cv.Mat();

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      let normalizedGray = new cv.Mat();
      cv.normalize(gray, normalizedGray, 0, 255, cv.NORM_MINMAX, -1);

      cv.GaussianBlur(normalizedGray, blurred, new cv.Size(5, 5), 0);

      const meanBrightness = this.calculateMeanBrightness(normalizedGray);
      const cannyThreshold1 = Math.max(30, meanBrightness * 0.25);
      const cannyThreshold2 = Math.max(150, meanBrightness * 0.7);
      cv.Canny(blurred, edges, cannyThreshold1, cannyThreshold2);
      // --- Debug: Save Canny edges ---
      this.debugEdgesImage = this.matToDataUrl(edges);

      const kernelSize = 3;
      let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize));
      cv.dilate(edges, morphedEdges, kernel, new cv.Point(-1, -1), 2); // Dilate more
      cv.erode(morphedEdges, morphedEdges, kernel, new cv.Point(-1, -1), 1); // Erode less
      kernel.delete();

      this.debugMorphedEdgesImage = this.matToDataUrl(morphedEdges);

      cv.findContours(
        morphedEdges,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE
      );

      const minArea = canvas.width * canvas.height * 0.03;
      const maxAreaThreshold = canvas.width * canvas.height * 0.95;
      const minAspectRatio = 0.05;
      const maxAspectRatio = 20;

      let maxAreaFound = 0;
      let maxQuadAreaFound = 0;

      const quadColor = new cv.Scalar(255, 0, 0, 255);
      const finalQuadColor = new cv.Scalar(0, 255, 0, 255);
      const fallbackRectColor = new cv.Scalar(0, 255, 255, 255);

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        if (area < minArea || area > maxAreaThreshold) {
          contour.delete();
          continue;
        }

        if (area > maxAreaFound) {
          maxAreaFound = area;
          if (largestContour) largestContour.delete();
          largestContour = contour.clone();
        }

        const peri = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * peri, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const rect = cv.boundingRect(approx);

          if (rect.height > 0 && rect.width > 0) {
            const currentAspectRatio = rect.width / rect.height;
            const isValidAspectRatio =
              (currentAspectRatio >= minAspectRatio && currentAspectRatio <= maxAspectRatio) ||
              (1 / currentAspectRatio >= minAspectRatio && 1 / currentAspectRatio <= maxAspectRatio);

            if (isValidAspectRatio) {
              let pointsVec = new cv.MatVector();
              pointsVec.push_back(approx);
              cv.drawContours(debugContoursMat, pointsVec, 0, quadColor, 2);
              pointsVec.delete();

              if (area > maxQuadAreaFound) {
                maxQuadAreaFound = area;
                if (bestQuadApprox) bestQuadApprox.delete();
                bestQuadApprox = approx.clone();
              }
            }
          }
        }
        approx.delete();
        contour.delete();
      }

      let resultCorners: DetectedCorners | null = null;
      let resultConfidence: number = 0;
      let detectionMethod: string = "None";

      if (bestQuadApprox) {
        detectionMethod = "Quadrilateral Approximation";
        const pts: Point[] = [];
        for (let i = 0; i < bestQuadApprox.rows; i++) {
          pts.push({
            x: bestQuadApprox.data32S[i * 2],
            y: bestQuadApprox.data32S[i * 2 + 1]
          });
        }
        // Sort corners
        pts.sort((a, b) => a.y - b.y);
        const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
        resultCorners = {
          topLeft: top[0], topRight: top[1],
          bottomRight: bottom[1], bottomLeft: bottom[0],
        };


        // Area
        const area = maxQuadAreaFound;

        // Aspect ratio
        const width = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
        const height = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y));
        const aspectRatio = width / height;

        // Centricity
        const centerX = pts.reduce((sum, p) => sum + p.x, 0) / 4;
        const centerY = pts.reduce((sum, p) => sum + p.y, 0) / 4;

        resultConfidence = this.calculateCombinedConfidence(
          area,
          aspectRatio,
          centerX,
          centerY,
          canvas.width,
          canvas.height
        );

        let pointsVec = new cv.MatVector();
        pointsVec.push_back(bestQuadApprox);
        cv.drawContours(debugContoursMat, pointsVec, 0, finalQuadColor, 3);
        pointsVec.delete();

      } else if (largestContour) {
        detectionMethod = "MinAreaRect Fallback";
        const rotatedRect = cv.minAreaRect(largestContour);
        const boundingArea = rotatedRect.size.width * rotatedRect.size.height;

        if (rotatedRect.size.height > 0 && rotatedRect.size.width > 0) {
          const fallbackAspectRatio = Math.max(rotatedRect.size.width / rotatedRect.size.height, rotatedRect.size.height / rotatedRect.size.width);
          if (fallbackAspectRatio >= minAspectRatio && fallbackAspectRatio <= maxAspectRatio) {
            const boxPoints = cv.RotatedRect.points(rotatedRect);
            let pts: Point[] = boxPoints.map((p: any) => ({x: p.x, y: p.y}));
            pts.sort((a, b) => a.y - b.y);
            const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
            const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
            resultCorners = {
              topLeft: top[0], topRight: top[1],
              bottomRight: bottom[1], bottomLeft: bottom[0],
            };

            // Area
            const area = maxQuadAreaFound;

            // Aspect ratio
            const width = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
            const height = Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y));
            const aspectRatio = width / height;

            // Centricity
            const centerX = pts.reduce((sum, p) => sum + p.x, 0) / 4;
            const centerY = pts.reduce((sum, p) => sum + p.y, 0) / 4;

            resultConfidence = this.calculateCombinedConfidence(
              area,
              aspectRatio,
              centerX,
              centerY,
              canvas.width,
              canvas.height
            );

            for (let j = 0; j < 4; j++) {
              cv.line(debugContoursMat, boxPoints[j], boxPoints[(j + 1) % 4], fallbackRectColor, 3);
            }
          } else {
            console.log("Receipt Detection V3: Fallback rect failed aspect ratio check.");
          }
        } else {
          console.log("Receipt Detection V3: Fallback rect has zero dimension.");
        }
      } else {
        console.log("Receipt Detection V3: No suitable contour found.");
      }

      this.debugContoursImage = this.matToDataUrl(debugContoursMat);

      console.log(`Receipt Detection V3: Method='${detectionMethod}', Confidence=${resultConfidence.toFixed(3)}`);
      return {corners: resultCorners, confidence: resultConfidence - 0.05 /* adjusting because of algo*/};

    } catch (error) {
      console.error("Error during receipt detection V3:", error);
      this.debugEdgesImage = null;
      this.debugMorphedEdgesImage = null;
      this.debugContoursImage = null;
      return {corners: null, confidence: 0};
    } finally {
      [
        src, gray, blurred, edges, morphedEdges, hierarchy,
        debugContoursMat, largestContour, bestQuadApprox
      ]
        .filter(m => m && !m.isDeleted())
        .forEach(m => m.delete());
      if (contours && !contours.isDeleted()) contours.delete();
      console.log("Receipt Detection V3: OpenCV Mats cleaned up.");
    }
  }

  findIntersection(line1: LineSegment, line2: LineSegment): Point | null {
    const {x1: x1, y1: y1, x2: x2, y2: y2} = line1;
    const {x1: x3, y1: y3, x2: x4, y2: y4} = line2;

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(den) < 1e-6) {
      return null;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

    const intersectX = x1 + t * (x2 - x1);
    const intersectY = y1 + t * (y2 - y1);

    return {x: intersectX, y: intersectY};
  }

  calculateLineProperties(x1: number, y1: number, x2: number, y2: number): {
    angle: number,
    length: number,
    midX: number,
    midY: number
  } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    return {angle, length, midX, midY};
  }

  sortCorners(pts: Point[]): DetectedCorners | null {
    if (pts.length !== 4) return null;

    pts.sort((a, b) => a.y - b.y);

    const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);

    return {
      topLeft: top[0],
      topRight: top[1],
      bottomRight: bottom[1],
      bottomLeft: bottom[0],
    };
  }

  async detectionWithHough(
    img: HTMLImageElement,
    canvas: HTMLCanvasElement
  ): Promise<DetectionResult> {
    console.log("Starting Receipt Detection with HoughLinesP");
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    if (!ctx) throw new Error("Could not get 2D context.");

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let edges = new cv.Mat();
    let morphedEdges = new cv.Mat();
    let lines = new cv.Mat();
    let debugLinesMat = src.clone();

    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      let normalizedGray = new cv.Mat();
      cv.normalize(gray, normalizedGray, 0, 255, cv.NORM_MINMAX, cv.CV_8U);
      cv.GaussianBlur(normalizedGray, blurred, new cv.Size(5, 5), 0);
      normalizedGray.delete();

      const meanBrightness = cv.mean(gray)[0];
      const cannyThreshold1 = Math.max(50, meanBrightness * 0.4);
      const cannyThreshold2 = Math.max(150, meanBrightness * 0.8);
      cv.Canny(blurred, edges, cannyThreshold1, cannyThreshold2);

      const kernelSize = 3;
      let kernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(kernelSize, kernelSize)
      );
      cv.dilate(edges, morphedEdges, kernel, new cv.Point(-1, -1), 2);
      cv.erode(morphedEdges, morphedEdges, kernel, new cv.Point(-1, -1), 1);
      kernel.delete();

      const rho = 1;
      const theta = Math.PI / 180;
      const threshold = 30;
      const minLineLength = Math.min(canvas.width, canvas.height) * 0.1;
      const maxLineGap = 30;

      cv.HoughLinesP(
        morphedEdges,
        lines,
        rho,
        theta,
        threshold,
        minLineLength,
        maxLineGap
      );

      console.log(`HoughLinesP detected ${lines.rows} lines initially.`);

      const detectedLines: LineSegment[] = [];
      const horizontalLines: LineSegment[] = [];
      const verticalLines: LineSegment[] = [];
      const angleTolerance = 15;

      for (let i = 0; i < lines.rows; ++i) {
        const startPointX = lines.data32S[i * 4];
        const startPointY = lines.data32S[i * 4 + 1];
        const endPointX = lines.data32S[i * 4 + 2];
        const endPointY = lines.data32S[i * 4 + 3];

        const props = this.calculateLineProperties(startPointX, startPointY, endPointX, endPointY);

        if (props.length < minLineLength / 2) continue;

        const line: LineSegment = {
          x1: startPointX,
          y1: startPointY,
          x2: endPointX,
          y2: endPointY,
          angle: props.angle,
          length: props.length,
          midX: props.midX,
          midY: props.midY
        };
        detectedLines.push(line);

        if (Math.abs(props.angle) < angleTolerance && props.length > minLineLength * 0.8) {
          horizontalLines.push(line);
        } else if (Math.abs(Math.abs(props.angle) - 90) < angleTolerance && props.length > minLineLength * 0.8) {
          verticalLines.push(line);
        }

        const start = new cv.Point(startPointX, startPointY);
        const end = new cv.Point(endPointX, endPointY);
        cv.line(debugLinesMat, start, end, new cv.Scalar(0, 0, 255, 255), 1); // Draw all lines in red

      }

      console.log(`Found ${horizontalLines.length} horizontal-ish lines and ${verticalLines.length} vertical-ish lines.`);

      let resultCorners: DetectedCorners | null = null;
      let resultConfidence: number = 0;
      let detectionMethod: string = "None";

      if (horizontalLines.length >= 2 && verticalLines.length >= 2) {
        detectionMethod = "Hough Lines Intersection";

        horizontalLines.sort((a, b) => a.midY - b.midY); // Sort by vertical position (top to bottom)
        verticalLines.sort((a, b) => a.midX - b.midX);   // Sort by horizontal position (left to right)

        const topH = horizontalLines[0];
        const bottomH = horizontalLines[horizontalLines.length - 1];
        const leftV = verticalLines[0];
        const rightV = verticalLines[verticalLines.length - 1];

        cv.line(debugLinesMat, new cv.Point(topH.x1, topH.y1), new cv.Point(topH.x2, topH.y2), new cv.Scalar(0, 255, 0, 255), 3); // Green
        cv.line(debugLinesMat, new cv.Point(bottomH.x1, bottomH.y1), new cv.Point(bottomH.x2, bottomH.y2), new cv.Scalar(0, 255, 0, 255), 3); // Green
        cv.line(debugLinesMat, new cv.Point(leftV.x1, leftV.y1), new cv.Point(leftV.x2, leftV.y2), new cv.Scalar(255, 0, 0, 255), 3); // Blue
        cv.line(debugLinesMat, new cv.Point(rightV.x1, rightV.y1), new cv.Point(rightV.x2, rightV.y2), new cv.Scalar(255, 0, 0, 255), 3); // Blue

        const topLeft = this.findIntersection(topH, leftV);
        const topRight = this.findIntersection(topH, rightV);
        const bottomLeft = this.findIntersection(bottomH, leftV);
        const bottomRight = this.findIntersection(bottomH, rightV);

        if (topLeft && topRight && bottomLeft && bottomRight) {
          const corners: Point[] = [topLeft, topRight, bottomRight, bottomLeft];

          resultCorners = this.sortCorners(corners);

          if (resultCorners) {
            const {
              topLeft: tl,
              topRight: tr,
              bottomRight: br,
              bottomLeft: bl
            } = resultCorners;
            const area = 0.5 * Math.abs(
              tl.x * tr.y + tr.x * br.y + br.x * bl.y + bl.x * tl.y -
              (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x)
            );


            // Area
            const areaScore = area / (canvas.width * canvas.height);
            // Aspect Ratio
            const width = Math.max(tl.x, tr.x, br.x, bl.x) - Math.min(tl.x, tr.x, br.x, bl.x);
            const height = Math.max(tl.y, tr.y, br.y, bl.y) - Math.min(tl.y, tr.y, br.y, bl.y);
            const aspectRatio = width / height;
            const aspectScore = (aspectRatio >= 0.5 && aspectRatio <= 2.0) ? 1 : 0;
            // Centrality
            const centerX = (tl.x + tr.x + br.x + bl.x) / 4;
            const centerY = (tl.y + tr.y + br.y + bl.y) / 4;
            const imageCenterX = canvas.width / 2;
            const imageCenterY = canvas.height / 2;
            const distanceToCenter = Math.sqrt(Math.pow(centerX - imageCenterX, 2) + Math.pow(centerY - imageCenterY, 2));
            const centralityScore = 1 - (distanceToCenter / (Math.max(canvas.width, canvas.height) / 2)); // Wert zwischen 0 und 1
            resultConfidence = (areaScore * 0.3) + (aspectScore * 0.4) + (centralityScore * 0.3);
            //resultConfidence = area / (canvas.width * canvas.height);

            const finalColor = new cv.Scalar(0, 255, 255, 255); // Yellow
            cv.circle(debugLinesMat, new cv.Point(tl.x, tl.y), 5, finalColor, -1);
            cv.circle(debugLinesMat, new cv.Point(tr.x, tr.y), 5, finalColor, -1);
            cv.circle(debugLinesMat, new cv.Point(br.x, br.y), 5, finalColor, -1);
            cv.circle(debugLinesMat, new cv.Point(bl.x, bl.y), 5, finalColor, -1);
            cv.line(debugLinesMat, new cv.Point(tl.x, tl.y), new cv.Point(tr.x, tr.y), finalColor, 2);
            cv.line(debugLinesMat, new cv.Point(tr.x, tr.y), new cv.Point(br.x, br.y), finalColor, 2);
            cv.line(debugLinesMat, new cv.Point(br.x, br.y), new cv.Point(bl.x, bl.y), finalColor, 2);
            cv.line(debugLinesMat, new cv.Point(bl.x, bl.y), new cv.Point(tl.x, tl.y), finalColor, 2);
            // ---------------------------------
          } else {
            console.warn("Hough Detection: Could not sort the 4 intersection points.");
            detectionMethod = "Hough Lines Intersection (Sort Failed)";
          }

        } else {
          console.warn("Hough Detection: Could not find all 4 intersection points.");
          detectionMethod = "Hough Lines Intersection (Incomplete)";
        }
      } else {
        console.log("Hough Detection: Not enough horizontal or vertical lines found.");
      }

      console.log(`Receipt Detection (Hough): Method='${detectionMethod}', Confidence=${resultConfidence.toFixed(3)}`);
      return {corners: resultCorners, confidence: resultConfidence};

    } catch (error) {
      console.error("Error during receipt detection (Hough):", error);
      return {corners: null, confidence: 0}; // Return default on error
    } finally {
      [
        src, gray, blurred, edges, morphedEdges, lines, debugLinesMat
      ]
        .filter(m => m && !m.isDeleted())
        .forEach(m => m.delete());
      console.log("Receipt Detection (Hough): OpenCV Mats cleaned up.");
    }
  }

  private async tryMultipleDetectionMethods(img: HTMLImageElement, canvas: HTMLCanvasElement): Promise<DetectionResult> {
    const results = await Promise.all([
      //this.standardDocumentDetection(img, canvas), // standard algo den wir zu beginn hatten
      //this.receiptDetection(img, canvas),
      //this.receiptDetectionV3(img, canvas),
      this.detectionWithHough(img, canvas),
    ]);

    const bestResult = results.reduce((best, current, currentIndex) => {
      console.log(`Detection method ${currentIndex} confidence: ${current.confidence}`);
      return current.confidence > best.confidence ? current : best;
    },
      {corners: null, confidence: 0} as DetectionResult
    );

    return bestResult;
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

      const result = await this.tryMultipleDetectionMethods(img, canvas);

      if (result.corners) {
        this.detectedCorners = result.corners;
        this.adjustedCorners = JSON.parse(JSON.stringify(result.corners));
        console.log("Erkennung erfolgreich. Konfidenz:", result.confidence, "Ecken:", this.detectedCorners);
      } else {
        console.log("Keine geeignete Kontur gefunden. Setze Standardecken.");
        const defaultCorners: DetectedCorners = {
          topLeft: {x: 0, y: 0},
          topRight: {x: img.width, y: 0},
          bottomRight: {x: img.width, y: img.height},
          bottomLeft: {x: 0, y: img.height},
        };
        this.detectedCorners = defaultCorners;
        this.adjustedCorners = JSON.parse(JSON.stringify(defaultCorners));
      }

      this.currentState = PageState.ManualAdjust;
      this.hasUserAdjusted = false;
      this.cdRef.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 50));
      this.updateOverlaySize();
    } catch (err) {
      console.error("Fehler bei der Dokumenterkennung:", err);
      alert("Ein Fehler ist bei der Bildverarbeitung aufgetreten.");
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
          // this.imageRect = {
          //   width: displayWidth,
          //   height: displayHeight,
          //   left: this.imageRect.left + offsetX,
          //   top: this.imageRect.top + offsetY,
          //   right: this.imageRect.left + offsetX + displayWidth,
          //   bottom: this.imageRect.top + offsetY + displayHeight,
          // } as DOMRect;
          // console.log("Angepasstes imageRect:", this.imageRect);
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
    const clampPoint = (p: {x: number, y: number}) => ({
      x: Math.max(0, Math.min(img.naturalWidth, p.x)),
      y: Math.max(0, Math.min(img.naturalHeight, p.y))
    });
    const clampedCorners = {
      topLeft: clampPoint(this.adjustedCorners.topLeft),
      topRight: clampPoint(this.adjustedCorners.topRight),
      bottomRight: clampPoint(this.adjustedCorners.bottomRight),
      bottomLeft: clampPoint(this.adjustedCorners.bottomLeft)
    };

    const p1 = {x: clampedCorners.topLeft.x * scaleX, y: clampedCorners.topLeft.y * scaleY};
    const p2 = {x: clampedCorners.topRight.x * scaleX, y: clampedCorners.topRight.y * scaleY};
    const p3 = {x: clampedCorners.bottomRight.x * scaleX, y: clampedCorners.bottomRight.y * scaleY};
    const p4 = {x: clampedCorners.bottomLeft.x * scaleX, y: clampedCorners.bottomLeft.y * scaleY};
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
      const point = clampPoint(corners[key]);
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
    this.hasUserAdjusted = true;
    this.draggingPoint = null;
    if (this.overlayCanvasRef?.nativeElement) {
      this.overlayCanvasRef.nativeElement.style.cursor = 'grab';
    }
  }

  public async cancelAdjust() {
    await this.detectDocument();
    this.hasUserAdjusted = false;
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


  public cancelAdjustmentMode() {
    console.log("Verlasse manuellen Anpassungsmodus, zurück zu PhotoTaken.");
    this.capturedPhoto = this.originalPhoto;
    this.currentState = PageState.Cropped;
    this.detectedCorners = null;
    this.adjustedCorners = null;
    this.hasUserAdjusted = false;
    this.clearOverlay();
    this.draggingPoint = null;
    this.cdRef.detectChanges();
  }

  public onImageClick() {
    if (this.currentState === PageState.Cropped && this.capturedPhoto) {
      console.log("Entering fullscreen mode");
      this.currentState = PageState.Fullscreen;
      this.cdRef.detectChanges();
    }
  }

  public closeFullscreen() {
    console.log("Closing fullscreen mode");
    this.isClosingFullscreen = true;
    this.cdRef.detectChanges();

    setTimeout(() => {
      this.currentState = PageState.Cropped;
      this.isClosingFullscreen = false;
      this.cdRef.detectChanges();
    }, 300);
  }
}
