// mqttClient.js

class MqttClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.handlers = new Map(); // topic -> [callbacks]
  }

  async connect(options) {
    const { host, port, username, password, useTls } = options;
    const protocol = useTls ? "wss" : "ws";
    const url = `${protocol}://${host}:${port}`;

    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(url, {
        username: username || undefined,
        password: password || undefined,
      });

      this.client.on("connect", () => {
        this.connected = true;
        window.logStatus?.(`MQTT connected to ${url}`);
        resolve();
      });

      this.client.on("error", err => {
        window.logStatus?.(`MQTT error: ${err}`);
        this.client.end(true);   // stop reconnect attempts
        reject(err);
      });

      this.client.on("message", (topic, message) => {
        const payload = message.toString();
        const list = this.handlers.get(topic) || [];
        for (const cb of list) {
          try { cb(topic, payload); } catch (e) { console.warn(e); }
        }
      });
    });
  }

  async publish(topic, payload) {
    if (!this.client || !this.connected) {
      throw new Error("MQTT not connected");
    }
    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, err => {
        if (err) reject(err); else resolve();
      });
    });
  }

  async subscribe(topic) {
    if (!this.client || !this.connected) {
      throw new Error("MQTT not connected");
    }
    return new Promise((resolve, reject) => {
      this.client.subscribe(topic, err => {
        if (err) reject(err); else resolve();
      });
    });
  }

  onMessage(topic, cb) {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
    }
    this.handlers.get(topic).push(cb);
  }

  stop() {
    if (this.client) {
        try { this.client.end(true); } catch {}
    }
    this.connected = false;
    this.handlers.clear();
  }

}

window.mqttClient = new MqttClient();