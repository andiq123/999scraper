import { Component } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { SignalrService } from './core/signalr.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'client';
  constructor(private authService: AuthService) {
    this.authService.loadUser();
  }
}
