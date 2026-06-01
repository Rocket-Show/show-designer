import { Component } from '@angular/core';
import { AppHttpInterceptor } from './app-http-interceptor/app-http-interceptor';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent {
  // To debug
  public designerUniverses = JSON.parse(
    '[{"uuid":"f869189e-4068-4800-a61f-66a1499946fd","name":"DMX"},{"uuid":"363b72d6-f58f-4873-a98c-02fb49d01ed2","name":"Universe 2"},{"uuid":"204d88c6-8deb-4c03-9d5d-721693a9723b","name":"Universe 3"}]'
  );

  constructor(public appHttpInterceptor: AppHttpInterceptor) {}
}
