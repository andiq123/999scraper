import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastService } from '../../core/_services/toast.service';
import { IUser } from 'src/app/shared/models/user';
import { AuthService } from '../auth.service';

@Component({
  standalone: false,
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  constructor(
    private authService: AuthService,
    private toastrService: ToastService,
    private router: Router
  ) {}

  ngOnInit() {
    this.createRegisterForm();
  }

  createRegisterForm() {
    this.registerForm = new FormGroup({
      username: new FormControl('', [
        Validators.required,
        Validators.minLength(3),
      ]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [
        Validators.required,
        Validators.minLength(8),
      ]),
      confirmPassword: new FormControl('', [
        Validators.required,
        Validators.minLength(8),
      ]),
    });
  }

  onSubmit() {
    const { password, confirmPassword } = this.registerForm.value;
    if (password != confirmPassword)
      return this.toastrService.error("Passwords don't match!");

    return this.authService.register(this.registerForm.value).subscribe(
      (user: IUser) => {
        this.router.navigateByUrl('/search');
      },
      (e: HttpErrorResponse) => this.toastrService.error(e.error?.error ?? 'Registration failed')
    );
  }
}
