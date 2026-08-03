import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-full-screen',
  templateUrl: './full-screen.component.html',
  styleUrls: ['./full-screen.component.scss'],
})
export class FullScreenComponent {
  show = false;
  toggleShow(): void { this.show = !this.show; }
}
