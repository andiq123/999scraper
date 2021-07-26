import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { SearchService } from 'src/app/search/search.service';
import { IUser } from 'src/app/shared/models/user';

@Component({
  selector: 'app-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss'],
})
export class NavComponent implements OnInit {
  user$!: Observable<IUser>;
  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.user$ = this.authService.User$;
  }

  onLogout() {
    this.authService.logOut();
  }
}
