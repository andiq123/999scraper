import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { ISession } from 'src/app/shared/models/session';

@Component({
  standalone: false,
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  session$!: Observable<ISession | null>;
  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.session$ = this.authService.session$;
  }
}
