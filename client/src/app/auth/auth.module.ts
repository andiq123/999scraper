import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthRoutingModule } from './auth-routing.module';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';

import { SharedModule } from '../shared/shared.module';

@NgModule({
  imports: [CommonModule, AuthRoutingModule, SharedModule],
  declarations: [LoginComponent, RegisterComponent],
})
export class AuthModule {}
