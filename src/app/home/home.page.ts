import {Component, OnInit} from '@angular/core';

import {ActivatedRoute, Router} from '@angular/router';


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {

  imgUrls: any[] = [];
  setMandant: string = "";
  setUser: string = "";


  constructor(private router: Router) {
  }

  async ngOnInit() {


  }


  async media() {

    this.router.navigateByUrl('/media-page');

  }


  async video() {
    this.router.navigateByUrl('/video-page');
  }
}
