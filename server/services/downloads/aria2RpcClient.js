import { unavailable } from '../../lib/errors.js';

export class Aria2RpcClient {
  constructor({ endpoint, secret }) {
    this.endpoint = endpoint;
    this.secret = secret;
    this.nextId = 1;
  }

  async call(method, params = []) {
    const rpcParams = this.secret ? [`token:${this.secret}`, ...params] : params;
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: `aria2.${method}`,
        params: rpcParams,
      }),
    }).catch((error) => {
      throw unavailable('aria2 RPC is not reachable', { cause: error.message, endpoint: this.endpoint });
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw unavailable(payload.error?.message || `aria2 RPC failed with ${response.status}`, {
        endpoint: this.endpoint,
        method,
        code: payload.error?.code,
      });
    }

    return payload.result;
  }

  async health() {
    try {
      const version = await this.call('getVersion');
      return { ok: true, version: version.version, enabledFeatures: version.enabledFeatures || [] };
    } catch (error) {
      return { ok: false, error: error.message, details: error.details };
    }
  }
}
