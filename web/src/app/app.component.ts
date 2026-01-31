import { Component } from '@angular/core';
import { AppHttpInterceptor } from './app-http-interceptor/app-http-interceptor';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(public appHttpInterceptor: AppHttpInterceptor) {}
}
