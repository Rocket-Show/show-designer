import { Component, OnInit } from '@angular/core';
import { IntroService } from '../services/intro.service';

@Component({
  selector: 'lib-app-intro',
  templateUrl: './intro.component.html',
  styleUrls: ['./intro.component.css'],
  standalone: false,
})
export class IntroComponent implements OnInit {
  constructor(public introService: IntroService) {}

  ngOnInit() {}

  close() {
    this.introService.setShowIntro(false);
  }
}
