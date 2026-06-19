// Client-seitiger WebSocket-Wrapper für Lobby + Datenaustausch.
export class Net {
  constructor() {
    this.ws = null;
    this.role = null; // 'host' | 'client'
    this.code = null;
    this.connected = false;
    this.peerPresent = false;
    // Callbacks (vom Game gesetzt)
    this.onCreated = null;
    this.onJoined = null;
    this.onPeerJoined = null;
    this.onPeerLeft = null;
    this.onError = null;
    this.onData = null;
  }

  static defaultUrl() {
    const host = (typeof location !== 'undefined' && location.hostname) || 'localhost';
    return `ws://${host}:8080`;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url || Net.defaultUrl());
      } catch (e) {
        reject(e);
        return;
      }
      const to = setTimeout(() => reject(new Error('Zeitüberschreitung beim Verbinden')), 6000);
      this.ws.onopen = () => {
        clearTimeout(to);
        this.connected = true;
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(to);
        if (this.onError) this.onError('Verbindung fehlgeschlagen (läuft der Server? `npm run server`)');
        reject(new Error('ws error'));
      };
      this.ws.onclose = () => {
        this.connected = false;
      };
      this.ws.onmessage = (ev) => this._handle(ev);
    });
  }

  _handle(ev) {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.t === 'created') {
      this.role = 'host';
      this.code = m.code;
      if (this.onCreated) this.onCreated(m.code);
    } else if (m.t === 'joined') {
      this.role = 'client';
      this.code = m.code;
      this.peerPresent = true;
      if (this.onJoined) this.onJoined(m.code);
    } else if (m.t === 'peer-joined') {
      this.peerPresent = true;
      if (this.onPeerJoined) this.onPeerJoined();
    } else if (m.t === 'peer-left') {
      this.peerPresent = false;
      if (this.onPeerLeft) this.onPeerLeft();
    } else if (m.t === 'error') {
      if (this.onError) this.onError(m.msg);
    } else if (m.t === 'msg') {
      if (this.onData) this.onData(m.data);
    }
  }

  create() {
    this.ws.send(JSON.stringify({ t: 'create' }));
  }
  join(code) {
    this.ws.send(JSON.stringify({ t: 'join', code }));
  }
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'msg', data }));
  }
  close() {
    if (this.ws) this.ws.close();
  }
}
