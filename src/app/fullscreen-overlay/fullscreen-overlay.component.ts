import { Component, Input, Output, EventEmitter, ChangeDetectorRef, HostListener } from '@angular/core';

@Component({
  selector: 'app-fullscreen-overlay',
  templateUrl: './fullscreen-overlay.component.html',
  styleUrls: ['./fullscreen-overlay.component.scss'],
})
export class FullscreenOverlayComponent {
  @Input() imageSrc: string | null = null;
  @Input() belowHeader: boolean = true;
  @Input() isClosing: boolean = false;
  @Output() close = new EventEmitter<void>();

  public imageScale: number = 1;
  public imageTransform: string = 'scale(1)';

  private touchStartY: number = 0;
  private touchCurrentY: number = 0;
  private initialPinchDistance: number = 0;
  private pinchStartImageScale: number = 1;
  private pinchStartTranslateX: number = 0;
  private pinchStartTranslateY: number = 0;
  private pinchStartViewportCenterX: number = 0;
  private pinchStartViewportCenterY: number = 0;
  private isPinching: boolean = false;
  private translateX: number = 0;
  private translateY: number = 0;
  private lastTouchX: number = 0;
  private lastTouchY: number = 0;
  private isMoving: boolean = false;

  constructor(private cdRef: ChangeDetectorRef) {}

