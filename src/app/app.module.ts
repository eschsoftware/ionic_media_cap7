import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
// Importiere das PDF-Viewer Modul
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';


import { AndroidPermissions } from '@awesome-cordova-plugins/android-permissions/ngx';

import { defineCustomElements } from '@ionic/pwa-elements/loader';


import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';



defineCustomElements(window);
registerLocaleData(localeDe);

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, 
    NgxExtendedPdfViewerModule, // Füge das PDF-Viewer Modul hinzu
    IonicModule.forRoot(), 
    
   
    AppRoutingModule],
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
   
    provideHttpClient(withInterceptorsFromDi()),
    AndroidPermissions // ✅ Hier als Provider hinzufügen

  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
