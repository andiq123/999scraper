import {
  Component,
  HostListener,
  OnInit,
} from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'src/app/auth/auth.service';
import { ISession } from 'src/app/shared/models/session';

@Component({
  standalone: false,
  selector: 'app-nav',
  templateUrl: './nav.component.html',
  styleUrls: ['./nav.component.scss'],
})
export class NavComponent implements OnInit {
  session$!: Observable<ISession | null>;
  show: boolean = window.innerWidth >= 800;
  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.session$ = this.authService.session$;
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
