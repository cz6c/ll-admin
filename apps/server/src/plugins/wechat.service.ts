import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";

type Code2SessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

@Injectable()
export class WechatService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {}

  async code2Session(code: string): Promise<{ openid: string }> {
    const appId = this.configService.get<string>("wechat.appId");
    const appSecret = this.configService.get<string>("wechat.appSecret");
    if (!appId || !appSecret) {
      throw new Error("wechat_config_missing");
    }
    if (!code) {
      throw new Error("wechat_code_missing");
    }
    const response = await this.httpService.axiosRef.get<Code2SessionResponse>("https://api.weixin.qq.com/sns/jscode2session", {
      params: {
        appid: appId,
        secret: appSecret,
        js_code: code,
        grant_type: "authorization_code"
      }
    });
    const data = response.data || {};
    if (data.errcode) {
      if (data.errcode === 40029) {
        throw new Error("wechat_code_invalid");
      }
      if (data.errcode === 45011) {
        throw new Error("wechat_rate_limited");
      }
      throw new Error(`wechat_code2session_${data.errcode}`);
    }
    if (!data.openid) {
      throw new Error("wechat_openid_missing");
    }
    return {
      openid: data.openid
    };
  }
}
