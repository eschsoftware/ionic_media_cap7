import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MediaPagePageRoutingModule } from './media-page-routing.module';

import { MediaPagePage } from './media-page.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MediaPagePageRoutingModule
  ],
  declarations: [MediaPagePage]
})
export class MediaPagePageModule {}
