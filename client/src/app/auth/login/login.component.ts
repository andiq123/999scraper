import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastService } from '../../core/_services/toast.service';
import { AuthService } from '../auth.service';

@Component({
  standalone: false,
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;

  constructor(
    private authService: AuthService,
    private toastrService: ToastService,
    private router: Router
  ) {}

  ngOnInit() {
    this.createLoginForm();
  }

  createLoginForm() {
    this.loginForm = new FormGroup({
      code: new FormControl('', [Validators.required, Validators.minLength(20)]),
    });
  }

  onSubmit() {
    this.authService.login(this.loginForm.value.code.trim()).subscribe(
      () => {
        this.router.navigateByUrl('/search');
      },
      (e: HttpErrorResponse) => {
        this.toastrService.error(e.error?.error ?? 'Invalid login code');
      }
    );
  }
}
