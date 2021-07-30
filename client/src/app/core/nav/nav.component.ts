import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { IUser } from 'src/app/shared/models/user';

@Component({
  selector: 'app-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss'],
})
export class NavComponent implements OnInit {
  user$!: Observable<IUser>;
  show: boolean = window.innerWidth >= 800;
  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.user$ = this.authService.User$;
  }

  toggleShow() {
    this.show = !this.show;
  }

  onLogout() {
    this.authService.logOut();
  }

  @HostListener('window:resize', ['$event'])
  onResize($event: any) {
    this.show = $event.target.innerWidth >= 800;
  }
}
