import * as signalR from '@microsoft/signalr';
import { environment } from 'src/environments/environment';

export class SignalR {
  protected connection: signalR.HubConnection;
  private url = environment.apiUrl.split('api')[0];
  private hubName: string;

  constructor(hubName: string) {
    this.hubName = hubName;
    this.connection = new signalR.HubConnectionBuilder()
      .configureLogging(signalR.LogLevel.None)
      .withUrl(this.url + this.hubName)
      .build();
  }

  protected async connect() {
    await this.connection
      .start()
      .then(() => {
        console.log('connected');
      })
      .catch((e) => console.log(e));
  }

  protected async disconnect() {
    await this.connection.stop();
  }
}