  public closeFullscreen(): void {
    this.close.emit();
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.imageScale <= 1) {
      this.translateX = 0;
      this.translateY = 0;
    } else {
      this.adjustPositionAfterResize();
    }
    this.imageTransform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.imageScale})`;
    this.cdRef.detectChanges();
  }

  private adjustPositionAfterResize(): void {
    const imageElement = document.querySelector('.fullscreen-image') as HTMLElement;
    const containerElement = document.querySelector('.fullscreen-image-container') as HTMLElement;

    if (imageElement && containerElement && imageElement.offsetWidth > 0 && containerElement.offsetWidth > 0) {
      const containerWidth = containerElement.offsetWidth;
      const containerHeight = containerElement.offsetHeight;

      const imageNaturalWidth = (imageElement as HTMLImageElement).naturalWidth;
      const imageNaturalHeight = (imageElement as HTMLImageElement).naturalHeight;

      if (imageNaturalWidth === 0 || imageNaturalHeight === 0) return;


      let imageDisplayWidth = imageNaturalWidth * this.imageScale;
      let imageDisplayHeight = imageNaturalHeight * this.imageScale;


      const viewportAspectRatio = containerWidth / containerHeight;
      const naturalImageAspectRatio = imageNaturalWidth / imageNaturalHeight;

      let actualRenderedWidthInContainer;
      let actualRenderedHeightInContainer;

      if (naturalImageAspectRatio > viewportAspectRatio) { // Image is wider than container or same aspect ratio, fits by width
        actualRenderedWidthInContainer = containerWidth;
        actualRenderedHeightInContainer = containerWidth / naturalImageAspectRatio;
      } else { // Image is taller than container, fits by height
        actualRenderedHeightInContainer = containerHeight;
        actualRenderedWidthInContainer = containerHeight * naturalImageAspectRatio;
      }

      imageDisplayWidth = actualRenderedWidthInContainer * this.imageScale;
      imageDisplayHeight = actualRenderedHeightInContainer * this.imageScale;


      const maxTranslateX = Math.max(0, (imageDisplayWidth - containerWidth) / 2);
      const maxTranslateY = Math.max(0, (imageDisplayHeight - containerHeight) / 2);

      this.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, this.translateX));
      this.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, this.translateY));
    } else {
      this.translateX = 0;
      this.translateY = 0;
    }
  }


  public onFullscreenTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.touchStartY = event.touches[0].clientY;
      this.touchCurrentY = this.touchStartY;
      this.lastTouchX = event.touches[0].clientX;
      this.lastTouchY = event.touches[0].clientY;

      if (this.imageScale > 1) {
        this.isMoving = true;
      } else {
        this.isMoving = false;
      }
      this.isPinching = false;
    } else if (event.touches.length === 2) {
      this.isPinching = true;
      this.isMoving = false;
      this.initialPinchDistance = this.getPinchDistance(event);
      this.pinchStartImageScale = this.imageScale;
      this.pinchStartTranslateX = this.translateX;
      this.pinchStartTranslateY = this.translateY;
      this.pinchStartViewportCenterX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      this.pinchStartViewportCenterY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      event.preventDefault();
    }
  }

  public onFullscreenTouchMove(event: TouchEvent): void {
    if (this.isPinching && event.touches.length === 2) {
      const currentDistance = this.getPinchDistance(event);
      if (this.initialPinchDistance > 0) {
        const scaleFactorFromStart = currentDistance / this.initialPinchDistance;
        const newProposedScale = this.pinchStartImageScale * scaleFactorFromStart;
        const newActualScale = Math.max(1.0, Math.min(5, newProposedScale));

        if (newActualScale !== this.imageScale) {
          const container = document.querySelector('.fullscreen-image-container');
          if (container) {
            const rect = container.getBoundingClientRect();
            const scalingOriginX_vp = rect.left + rect.width / 2;
            const scalingOriginY_vp = rect.top + rect.height / 2;

            const focalPointX_vp = this.pinchStartViewportCenterX;
            const focalPointY_vp = this.pinchStartViewportCenterY;

            const focalRelToScalingOriginX = focalPointX_vp - scalingOriginX_vp;
            const focalRelToScalingOriginY = focalPointY_vp - scalingOriginY_vp;

            const oldTx = this.pinchStartTranslateX;
            const oldTy = this.pinchStartTranslateY;
            const oldEffectiveScale = this.pinchStartImageScale;

            if (oldEffectiveScale === 0) return;

            this.translateX = focalRelToScalingOriginX * (1 - newActualScale / oldEffectiveScale) + oldTx * (newActualScale / oldEffectiveScale);
            this.translateY = focalRelToScalingOriginY * (1 - newActualScale / oldEffectiveScale) + oldTy * (newActualScale / oldEffectiveScale);
            this.imageScale = newActualScale;

            if (this.imageScale === 1) {
              this.translateX = 0;
              this.translateY = 0;
            } else {
              this.adjustPositionAfterResize(); // Clamping auch hier anwenden
            }
          }
        }
      }
      event.preventDefault();
    } else if (this.isMoving && event.touches.length === 1 && this.imageScale > 1) {
      const currentX = event.touches[0].clientX;
      const currentY = event.touches[0].clientY;

      const deltaX = currentX - this.lastTouchX;
      const deltaY = currentY - this.lastTouchY;

      this.translateX += deltaX;
      this.translateY += deltaY;

      this.adjustPositionAfterResize(); // Clamping auch hier anwenden

      this.lastTouchX = currentX;
      this.lastTouchY = currentY;
      event.preventDefault();
    } else if (event.touches.length === 1 && !this.isMoving) {
      this.touchCurrentY = event.touches[0].clientY;
    }

    // Verwende translate3d für Hardware-Beschleunigung
    this.imageTransform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale3d(${this.imageScale}, ${this.imageScale}, 1)`;
  }

  public onFullscreenTouchEnd(event: TouchEvent): void {
    const wasPinching = this.isPinching;
    const wasMoving = this.isMoving;

    if (event.changedTouches && event.changedTouches.length > 0) {
      const touch = event.changedTouches[0];
      const target = touch.target as HTMLElement;
      if (!target.closest('.close-button')) {
        const imageContainer = document.querySelector('.fullscreen-image-container');
        if (imageContainer && !imageContainer.contains(target)) {
          this.closeFullscreen();
          return;
        }
      }
    }

    if (event.touches.length === 0) {
      this.isPinching = false;
      this.isMoving = false;
      if (!wasPinching && !wasMoving && event.changedTouches.length === 1) {
        const swipeDistance = this.touchCurrentY - this.touchStartY;
        if (swipeDistance > 100) {
          this.closeFullscreen();
        }
      }
    } else if (event.touches.length === 1 && wasPinching) {
      this.isPinching = false;
      this.isMoving = this.imageScale > 1;
      this.lastTouchX = event.touches[0].clientX;
      this.lastTouchY = event.touches[0].clientY;
      this.touchStartY = event.touches[0].clientY;
      this.touchCurrentY = this.touchStartY;
    }
    if (this.imageScale === 1) { // Sicherstellen, dass bei Scale 1 keine Translation übrig bleibt
      this.translateX = 0;
      this.translateY = 0;
      this.imageTransform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.imageScale})`;
    }
  }

  private getPinchDistance(event: TouchEvent): number {
    if (event.touches.length < 2) return 0;
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  public resetView(): void {
    this.imageScale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.imageTransform = 'translate3d(0px, 0px, 0) scale3d(1, 1, 1)';
    this.cdRef.detectChanges();
  }
}
