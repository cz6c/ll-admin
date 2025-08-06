import { Injectable } from "@nestjs/common";
import { ResultData } from "@/common/utils/result";
import * as os from "os";
import * as path from "path";
import * as nodeDiskInfo from "node-disk-info";

@Injectable()
export class ServerService {
  getInfo() {
    // 获取CPU信息
    const cpu = this.getCpuInfo();
    const mem = this.getMemInfo();
    const sys = {
      computerName: os.hostname(),
      computerIp: this.getServerIP(),
      userDir: path.resolve(__dirname, "..", "..", "..", ".."),
      osName: os.platform(),
      osArch: os.arch()
    };
    const sysFiles = this.getDiskStatus();
    const data = {
      cpu,
      mem,
      sys,
      sysFiles
    };
    return ResultData.ok(data);
  }

  getDiskStatus() {
    const disks = nodeDiskInfo.getDiskInfoSync();
    const sysFileInfo = disks.reduce(
      (info: any, disk) => {
        info.total += disk.blocks;
        info.used += disk.used;
        return info;
      },
      { total: 0, used: 0 }
    );
    return {
      total: this.bytesToGB(sysFileInfo.total),
      used: this.bytesToGB(sysFileInfo.used),
      usage: ((sysFileInfo.used / sysFileInfo.total) * 100).toFixed(2)
    };
  }

  // 获取服务器IP地址
  getServerIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // 选择外部可访问的IPv4地址
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
  }

  getCpuInfo() {
    const cpus = os.cpus();
    const cpuInfo = cpus.reduce(
      (info: any, cpu) => {
        info.cpuNum += 1;
        info.idle += cpu.times.idle;
        info.total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
        return info;
      },
      { idle: 0, total: 0, cpuNum: 0 }
    );
    const cpu = {
      cpuNum: cpuInfo.cpuNum,
      usage: ((1 - cpuInfo.idle / cpuInfo.total) * 100).toFixed(2)
    };
    return cpu;
  }

  getMemInfo() {
    // 获取总内存
    const totalMemory = os.totalmem();
    // 获取空闲内存
    const freeMemory = os.freemem();
    // 已用内存 = 总内存 - 空闲内存
    const usedMemory = totalMemory - freeMemory;
    const mem = {
      total: this.bytesToGB(totalMemory),
      used: this.bytesToGB(usedMemory),
      usage: ((usedMemory / totalMemory) * 100).toFixed(2)
    };
    return mem;
  }

  /**
   * 将字节转换为GB。
   * @param bytes {number} 要转换的字节数。
   * @returns {string} 返回转换后的GB数，保留两位小数。
   */
  bytesToGB(bytes) {
    // 计算字节到GB的转换率
    const gb = bytes / (1024 * 1024 * 1024);
    // 将结果四舍五入到小数点后两位
    return gb.toFixed(2);
  }
}
