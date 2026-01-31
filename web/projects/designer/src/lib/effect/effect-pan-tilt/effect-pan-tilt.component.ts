import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'lib-app-effect-pan-tilt',
  templateUrl: './effect-pan-tilt.component.html',
  styleUrls: ['./effect-pan-tilt.component.css'],
  standalone: false,
})
export class EffectPanTiltComponent implements OnInit {
  @ViewChild('panTiltGrid') panTiltGrid: ElementRef;

  // private line = d3.line();
  private svg;
  private path;

  private points = [
    [0, 500],
    [500, 0],
    [1000, 500],
    [500, 1000],
  ];

  private dragged = null;
  private selected = this.points[0];

  constructor() {}

  private redraw() {}

  ngOnInit() {}
}
