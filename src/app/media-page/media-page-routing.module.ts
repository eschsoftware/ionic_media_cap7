import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MediaPagePage } from './media-page.page';

const routes: Routes = [
  {
    path: '',
    component: MediaPagePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MediaPagePageRoutingModule {}
