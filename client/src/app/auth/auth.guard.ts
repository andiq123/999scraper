import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const authenticated = await inject(AuthService).restore();
  return authenticated || inject(Router).createUrlTree(['/login']);
};
