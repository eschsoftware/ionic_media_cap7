import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Dies stellt sicher, dass die PWA-Elemente geladen werden, wenn die App startet
defineCustomElements(window);

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.log(err));
