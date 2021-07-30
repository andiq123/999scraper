import * as signalR from '@microsoft/signalr';
import { environment } from 'src/environments/environment';

export class SignalR {
  protected connection: signalR.HubConnection;
  private url = environment.apiUrl.split('api')[0];
  private hubName: string;

  constructor(hubName: string) {
    this.hubName = hubName;
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(this.url + this.hubName)
      .build();
  }

  protected async connect() {
    await this.connection.start().catch((e) => console.log(e));
  }

  protected async disconnect() {
    await this.connection.stop();
  }
}
