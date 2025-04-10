import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MediaPagePage } from './media-page.page';

describe('MediaPagePage', () => {
  let component: MediaPagePage;
  let fixture: ComponentFixture<MediaPagePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MediaPagePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
