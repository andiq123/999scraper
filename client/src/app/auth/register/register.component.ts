import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { IUser } from 'src/app/shared/models/user';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  constructor(
    private authService: AuthService,
    private toastrService: ToastrService,
    private router: Router
  ) {}

  ngOnInit() {
    this.createRegisterForm();
  }

  createRegisterForm() {
    this.registerForm = new FormGroup({
      username: new FormControl('', [
        Validators.required,
        Validators.minLength(5),
      ]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [
        Validators.required,
        Validators.minLength(5),
      ]),
      confirmPassword: new FormControl('', [
        Validators.required,
        Validators.minLength(5),
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
      (e: HttpErrorResponse) => {
        const errors: object[] = e.error;
        if (errors.length > 0) {
          errors.forEach((x: any) => {
            if (x.description) {
              this.toastrService.error(x.description);
            }
          });
        }
      }
    );
  }
}
