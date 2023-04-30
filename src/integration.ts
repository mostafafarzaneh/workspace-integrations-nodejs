import { Integration, ErrorHandler, Devices, Deployment, DataObject, Workspaces } from './types';
import { parseJwt } from './util';
import Http from './http';
import DevicesImpl from './devices';
import WorkspacesImpl from './workspaces';

class IntegrationImpl implements Integration {
  private http: Http;
  public devices: Devices;
  public workspaces: Workspaces;

  private errorHandler: ErrorHandler | null = null;
  private appInfo: DataObject;
  private jwt: DataObject;

  constructor(appInfo: DataObject, accessToken: string, jwt: DataObject) {
    this.appInfo = appInfo;
    this.jwt = jwt;
    this.http = new Http(jwt.webexapisBaseUrl, accessToken);
    this.devices = new DevicesImpl(this.http);
    this.workspaces = new WorkspacesImpl(this.http);
  }

  onError(handler: ErrorHandler) {
    this.errorHandler = handler;
  }

  getAppInfo() {
    return this.appInfo;
  }

  static async connect(options: Deployment) {
    const { clientId, clientSecret, notifications } = options;

    const jwt = parseJwt(options.jwt);
    const { oauthUrl, refreshToken, appUrl } = jwt;

    let tokenData = await Http.getAccessToken(clientId, clientSecret, oauthUrl, refreshToken);

    const appInfo = await Http.initIntegration({
      accessToken: tokenData.access_token,
      appUrl,
      notifications,
    });

    const { access_token, expires_in } = tokenData;
    const integration = new IntegrationImpl(appInfo, access_token, jwt);

    if (notifications === 'longpolling') {
      console.log('Integration is using long polling for events and status updates');
      const pollUrl = appInfo.queue?.pollUrl;
      // xapi.pollData(pollUrl);
    } else if (notifications === 'webhook') {
      console.log('Integrations is using web hooks for events and status updates');
    } else {
      console.log('Integration is not subscribing to notifications');
    }

    const timeToRefresh = expires_in - 60 * 15;
    console.log('token will be refreshed in ', (timeToRefresh / 60).toFixed(0), 'minutes');
    setTimeout(() => integration.refreshToken(options), timeToRefresh * 1000);

    return integration;
  }

  async refreshToken(creds: any) {
    const { clientId, clientSecret, oauthUrl, refreshToken } = creds;

    try {
      const { access_token, expires_in } = await Http.getAccessToken(clientId, clientSecret, oauthUrl, refreshToken);
      if (this.http) {
        this.http.setAccessToken(access_token);
      }
      const nextTime = expires_in - 60 * 15;
      setTimeout(() => this.refreshToken(creds), nextTime * 1000);
    } catch (e) {
      if (this.errorHandler) {
        this.errorHandler('Not able to refresh token. ' + (e instanceof Error && e.message));
      }
    }
  }
}

export default IntegrationImpl;
