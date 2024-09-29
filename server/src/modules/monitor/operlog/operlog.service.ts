import { Injectable } from '@nestjs/common';
import { CreateOperlogDto } from './dto/create-operlog.dto';

@Injectable()
export class OperlogService {
  create(createOperlogDto: CreateOperlogDto) {
    console.log('🚀 ~ OperlogService ~ create ~ createOperlogDto:', createOperlogDto);
    return 'This action adds a new operlog';
  }

  findAll() {
    return `This action returns all operlog`;
  }

  findOne(id: number) {
    return `This action returns a #${id} operlog`;
  }

  remove(id: number) {
    return `This action removes a #${id} operlog`;
  }
}
