import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { FullScreenLoadingService } from './core/_services/fullScreenLoading.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];

  showLoading = false;
  constructor(
    private authService: AuthService,
    private fullScreenLoading: FullScreenLoadingService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.authService.loadUser();

    this.subscriptions.push(
      this.fullScreenLoading.isLoading$.subscribe((isLoading) => {
        this.showLoading = isLoading;
        this.cd.detectChanges();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((x) => x.unsubscribe());
  }
}
