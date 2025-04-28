import { Logger } from '@nestjs/common';
import mqtt, { type MqttClient, type IClientOptions, type IClientPublishOptions } from 'mqtt';

type ConnectOptions = {
  protocol: string;
  host: string;
  port: number;
};

type QueueItem = {
  payload: string;
};

class MQTTClientSingleton {
  private readonly logger = new Logger(MQTTClientSingleton.name);
  private static instance: MQTTClientSingleton | null = null;
  private client: MqttClient | null = null;
  private connectUrl: string;
  private options: IClientOptions;
  private topic: string = '/js/mqtt';
  private qos: IClientPublishOptions['qos'] = 0;
  private messageQueue: QueueItem[] = [];
  private maxReconnectAttempts = 6; // 最大重连数
  private currentReconnectAttempts = 0; // 重连次数
  private isManualDisconnect = false; // 主动断开
  private reconnectTimer: NodeJS.Timeout | null = null;

  private constructor(connectOptions: ConnectOptions, clientOptions?: IClientOptions) {
    this.connectUrl = `${connectOptions.protocol}://${connectOptions.host}:${connectOptions.port}`;
    if (['ws', 'wss'].includes(connectOptions.protocol)) {
      this.connectUrl += '/mqtt';
    }

    // 合并安全配置
    this.options = {
      clientId: `emqx_nodejs_${Math.random().toString(16).substring(2, 8)}`,
      clean: true,
      connectTimeout: 4000,
      username: 'admin',
      password: '123456',
      reconnectPeriod: 1000,
      ...clientOptions,
    };
  }

  // 单例获取方法（带初始化参数）
  public static getInstance(connectOptions?: ConnectOptions, clientOptions?: IClientOptions): MQTTClientSingleton {
    if (!MQTTClientSingleton.instance) {
      if (!connectOptions) {
        throw new Error('首次初始化必须提供连接配置和客户端选项');
      }
      MQTTClientSingleton.instance = new MQTTClientSingleton(connectOptions, clientOptions);
    }
    return MQTTClientSingleton.instance;
  }

  // 创建连接
  public createClient(): void {
    this.client = mqtt.connect(this.connectUrl, this.options);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.client) return;

    this.client
      .on('connect', () => {
        this.logger.log('连接成功');
        this.currentReconnectAttempts = 0;
        this.processMessageQueue();
        this.client.subscribe(this.topic, { qos: this.qos }, (error) => {
          if (error) {
            this.logger.log('subscribe error:', error);
            return;
          }
          this.logger.log(`Subscribe to topic '${this.topic}'`);
        });
      })
      .on('message', (topic, payload) => {
        this.handleMessage(topic, payload);
      })
      .on('error', (error) => {
        this.logger.error('连接error', error);
      })
      .on('reconnect', () => {
        this.handleReconnect();
      })
      .on('close', () => {
        if (!this.isManualDisconnect && this.currentReconnectAttempts < this.maxReconnectAttempts!) {
          this.handleReconnect();
        }
      });
  }

  // 处理消息
  private handleMessage(topic: string, payload: Buffer): void {
    this.logger.log(`收到消息 [${topic}]: ${payload.toString()}`);
  }

  // 重新连接
  private handleReconnect(): void {
    this.currentReconnectAttempts++;

    // 指数退避算法：避免网络拥塞时加重服务器负担
    const reconnectExponentialFactor = 1.5,
      reconnectInitialDelay = 2000;
    const delay = Math.min(
      reconnectInitialDelay * Math.pow(reconnectExponentialFactor, this.currentReconnectAttempts),
      12000, // 最大延迟 12 秒
    );

    if (this.currentReconnectAttempts >= this.maxReconnectAttempts!) {
      this.logger.error('达到最大重连次数，停止尝试');
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.logger.log(`第 ${this.currentReconnectAttempts} 次重连，${delay}ms 后尝试`);
    }, delay);
  }

  // 处理消息队列
  private async processMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const { payload } = this.messageQueue.shift()!;
      await this.safePublish(payload);
    }
  }

  // 消息发送
  public async safePublish(payload: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.client) {
        this.messageQueue.push({ payload });
        this.logger.error('消息已加入队列等待发送');
        return resolve();
      }

      this.client.publish(this.topic, payload, { qos: this.qos }, (error) => {
        if (error) {
          this.messageQueue.push({ payload });
          this.logger.error(`发布失败: ${error.message}`);
        }
        resolve();
      });
    });
  }

  // 断开连接
  public disconnect(force = true): Promise<void> {
    this.isManualDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    return new Promise((resolve, reject) => {
      if (!this.client) {
        resolve();
        return;
      }

      this.client.end(force, (error) => {
        if (error) {
          reject(error);
        } else {
          this.messageQueue = [];
          resolve();
        }
      });
    });
  }
}

export default MQTTClientSingleton.getInstance({
  protocol: 'mqtts',
  host: 'f6467964.ala.cn-hangzhou.emqxsl.cn',
  port: 8883,
});

// 发布
// client.safePublish('重要数据');

// 断开连接
// await client.disconnect();
