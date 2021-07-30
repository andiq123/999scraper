import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { IActivity } from '../shared/models/activity';
import { IUser } from '../shared/models/user';

@Injectable({
  providedIn: 'root',
})
export class MonitorService {
  private baseUrl = environment.apiUrl + 'admin/';

  constructor(private http: HttpClient) {}

  getUsers(): Observable<IUser[]> {
    return this.http.get<IUser[]>(this.baseUrl + 'users');
  }

  getActivitiesForUser(userId: string) {
    return this.http
      .get<IActivity[]>(this.baseUrl + userId + '/activity')
      .pipe(
        map((activities: IActivity[]) =>
          activities
            .sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime))
            .reverse()
        )
      );
  }

  blockUser(userId: string): Observable<void> {
    return this.http.post<void>(this.baseUrl + userId + '/block', {});
  }

  unBlockUser(userId: string): Observable<void> {
    return this.http.post<void>(this.baseUrl + userId + '/unBlock', {});
  }
}
