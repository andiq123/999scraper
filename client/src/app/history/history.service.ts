import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ISearchHistory } from '../shared/models/search-history';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  constructor(private http: HttpClient) {}

  get(): Observable<ISearchHistory[]> {
    return this.http.get<ISearchHistory[]>(environment.apiUrl + 'history');
  }
}
