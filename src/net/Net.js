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
    this.onLobbyList = null; // Liste offener Lobbys (Browser)
    this.onWatchOk = null; // Zuschauen bestätigt (Meta des Runs)
    this.onWatchers = null; // Zuschauerzahl (für den Broadcaster)
    this.watchers = 0;
  }

  static defaultUrl() {
    // Gleicher Origin wie die Seite -> funktioniert hinter dem Coolify-Proxy (wss bei HTTPS).
    if (typeof location !== 'undefined' && location.host) {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${location.host}/ws`;
    }
    return 'ws://localhost:3000/ws';
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
    } else if (m.t === 'lobbies') {
      if (this.onLobbyList) this.onLobbyList(m.list || []);
    } else if (m.t === 'msg') {
      if (this.onData) this.onData(m.data);
    } else if (m.t === 'solo-ok') {
      this.role = 'solo';
      this.code = m.code;
    } else if (m.t === 'watch-ok') {
      this.role = 'spec';
      this.code = m.code;
      this.peerPresent = true;
      if (this.onWatchOk) this.onWatchOk(m);
    } else if (m.t === 'watchers') {
      this.watchers = m.n || 0;
      if (this.onWatchers) this.onWatchers(this.watchers);
    }
  }

  create(map, diff) {
    this.ws.send(JSON.stringify({ t: 'create', map, diff }));
  }
  join(id) {
    this.ws.send(JSON.stringify({ t: 'join', id }));
  }
  // Solo-Run als beobachtbaren Raum anmelden
  solo(name, map, diff, hero) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'solo', name, map, diff, hero }));
  }
  watch(id) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'watch', id }));
  }
  list() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'list' }));
  }
  updateLobby(map, diff) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'update', map, diff }));
  }
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'msg', data }));
  }
  close() {
    if (this.ws) this.ws.close();
    this.role = null;
    this.watchers = 0;
    this.peerPresent = false;
  }
}
