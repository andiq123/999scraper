import { Component, OnInit } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { ToastService } from './core/_services/toast.service';

@Component({
  standalone: false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  toast$;
  constructor(
    private authService: AuthService,
    private toast: ToastService
  ) {
    this.toast$ = toast.messages$;
  }

  ngOnInit(): void {
    this.authService.loadUser();
  }
}
