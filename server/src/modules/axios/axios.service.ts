import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import iconv from 'iconv-lite';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AxiosService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}
  /**
   * 获取ip地址信息
   * @param ip
   * @returns
   */
  async getIpAddress(ip: string) {
    try {
      const IP_URL = 'https://whois.pconline.com.cn/ipJson.jsp';
      const response = await this.httpService.axiosRef(`${IP_URL}?ip=${ip}&json=true`, {
        responseType: 'arraybuffer',
        transformResponse: [
          function (data) {
            const str = iconv.decode(data, 'gbk');
            return JSON.parse(str);
          },
        ],
      });
      return response.data.addr;
    } catch (error) {
      return '未知';
    }
  }

  /**
   * @description: 获取金价信息
   * @return
   */
  async getGoldInfo() {
    try {
      const nowapiConfig = this.configService.get('nowapi');
      const response = await this.httpService.axiosRef.get(`${nowapiConfig.host}?app=finance.gold_price&goldid=1053&appkey=${nowapiConfig.appkey}&sign=${nowapiConfig.sign}&format=json`);
      return response.data.result.dtList['1053'];
    } catch (error) {
      return {};
    }
  }
}
